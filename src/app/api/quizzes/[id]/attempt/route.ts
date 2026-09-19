import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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

    const { data: attempt, error } = await supabase
      .from('quiz_attempts')
      .insert({
        quiz_id: quizId, selected_answer, is_correct,
        time_spent_seconds: time_spent_seconds || null,
      })
      .select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update progress for the quiz's topic
    const { data: quiz } = await supabase
      .from('quizzes').select('topic_id').eq('id', quizId).single();

    if (quiz?.topic_id) {
      const { data: existing } = await supabase
        .from('progress').select('*').eq('topic_id', quiz.topic_id).single();

      if (existing) {
        const totalAttempts = existing.total_attempts + 1;
        const correctAttempts = existing.correct_attempts + (is_correct ? 1 : 0);
        const masteryScore = correctAttempts / totalAttempts;
        const baseInterval = masteryScore >= 0.8 ? 7 : masteryScore >= 0.6 ? 3 : 1;
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + baseInterval);

        await supabase.from('progress').update({
          total_attempts: totalAttempts, correct_attempts: correctAttempts,
          mastery_score: masteryScore, last_studied: new Date().toISOString(),
          next_review: nextReview.toISOString(), updated_at: new Date().toISOString(),
        }).eq('topic_id', quiz.topic_id);
      } else {
        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + 1);
        await supabase.from('progress').insert({
          topic_id: quiz.topic_id, total_attempts: 1,
          correct_attempts: is_correct ? 1 : 0, mastery_score: is_correct ? 1.0 : 0.0,
          last_studied: new Date().toISOString(), next_review: nextReview.toISOString(),
        });
      }
    }

    return NextResponse.json(attempt);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
