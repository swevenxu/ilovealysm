import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface TopicRow {
  id: string;
  name: string;
  color: string | null;
}

interface LatestAttempt {
  topic_id: string | null;
  is_correct: boolean;
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({
      topics: [], totalAttempts: 0, totalCorrect: 0, overallMastery: 0,
      streakDays: 0, studiedToday: false, dueForReview: 0,
    });
  }

  try {
    const [topicsRes, questionsRes, attemptsRes, recentRes] = await Promise.all([
      supabase.from('topics').select('id, name, color').order('name'),
      supabase.from('questions').select('id, topic_id'),
      supabase
        .from('attempt_log')
        .select('question_id, is_correct, answered_at')
        .order('answered_at', { ascending: false }),
      supabase
        .from('attempt_log')
        .select('answered_at')
        .order('answered_at', { ascending: false })
        .limit(500),
    ]);

    const topics: TopicRow[] = (topicsRes.data as TopicRow[]) || [];
    const questions = questionsRes.data || [];
    const attempts = attemptsRes.data || [];
    const recentAttempts = recentRes.data || [];

    // Map question_id -> topic_id
    const qToTopic = new Map<string, string | null>();
    for (const q of questions) qToTopic.set(q.id, q.topic_id);

    // Latest attempt per question (first row wins — ordered DESC)
    const latest = new Map<string, LatestAttempt>();
    for (const a of attempts) {
      if (latest.has(a.question_id)) continue;
      latest.set(a.question_id, {
        topic_id: qToTopic.get(a.question_id) ?? null,
        is_correct: a.is_correct,
      });
    }

    // Aggregate per topic
    const perTopic = new Map<string, { attempted: number; correct: number }>();
    for (const { topic_id, is_correct } of latest.values()) {
      if (!topic_id) continue;
      const cur = perTopic.get(topic_id) || { attempted: 0, correct: 0 };
      cur.attempted += 1;
      if (is_correct) cur.correct += 1;
      perTopic.set(topic_id, cur);
    }

    // Latest answered_at per topic
    const latestAnsweredByTopic = new Map<string, string>();
    for (const a of attempts) {
      const tid = qToTopic.get(a.question_id) ?? null;
      if (!tid) continue;
      if (!latestAnsweredByTopic.has(tid)) {
        latestAnsweredByTopic.set(tid, a.answered_at);
      }
    }

    const topicSummaries = topics.map((t) => {
      const stats = perTopic.get(t.id) || { attempted: 0, correct: 0 };
      const mastery = stats.attempted === 0 ? 0 : stats.correct / stats.attempted;
      return {
        topic_id: t.id,
        topic_name: t.name,
        topic_color: t.color || '#3b82f6',
        mastery_score: mastery,
        total_attempts: stats.attempted,
        correct_attempts: stats.correct,
        wrong_count: stats.attempted - stats.correct,
        last_studied: latestAnsweredByTopic.get(t.id) || null,
        next_review: null,
      };
    });

    const totalAttempts = topicSummaries.reduce((s, t) => s + t.total_attempts, 0);
    const totalCorrect = topicSummaries.reduce((s, t) => s + t.correct_attempts, 0);
    const overallMastery = totalAttempts === 0 ? 0 : totalCorrect / totalAttempts;

    // Streak from attempt_log
    const now = new Date();
    const dayStrings = new Set(
      recentAttempts.map((a) => new Date(a.answered_at).toDateString()),
    );
    let streakDays = 0;
    if (dayStrings.has(now.toDateString())) {
      streakDays = 1;
      const cursor = new Date(now);
      cursor.setDate(cursor.getDate() - 1);
      while (dayStrings.has(cursor.toDateString())) {
        streakDays++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    return NextResponse.json({
      topics: topicSummaries,
      totalAttempts,
      totalCorrect,
      overallMastery,
      streakDays,
      studiedToday: streakDays > 0,
      dueForReview: topicSummaries.reduce((s, t) => s + t.wrong_count, 0),
    });
  } catch (error: any) {
    console.error('progress error:', error);
    return NextResponse.json({
      topics: [], totalAttempts: 0, totalCorrect: 0, overallMastery: 0,
      streakDays: 0, studiedToday: false, dueForReview: 0,
    });
  }
}