'use client';

import { useState, useEffect } from 'react';
import type { DashboardStats, SubjectMastery } from '@/types';

function masteryTone(mastery: number, attemptCount: number) {
  if (attemptCount === 0) return 'var(--text-muted)';
  if (mastery >= 0.8) return 'var(--accent-emerald)';
  if (mastery >= 0.5) return 'var(--accent-amber)';
  return 'var(--accent-rose)';
}

function masteryFill(mastery: number, attemptCount: number) {
  if (attemptCount === 0) return 'var(--bg-elevated)';
  if (mastery >= 0.8) {
    return 'linear-gradient(90deg, var(--accent-emerald) 0%, #34d399 100%)';
  }
  if (mastery >= 0.5) {
    return 'linear-gradient(90deg, var(--accent-amber) 0%, #fbbf24 100%)';
  }
  return 'linear-gradient(90deg, var(--accent-rose) 0%, #f87171 100%)';
}

function subjectDetail(subject: SubjectMastery) {
  if (subject.attemptCount === 0) {
    return subject.quizCount > 0
      ? `${subject.quizCount} quiz question${subject.quizCount === 1 ? '' : 's'} ready`
      : 'No quizzes generated yet';
  }
  return `${subject.correctCount} of ${subject.attemptCount} quiz answers correct`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    subjects: [],
    weakSubjects: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await fetch('/api/dashboard', { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="grid grid-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="glass-card stat-card animate-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="skeleton" style={{ width: 48, height: 16, borderRadius: 'var(--radius-sm)' }} />
              <div className="skeleton" style={{ width: '40%', height: 36, marginTop: 16 }} />
              <div className="skeleton" style={{ width: '80%', height: 14, marginTop: 8 }} />
              <div className="skeleton" style={{ width: '100%', height: 8, marginTop: 16, borderRadius: 'var(--radius-full)' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 'var(--space-8)' }}>
        {stats.subjects.map((subject) => {
          const percent = Math.round(subject.mastery * 100);
          return (
            <div key={subject.code} className="glass-card stat-card animate-in">
              <div className="stat-label" style={{ marginTop: 0 }}>{subject.code}</div>
              <div
                className="stat-value"
                style={{ color: masteryTone(subject.mastery, subject.attemptCount) }}
              >
                {percent}%
              </div>
              <div
                className="stat-label"
                style={{
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  lineHeight: 1.25,
                  overflowWrap: 'anywhere',
                }}
              >
                {subject.name}
              </div>
              <div className="progress-bar-track" style={{ marginTop: 'var(--space-4)' }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${subject.attemptCount > 0 ? percent : 0}%`,
                    background: masteryFill(subject.mastery, subject.attemptCount),
                  }}
                />
              </div>
              <div className="stat-detail" style={{ marginTop: 'var(--space-3)' }}>
                {subjectDetail(subject)}
              </div>
            </div>
          );
        })}
      </div>

      {stats.weakSubjects.length > 0 && (
        <div className="animate-in animate-in-5">
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Subjects to Review</h2>
          <div className="grid grid-3">
            {stats.weakSubjects.map((subject) => (
              <div key={subject.code} className="glass-card" style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                    {subject.code} · {subject.name}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    {Math.round(subject.mastery * 100)}%
                  </span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${subject.mastery * 100}%`,
                      background: masteryFill(subject.mastery, subject.attemptCount),
                    }}
                  />
                </div>
                <div className="stat-detail" style={{ marginTop: 'var(--space-2)' }}>
                  {subject.correctCount}/{subject.attemptCount} correct
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}