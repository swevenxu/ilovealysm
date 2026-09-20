import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function questionHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  try {
    const { id: quizId } = await params;
    const body = await request.json();
    const { selected_answer, is_correct, time_spent_seconds } = body;

    if (typeof is_correct !== 'boolean') {
      return NextResponse.json({ error: 'is_correct is required' }, { status: 400 });
    }

    // 1. Load the quiz so we can snapshot it into `questions`.
    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .single();

    if (quizError || !quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const qHash = questionHash(quiz.question);

    // 2. Upsert the snapshot (idempotent by hash).
    const { error: upsertError } = await supabase
      .from('questions')
      .upsert(
        {
          id: qHash,
          topic_id: quiz.topic_id,
          question_text: quiz.question,
          format: quiz.format,
          options: quiz.options,
          correct_answer: quiz.answer,
          explanation: quiz.explanation,
          difficulty: quiz.difficulty,
          stem: quiz.stem,
          sub_questions: quiz.sub_questions,
          is_testlet: quiz.is_testlet,
          source_quote: quiz.source_quote,
        },
        { onConflict: 'id' },
      );

    if (upsertError) {
      console.error('Question upsert error:', upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // 3. Append the attempt.
    const { data: attempt, error: attemptError } = await supabase
      .from('attempt_log')
      .insert({
        question_id: qHash,
        selected_answer,
        is_correct,
        time_spent_seconds: time_spent_seconds || null,
      })
      .select()
      .single();

    if (attemptError) {
      console.error('Attempt log insert error:', attemptError);
      return NextResponse.json({ error: attemptError.message }, { status: 500 });
    }

    // 4. Keep quiz_attempts in sync for backward compat (streak etc.).
    //    Remove this block once nothing else reads quiz_attempts.
    await supabase.from('quiz_attempts').insert({
      quiz_id: quizId,
      selected_answer,
      is_correct,
      time_spent_seconds: time_spent_seconds || null,
    });

    return NextResponse.json(attempt);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}