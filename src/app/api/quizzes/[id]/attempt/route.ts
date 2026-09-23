import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { questionHash } from '@/lib/question-hash';
import { validateBody, quizAttemptSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

interface AttemptResult {
  attempt_id: string;
  question_id: string;
  is_correct: boolean;
  correct_answer: string | null;
  explanation: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const parsed = await validateBody(request, quizAttemptSchema);
  if (!parsed.valid) return NextResponse.json({ error: parsed.errors.join(', ') }, { status: 400 });

  try {
    const { id: quizId } = await params;
    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .select('question')
      .eq('id', quizId)
      .single();

    if (quizError || !quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });

    const { data, error } = await supabase.rpc('record_quiz_attempt', {
      p_quiz_id: quizId,
      p_question_id: questionHash(quiz.question),
      p_selected_answer: parsed.data.selected_answer,
      p_idempotency_key: parsed.data.idempotency_key,
      p_time_spent_seconds: parsed.data.time_spent_seconds ?? null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const attempt = (data || [])[0] as AttemptResult | undefined;
    if (!attempt) return NextResponse.json({ error: 'Attempt could not be recorded' }, { status: 500 });

    // Reveal data is only returned AFTER the answer has been recorded.
    return NextResponse.json({
      attempt_id: attempt.attempt_id,
      question_id: attempt.question_id,
      is_correct: attempt.is_correct,
      correct_answer: attempt.correct_answer,
      explanation: attempt.explanation,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not record attempt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
