import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { errorResponse, handleError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface QuizWithRelations {
  id: string;
  file_id: string | null;
  topic_id: string | null;
  question: string;
  format: string;
  options: unknown;
  answer: string;
  explanation: string | null;
  source_page: number | null;
  stem: string | null;
  sub_questions: unknown;
  is_testlet: boolean;
  difficulty: string;
  source_quote: string | null;
  created_at: string;
  files: { filename: string } | { filename: string }[] | null;
  topics: { name: string; icon: string } | { name: string; icon: string }[] | null;
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ quizzes: [] });

  try {
    const { data: quizzes, error } = await supabase
      .from('quizzes')
      .select(`
        id, file_id, topic_id, question, format, options, answer, explanation,
        source_page, stem, sub_questions, is_testlet, difficulty, source_quote, created_at,
        files:file_id(filename),
        topics:topic_id(name, icon)
      `)
      .order('created_at', { ascending: false });

    if (error) return errorResponse(error.message, 500);

    const typedQuizzes = (quizzes || []) as QuizWithRelations[];
    const shaped = typedQuizzes.map((q) => {
      const file = Array.isArray(q.files) ? q.files[0] : q.files;
      const topic = Array.isArray(q.topics) ? q.topics[0] : q.topics;
      const { files: _, topics: __, ...rest } = q;
      return { ...rest, file, topic };
    });

    return NextResponse.json(
      { quizzes: shaped },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}
