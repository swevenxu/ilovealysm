import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { PINNACLE_SUBJECTS } from '@/lib/pinnacle';
import type { DashboardStats, SubjectMastery } from '@/types';

export const dynamic = 'force-dynamic';

const emptyDashboard: DashboardStats = {
  subjects: PINNACLE_SUBJECTS.map((subject) => ({
    code: subject.code,
    name: subject.name,
    quizCount: 0,
    attemptCount: 0,
    correctCount: 0,
    mastery: 0,
  })),
  weakSubjects: [],
};

interface TopicRow {
  id: string;
  name: string;
}

interface QuestionRow {
  id: string;
  topic_id: string | null;
}

interface AttemptRow {
  question_id: string;
  is_correct: boolean;
  answered_at: string;
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json(emptyDashboard);

  try {
    const [topicsRes, questionsRes, attemptsRes, quizzesRes] = await Promise.all([
      supabase.from('topics').select('id, name'),
      supabase.from('questions').select('id, topic_id'),
      supabase
        .from('attempt_log')
        .select('question_id, is_correct, answered_at')
        .order('answered_at', { ascending: false }),
      supabase.from('quizzes').select('topic_id'),
    ]);

    if (topicsRes.error) {
      console.error('Dashboard API error:', topicsRes.error);
      return NextResponse.json(emptyDashboard);
    }

    const topics = (topicsRes.data as TopicRow[]) || [];
    const questions = (questionsRes.data as QuestionRow[]) || [];
    const attempts = (attemptsRes.data as AttemptRow[]) || [];
    const quizzes = (quizzesRes.data as { topic_id: string | null }[]) || [];

    // topic id -> name (for PINNACLE_SUBJECTS matching)
    const topicNameById = new Map<string, string>();
    for (const t of topics) topicNameById.set(t.id, t.name);

    // question id -> topic_id
    const qToTopic = new Map<string, string | null>();
    for (const q of questions) qToTopic.set(q.id, q.topic_id);

    // latest attempt per question (first row wins, ordered DESC by answered_at)
    const latest = new Map<string, { topic_id: string | null; is_correct: boolean }>();
    for (const a of attempts) {
      if (latest.has(a.question_id)) continue;
      latest.set(a.question_id, {
        topic_id: qToTopic.get(a.question_id) ?? null,
        is_correct: a.is_correct,
      });
    }

    // aggregate attempted / correct per topic_id
    const perTopic = new Map<string, { attempted: number; correct: number }>();
    for (const { topic_id, is_correct } of latest.values()) {
      if (!topic_id) continue;
      const cur = perTopic.get(topic_id) || { attempted: 0, correct: 0 };
      cur.attempted += 1;
      if (is_correct) cur.correct += 1;
      perTopic.set(topic_id, cur);
    }

    // quiz count per topic_id
    const quizCountByTopic = new Map<string, number>();
    for (const q of quizzes) {
      if (!q.topic_id) continue;
      quizCountByTopic.set(q.topic_id, (quizCountByTopic.get(q.topic_id) || 0) + 1);
    }

    // topic id -> aggregate stats
    const statsByTopicName = new Map<
      string,
      { attempted: number; correct: number; quizCount: number }
    >();
    for (const t of topics) {
      const s = perTopic.get(t.id) || { attempted: 0, correct: 0 };
      statsByTopicName.set(t.name, {
        attempted: s.attempted,
        correct: s.correct,
        quizCount: quizCountByTopic.get(t.id) || 0,
      });
    }

    const subjects: SubjectMastery[] = PINNACLE_SUBJECTS.map((subject) => {
      const stats = statsByTopicName.get(subject.name) || {
        attempted: 0,
        correct: 0,
        quizCount: 0,
      };
      const mastery = stats.attempted === 0 ? 0 : stats.correct / stats.attempted;
      return {
        code: subject.code,
        name: subject.name,
        quizCount: stats.quizCount,
        attemptCount: stats.attempted,
        correctCount: stats.correct,
        mastery,
      };
    });

    const weakSubjects = subjects
      .filter((s) => s.attemptCount > 0 && s.mastery < 0.7)
      .sort((a, b) => a.mastery - b.mastery);

    return NextResponse.json({ subjects, weakSubjects } satisfies DashboardStats);
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(emptyDashboard);
  }
}