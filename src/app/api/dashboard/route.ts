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

interface TopicDashboardRow {
  id: string;
  name: string;
  progress:
    | { mastery_score: number; total_attempts: number; correct_attempts: number }
    | { mastery_score: number; total_attempts: number; correct_attempts: number }[]
    | null;
  quizzes: { id: string }[] | null;
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json(emptyDashboard);
  }

  try {
    const { data: topics, error } = await supabase
      .from('topics')
      .select('id, name, progress(mastery_score, total_attempts, correct_attempts), quizzes(id)');

    if (error) {
      console.error('Dashboard API error:', error);
      return NextResponse.json(emptyDashboard);
    }

    const topicByName = new Map(
      ((topics || []) as TopicDashboardRow[]).map((topic) => [topic.name, topic])
    );

    const subjects: SubjectMastery[] = PINNACLE_SUBJECTS.map((subject) => {
      const topic = topicByName.get(subject.name);
      const progressRaw = topic?.progress;
      const progress = Array.isArray(progressRaw) ? progressRaw[0] : progressRaw;
      const quizCount = topic?.quizzes?.length || 0;
      const attemptCount = progress?.total_attempts || 0;
      const correctCount = progress?.correct_attempts || 0;

      return {
        code: subject.code,
        name: subject.name,
        quizCount,
        attemptCount,
        correctCount,
        mastery: attemptCount > 0
          ? (progress?.mastery_score ?? correctCount / attemptCount)
          : 0,
      };
    });

    const weakSubjects = subjects
      .filter((subject) => subject.attemptCount > 0 && subject.mastery < 0.7)
      .sort((a, b) => a.mastery - b.mastery);

    return NextResponse.json({ subjects, weakSubjects } satisfies DashboardStats);
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(emptyDashboard);
  }
}
