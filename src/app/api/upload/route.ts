import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { errorResponse, handleError } from '@/lib/api-utils';
import type { UploadResponse } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return errorResponse('Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and key in .env.local', 503);
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return errorResponse('No file provided', 400);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const supportedTypes = ['pdf', 'docx', 'pptx', 'txt', 'md', 'jpg', 'jpeg', 'png'];
    if (!supportedTypes.includes(ext)) {
      return errorResponse(`Unsupported file type: .${ext}`, 400);
    }

    const storagePath = `uploads/${Date.now()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: storageError } = await supabase.storage
      .from('study-files').upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (storageError) {
      return errorResponse(`Storage upload failed: ${storageError.message}`, 500);
    }

    const { data: fileRecord, error: dbError } = await supabase
      .from('files').insert({
        filename: file.name, file_type: ext, storage_path: storagePath,
        file_size_bytes: file.size, verification_status: 'pending', processing_status: 'pending',
      }).select().single();

    if (dbError) {
      return errorResponse(`Database error: ${dbError.message}`, 500);
    }

    return NextResponse.json(fileRecord as UploadResponse);
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message || 'Upload failed', 500);
  }
}
