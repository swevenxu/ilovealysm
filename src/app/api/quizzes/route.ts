import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { errorResponse, handleError } from '@/lib/api-utils';
import { questionHash } from '@/lib/question-hash';
import { isMultipleChoiceOptions } from '@/lib/mcq';

export const dynamic = 'force-dynamic';

interface QuizWithRelations {
  id: string;
  file_id: string | null;
  topic_id: string | null;
  question: string;
  format: string;
  options: unknown;
  source_page: number | null;
  stem: string | null;
  sub_questions: unknown;
  is_testlet: boolean;
  difficulty: string;
  created_at: string;
  files: { filename: string } | { filename: string }[] | null;
  topics: { name: string; icon: string } | { name: string; icon: string }[] | null;
}

interface AttemptLogRow {
  question_id: string;
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ quizzes: [] });

  try {
    // NOTE: answer/explanation are intentionally NOT selected so the correct
    // answer never reaches the browser before the user has answered. Reveal
    // data is returned by the attempt POST endpoint after an answer is locked in.
    const { data: quizzes, error: quizzesError } = await supabase
      .from('quizzes')
      .select(`
        id, file_id, topic_id, question, format, options,
        source_page, stem, sub_questions, is_testlet, difficulty, created_at,
        files:file_id(filename),
        topics:topic_id(name, icon)
        `)
      .is('file_id', null)
      .eq('format', 'multiple_choice')
      .order('created_at', { ascending: false });

    if (quizzesError) return errorResponse(quizzesError.message, 500);

    const typedQuizzes = (quizzes || []) as QuizWithRelations[];
    const questionIds = typedQuizzes.map((quiz) => questionHash(quiz.question));
    const { data: attempts, error: attemptsError } = questionIds.length > 0
      ? await supabase.from('attempt_log').select('question_id').in('question_id', questionIds)
      : { data: [], error: null };

    if (attemptsError) return errorResponse(attemptsError.message, 500);

    const answeredQuestionIds = new Set(
      ((attempts || []) as AttemptLogRow[]).map((attempt) => attempt.question_id),
    );
    const shaped = typedQuizzes.filter(
      (quiz) => isMultipleChoiceOptions(quiz.options)
        && !answeredQuestionIds.has(questionHash(quiz.question)),
    ).map((q) => {
      const { files, topics, ...rest } = q;
      const file = Array.isArray(files) ? files[0] : files;
      const topic = Array.isArray(topics) ? topics[0] : topics;
      return {
        ...rest,
        options: (rest.options as { label: string; text: string; is_correct: boolean }[]).map(
          ({ label, text }) => ({ label, text }),
        ),
        file,
        topic,
      };
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
