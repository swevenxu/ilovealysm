import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({
      topics: [], totalAttempts: 0, totalCorrect: 0, overallMastery: 0,
      streakDays: 0, studiedToday: false, dueForReview: 0,
    });
  }

  try {
    const [{ data: progressData }, { data: recentAttempts }] = await Promise.all([
      supabase
        .from('progress')
        .select(`
          id, topic_id, mastery_score, total_attempts, correct_attempts,
          last_studied, next_review, updated_at,
          topics:topic_id(name, color)
        `)
        .order('mastery_score', { ascending: true }),
      supabase
        .from('quiz_attempts').select('answered_at')
        .order('answered_at', { ascending: false }).limit(100),
    ]);

    const topics = (progressData || []).map((p: any) => ({
      ...p,
      topic_name: p.topics?.name || 'Unknown',
      topic_color: p.topics?.color || '#3b82f6',
      topics: undefined,
    }));

    const totalAttempts = topics.reduce((sum: number, t: any) => sum + (t.total_attempts || 0), 0);
    const totalCorrect = topics.reduce((sum: number, t: any) => sum + (t.correct_attempts || 0), 0);
    const overallMastery = topics.length > 0
      ? topics.reduce((sum: number, t: any) => sum + (t.mastery_score || 0), 0) / topics.length : 0;

    const now = new Date();
    const dueForReview = topics.filter((t: any) => t.next_review && new Date(t.next_review) <= now).length;

    let streakDays = 0;
    if (recentAttempts && recentAttempts.length > 0) {
      const dates = new Set(recentAttempts.map((a: any) => new Date(a.answered_at).toDateString()));
      const today = new Date();
      const checkDate = new Date(today);
      if (dates.has(today.toDateString())) {
        streakDays = 1;
        checkDate.setDate(checkDate.getDate() - 1);
        while (dates.has(checkDate.toDateString())) { streakDays++; checkDate.setDate(checkDate.getDate() - 1); }
      }
    }

    return NextResponse.json({
      topics, totalAttempts, totalCorrect, overallMastery,
      streakDays, studiedToday: streakDays > 0, dueForReview,
    });
  } catch (error: any) {
    return NextResponse.json({
      topics: [], totalAttempts: 0, totalCorrect: 0, overallMastery: 0,
      streakDays: 0, studiedToday: false, dueForReview: 0,
    });
  }
}
