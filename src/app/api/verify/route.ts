import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { errorResponse, handleError, validateRequired } from '@/lib/api-utils';
import type { VerificationReport, ExtractedPage } from '@/types';

export const dynamic = 'force-dynamic';

const EXTRACTOR_URL = process.env.PYTHON_EXTRACTOR_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return errorResponse('Supabase not configured', 503);
  }

  try {
    const body = await request.json() as { fileId?: string };
    const validation = validateRequired(body, ['fileId']);
    
    if (!validation.valid) {
      return errorResponse(`Missing required fields: ${validation.missing.join(', ')}`, 400);
    }

    const { fileId } = body;

    const { data: fileRecord, error: fetchError } = await supabase
      .from('files').select('*').eq('id', fileId).single();
    if (fetchError || !fileRecord) return errorResponse('File not found', 404);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('study-files').download(fileRecord.storage_path);
    if (downloadError || !fileData) {
      return errorResponse(`Download failed: ${downloadError?.message}`, 500);
    }

    const formData = new FormData();
    formData.append('file', fileData, fileRecord.filename);

    const verifyRes = await fetch(`${EXTRACTOR_URL}/verify`, { method: 'POST', body: formData });

    if (!verifyRes.ok) {
      const errorText = await verifyRes.text();
      await supabase.from('files').update({
        verification_status: 'corrupted', verification_report: { error: errorText },
      }).eq('id', fileId);
      return NextResponse.json(
        { status: 'corrupted', message: 'Verification failed', error: errorText },
        { status: 422 }
      );
    }

    const report = await verifyRes.json() as VerificationReport;
    await supabase.from('files').update({
      verification_status: report.status, verification_report: report, page_count: report.page_count,
    }).eq('id', fileId);

    if (report.status === 'readable' || report.status === 'needs_ocr') {
      const extractForm = new FormData();
      extractForm.append('file', fileData, fileRecord.filename);
      const extractRes = await fetch(`${EXTRACTOR_URL}/extract`, { method: 'POST', body: extractForm });

      if (extractRes.ok) {
        const extracted = await extractRes.json() as { pages: ExtractedPage[] };
        const pageRows = extracted.pages.map((page) => ({
          file_id: fileId, page_number: page.page_number,
          raw_text: page.text, extraction_method: page.extraction_method,
        }));
        if (pageRows.length > 0) {
          await supabase.from('pages').upsert(pageRows, { onConflict: 'file_id,page_number' });
        }
        await supabase.from('files').update({ processing_status: 'completed' }).eq('id', fileId);
      }
    }

    return NextResponse.json(report);
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message || 'Verification failed', 500);
  }
}
