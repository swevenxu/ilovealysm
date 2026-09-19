'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Target,
  Flame,
  Calendar,
  Award,
  BarChart3,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface TopicProgress {
  id: string;
  topic_id: string;
  topic_name: string;
  topic_color: string;
  mastery_score: number;
  total_attempts: number;
  correct_attempts: number;
  last_studied: string | null;
  next_review: string | null;
}

interface ProgressStats {
  topics: TopicProgress[];
  totalAttempts: number;
  totalCorrect: number;
  overallMastery: number;
  streakDays: number;
  studiedToday: boolean;
  dueForReview: number;
}

export default function ProgressPage() {
  const [stats, setStats] = useState<ProgressStats>({
    topics: [],
    totalAttempts: 0,
    totalCorrect: 0,
    overallMastery: 0,
    streakDays: 0,
    studiedToday: false,
    dueForReview: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProgress() {
      try {
        const res = await fetch('/api/progress', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to load progress:', error);
      } finally {
        setLoading(false);
      }
    }
    loadProgress();
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Progress Tracker</h1>
      </div>

      <div className="grid grid-4 animate-in animate-in-1" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="glass-card stat-card"><div className="stat-value">{stats.streakDays}</div><div className="stat-label">Day Streak</div></div>
        <div className="glass-card stat-card"><div className="stat-value">{stats.totalAttempts}</div><div className="stat-label">Total Attempts</div></div>
        <div className="glass-card stat-card"><div className="stat-value">{stats.totalAttempts > 0 ? Math.round((stats.totalCorrect / stats.totalAttempts) * 100) : 0}%</div><div className="stat-label">Accuracy</div></div>
        <div className="glass-card stat-card"><div className="stat-value">{stats.dueForReview}</div><div className="stat-label">Due for Review</div></div>
      </div>

      {/* Overall Mastery + Topics */}
      <div className="progress-split-layout" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        <div className="glass-card animate-in animate-in-2" style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
            Overall Mastery
          </h3>
          <div className="mastery-value" style={{ fontSize: 'var(--text-5xl)', marginBottom: 'var(--space-5)' }}>
            {Math.round(stats.overallMastery * 100)}%
          </div>
          <div className="progress-bar-track" style={{ width: '100%' }}>
            <div className="progress-bar-fill" style={{ width: `${stats.overallMastery * 100}%` }} />
          </div>
          <div style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
            {stats.topics.length} topic{stats.topics.length !== 1 ? 's' : ''} tracked
          </div>
        </div>

        {/* Topics List */}
        <div className="glass-card animate-in animate-in-3" style={{ padding: 'var(--space-6)' }}>
          <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-5)' }}>Topic Mastery</h3>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 8 }} />
                    <div className="skeleton" style={{ width: '100%', height: 8, borderRadius: 'var(--radius-full)' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : stats.topics.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-title">No progress data yet</div>
              <div className="empty-state-description">
                Take some quizzes to start tracking your mastery
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {stats.topics
                .sort((a, b) => a.mastery_score - b.mastery_score)
                .map((topic) => (
                  <div key={topic.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                          {topic.topic_name}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {Math.round(topic.mastery_score * 100)}% · {topic.correct_attempts}/{topic.total_attempts}
                        </span>
                      </div>
                      <div className="progress-bar-track">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${topic.mastery_score * 100}%`,
                            background: topic.mastery_score >= 0.8
                              ? 'linear-gradient(90deg, var(--accent-emerald) 0%, #34d399 100%)'
                              : topic.mastery_score >= 0.5
                                ? 'linear-gradient(90deg, var(--accent-amber) 0%, #fbbf24 100%)'
                                : 'linear-gradient(90deg, var(--accent-rose) 0%, #f87171 100%)',
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-1)' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          {topic.last_studied ? `Last: ${new Date(topic.last_studied).toLocaleDateString()}` : 'Never studied'}
                        </span>
                        {topic.next_review && new Date(topic.next_review) <= new Date() && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-amber)', fontWeight: 600 }}>
                            Due for review
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
