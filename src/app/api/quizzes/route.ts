import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { errorResponse, handleError } from '@/lib/api-utils';
import crypto from 'crypto';

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

interface AttemptLogRow {
  question_id: string;
}

function questionHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ quizzes: [] });

  try {
    const [quizzesResult, attemptsResult] = await Promise.all([
      supabase
        .from('quizzes')
        .select(`
        id, file_id, topic_id, question, format, options, answer, explanation,
        source_page, stem, sub_questions, is_testlet, difficulty, source_quote, created_at,
        files:file_id(filename),
        topics:topic_id(name, icon)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('attempt_log').select('question_id'),
    ]);

    if (quizzesResult.error) return errorResponse(quizzesResult.error.message, 500);
    if (attemptsResult.error) return errorResponse(attemptsResult.error.message, 500);

    const answeredQuestionIds = new Set(
      ((attemptsResult.data || []) as AttemptLogRow[]).map((attempt) => attempt.question_id),
    );
    const typedQuizzes = (quizzesResult.data || []) as QuizWithRelations[];
    const shaped = typedQuizzes.filter(
      (quiz) => !answeredQuestionIds.has(questionHash(quiz.question)),
    ).map((q) => {
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
