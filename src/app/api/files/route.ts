import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { errorResponse, handleError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ files: [] });

  try {
    const { data: files, error } = await supabase
      .from('files')
      .select('id, filename, file_type, upload_date, verification_status, page_count, file_size_bytes, processing_status')
      .order('upload_date', { ascending: false });

    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ files: files || [] });
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}
