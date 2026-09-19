import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, TopicRecord } from '@/lib/supabase';
import { errorResponse, handleError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface FileTopicJoin {
  topics: TopicRecord | TopicRecord[] | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase();
  if (!supabase) return errorResponse('Not configured', 503);

  try {
    const { id } = await params;
    const { data: file, error } = await supabase.from('files').select('*').eq('id', id).single();
    if (error || !file) return errorResponse('File not found', 404);

    const { data: pages } = await supabase.from('pages').select('id, page_number, raw_text, extraction_method')
      .eq('file_id', id).order('page_number');
    const { data: quizzes } = await supabase.from('quizzes').select('id, question, format, difficulty')
      .eq('file_id', id);
    const { data: fileTopics } = await supabase.from('file_topics').select('topics(id, name, color, icon)')
      .eq('file_id', id);

    const typedFileTopics = (fileTopics || []) as FileTopicJoin[];
    const topics = typedFileTopics
      .map((ft) => (Array.isArray(ft.topics) ? ft.topics[0] : ft.topics))
      .filter((t): t is TopicRecord => t !== null);

    return NextResponse.json({ ...file, pages: pages || [], quizzes: quizzes || [], topics });
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase();
  if (!supabase) return errorResponse('Not configured', 503);

  try {
    const { id } = await params;
    const { data: file } = await supabase.from('files').select('storage_path').eq('id', id).single();
    if (file?.storage_path) await supabase.storage.from('study-files').remove([file.storage_path]);
    await supabase.from('files').delete().eq('id', id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}
