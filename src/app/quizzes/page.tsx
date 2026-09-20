'use client';

import { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface Quiz {
  id: string;
  file_id: string;
  topic_id: string | null;
  question: string;
  format: 'multiple_choice' | 'flashcard';
  options: { label: string; text: string; is_correct: boolean }[] | null;
  answer: string;
  explanation: string | null;
  source_page: number | null;
  stem: string | null;
  sub_questions: { number: number; text: string }[] | null;
  is_testlet: boolean;
  difficulty: string;
  topic?: { name: string; icon: string };
  file?: { filename: string };
}

const SESSION_QUESTION_COUNT = 10;

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionQuizzes, setSessionQuizzes] = useState<Quiz[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flashcardReadyId, setFlashcardReadyId] = useState<string | null>(null);
  const [sessionResults, setSessionResults] = useState<{ quizId: string; correct: boolean }[]>([]);
  const [previewFlipIds, setPreviewFlipIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadQuizzes() {
      try {
        const res = await fetch(`/api/quizzes?refresh=${Date.now()}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          setQuizzes(data.quizzes || []);
        }
      } catch (error) {
        console.error('Failed to load quizzes:', error);
      } finally {
        setLoading(false);
      }
    }

    void loadQuizzes();
  }, []);

  useEffect(() => {
    const flashcard = sessionQuizzes[currentIndex];
    if (!sessionActive || flashcard?.format !== 'flashcard') {
      return;
    }

    const frame = requestAnimationFrame(() => setFlashcardReadyId(flashcard.id));
    return () => cancelAnimationFrame(frame);
  }, [currentIndex, sessionActive, sessionQuizzes]);

  const filteredQuizzes = quizzes.filter((q) => {
    if (filterSubject !== 'all' && q.topic_id !== filterSubject) return false;
    if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false;
    return true;
  });

  const subjects = Array.from(
    new Map(
      quizzes
        .filter((quiz): quiz is Quiz & { topic_id: string; topic: { name: string; icon: string } } =>
          Boolean(quiz.topic_id && quiz.topic),
        )
        .map((quiz) => [quiz.topic_id, quiz.topic]),
    ).entries(),
  )
    .map(([id, topic]) => ({ id, ...topic }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function startSession() {
    // Shuffle
    const shuffled = [...filteredQuizzes].sort(() => Math.random() - 0.5);
    setSessionQuizzes(shuffled.slice(0, SESSION_QUESTION_COUNT));
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setIsFlipped(false);
    setFlashcardReadyId(null);
    setSessionResults([]);
    setSessionActive(true);
  }

  function endSession() {
    setSessionActive(false);
  }

  async function submitAnswer(answer: string) {
    const quiz = sessionQuizzes[currentIndex];
    if (!quiz) return;

    setSelectedAnswer(answer);
    setShowResult(true);

    const isCorrect =
      quiz.format === 'flashcard'
        ? answer === 'correct'
        : quiz.options?.find((o) => o.text === answer)?.is_correct ?? false;

    setSessionResults((prev) => [...prev, { quizId: quiz.id, correct: isCorrect }]);

    // Log attempt
    try {
      const response = await fetch(`/api/quizzes/${quiz.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_answer: answer,
          is_correct: isCorrect,
          time_spent_seconds: 0,
        }),
      });
      if (!response.ok) throw new Error('Failed to save quiz attempt');
      setQuizzes((previous) => previous.filter((item) => item.id !== quiz.id));
    } catch {
      // Keep the question visible if its attempt could not be recorded.
    }
  }

  function nextQuestion() {
    if (currentIndex < sessionQuizzes.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setIsFlipped(false);
      setFlashcardReadyId(null);
    }
  }

  function gradeFlashcard(knewIt: boolean) {
    submitAnswer(knewIt ? 'correct' : 'incorrect');
    nextQuestion();
  }

  const currentQuiz = sessionQuizzes[currentIndex];
  const sessionComplete = currentIndex >= sessionQuizzes.length - 1 && showResult;
  const correctCount = sessionResults.filter((r) => r.correct).length;

  // ===== SESSION VIEW =====
  if (sessionActive) {
    if (!currentQuiz) {
      return (
        <div className="page-container">
          <div className="empty-state glass-card">
            <div className="empty-state-title">No questions available</div>
            <button className="btn btn-primary" onClick={endSession}>Back to Quizzes</button>
          </div>
        </div>
      );
    }

    return (
      <div className="page-container">
        {/* Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <button className="btn btn-ghost" onClick={endSession}>
            <ChevronLeft size={16} /> Exit
          </button>
          <div style={{ flex: 1 }}>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${((currentIndex + (showResult ? 1 : 0)) / sessionQuizzes.length) * 100}%` }}
              />
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {currentIndex + 1}/{sessionQuizzes.length}
          </span>
        </div>

        {/* Session Complete */}
        {sessionComplete && (
          <div className="glass-card animate-in animate-in-1" style={{ padding: 'var(--space-10)', textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Session Complete!
            </h2>
            <p style={{ fontSize: 'var(--text-4xl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: correctCount / sessionResults.length >= 0.8 ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
              {correctCount}/{sessionResults.length}
            </p>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
              {Math.round((correctCount / sessionResults.length) * 100)}% correct
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => startSession()}>
                <RotateCcw size={16} /> Try Again
              </button>
              <button className="btn btn-secondary" onClick={endSession}>
                Back to Quizzes
              </button>
            </div>
          </div>
        )}

        {/* Quiz Card */}
        {!sessionComplete && (
          <>
            {currentQuiz.format === 'multiple_choice' ? (
              <div className="glass-card animate-in animate-in-1" style={{ padding: 'var(--space-8)', maxWidth: 720, margin: '0 auto' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                  <span className="badge badge-processing">Multiple Choice</span>
                  <span className="badge badge-pending">{currentQuiz.difficulty}</span>
                </div>
                <div className="quiz-card-question" style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-6)' }}>
                  {currentQuiz.stem && currentQuiz.is_testlet && (
                    <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>
                      <strong>Shared scenario:</strong>{'\n'}{currentQuiz.stem}
                    </div>
                  )}
                  {currentQuiz.question}
                </div>
                <div>
                  {currentQuiz.options?.map((option, idx) => {
                    const labels = ['A', 'B', 'C', 'D', 'E'];
                    let optionClass = 'quiz-option';
                    if (showResult) {
                      if (option.is_correct) optionClass += ' correct';
                      else if (option.text === selectedAnswer) optionClass += ' incorrect';
                    } else if (option.text === selectedAnswer) {
                      optionClass += ' selected';
                    }

                    return (
                      <div
                        key={idx}
                        className={optionClass}
                        onClick={() => !showResult && submitAnswer(option.text)}
                      >
                        <span className="quiz-option-label">{labels[idx]}</span>
                        <span>{option.text}</span>
                        {showResult && option.is_correct && (
                          <CheckCircle2 size={16} style={{ marginLeft: 'auto', color: 'var(--accent-emerald)' }} />
                        )}
                        {showResult && option.text === selectedAnswer && !option.is_correct && (
                          <XCircle size={16} style={{ marginLeft: 'auto', color: 'var(--accent-rose)' }} />
                        )}
                      </div>
                    );
                  })}
                </div>
                {showResult && currentQuiz.explanation && (
                  <div style={{
                    marginTop: 'var(--space-4)',
                    padding: 'var(--space-4)',
                    background: 'var(--accent-blue-glow)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                  }}>
                    <strong style={{ color: 'var(--accent-blue-light)' }}>Explanation:</strong> {currentQuiz.explanation}
                  </div>
                )}
                {showResult && (
                  <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={nextQuestion}>
                      {currentIndex < sessionQuizzes.length - 1 ? 'Next Question' : 'Finish'} <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Flashcard */
              <div style={{ maxWidth: 600, margin: '0 auto' }}>
                <button
                  type="button"
                  key={currentQuiz.id}
                  className={`flashcard ${isFlipped ? 'flipped' : ''} ${flashcardReadyId === currentQuiz.id ? '' : 'flashcard-no-transition'}`}
                  onClick={() => setIsFlipped(true)}
                  aria-pressed={isFlipped}
                  aria-label={isFlipped ? 'Flashcard answer' : 'Show flashcard answer'}
                >
                  <div className="flashcard-inner">
                    <div className="flashcard-face flashcard-front">
                      <div className="flashcard-label">Question</div>
                      {currentQuiz.stem && currentQuiz.is_testlet && (
                        <div style={{ marginBottom: 'var(--space-4)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap' }}>
                          <strong>Shared scenario:</strong>{'\n'}{currentQuiz.stem}
                        </div>
                      )}
                      <div className="flashcard-text">{currentQuiz.question}</div>
                      <div style={{ marginTop: 'var(--space-6)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        Click to reveal answer
                      </div>
                    </div>
                    <div className="flashcard-face flashcard-back">
                      <div className="flashcard-label">Answer</div>
                      <div className="flashcard-text">
                        {currentQuiz.answer || currentQuiz.explanation || 'No answer saved for this card.'}
                      </div>
                    </div>
                  </div>
                </button>

                {isFlipped && (
                  <div className="animate-in" style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => gradeFlashcard(false)}
                    >
                      <XCircle size={16} /> Didn&apos;t Know
                    </button>
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={() => gradeFlashcard(true)}
                    >
                      <CheckCircle2 size={16} /> Got It!
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ===== LIST VIEW =====
  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Quizzes</h1>
      </div>

      {/* Quick Start */}
      <div className="quiz-quick-start animate-in animate-in-1" style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-lg" onClick={() => startSession()} disabled={filteredQuizzes.length === 0}>
          <Play size={18} /> Start Quiz Session
        </button>
      </div>

      {/* Filters */}
      <div className="animate-in animate-in-2 filter-row" style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="select-wrapper">
          <select aria-label="Filter by subject" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
            <option value="all">All Subjects</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </div>
        <div className="select-wrapper">
          <select aria-label="Filter by difficulty" value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)}>
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Quiz List */}
      {loading ? (
        <div className="grid grid-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card" style={{ padding: 'var(--space-6)' }}>
              <div className="skeleton" style={{ width: '90%', height: 16, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: '60%', height: 12 }} />
            </div>
          ))}
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="empty-state glass-card animate-in animate-in-3">
          <div className="empty-state-title">No quizzes yet</div>
          <div className="empty-state-description">
            Hardcoded questions will appear here once they have been loaded.
          </div>
        </div>
      ) : (
        <div className="grid grid-2 animate-in animate-in-3">
          {filteredQuizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="glass-card quiz-card"
              onClick={
                quiz.format === 'flashcard'
                  ? () => setPreviewFlipIds((prev) => ({ ...prev, [quiz.id]: !prev[quiz.id] }))
                  : undefined
              }
              style={quiz.format === 'flashcard' ? { cursor: 'pointer' } : undefined}
            >
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <span className="badge badge-processing">
                  {quiz.format === 'multiple_choice' ? 'MC' : 'Flash'}
                </span>
                <span className="badge badge-pending">{quiz.difficulty}</span>
                {quiz.topic && (
                  <span className="chip" style={{ fontSize: '0.65rem' }}>
                    {quiz.topic.name}
                  </span>
                )}
              </div>
              <div className="quiz-card-question">
                {quiz.format === 'flashcard' && previewFlipIds[quiz.id] ? (
                  quiz.answer || quiz.explanation || 'No answer saved for this card.'
                ) : (
                  <>
                    {quiz.stem && quiz.is_testlet && (
                      <div style={{ marginBottom: 'var(--space-3)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', whiteSpace: 'pre-wrap' }}>
                        <strong>Shared scenario:</strong>{'\n'}{quiz.stem}
                      </div>
                    )}
                    {quiz.question.length > 150 ? quiz.question.slice(0, 150) + '...' : quiz.question}
                  </>
                )}
              </div>
              {quiz.format === 'flashcard' && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
                  {previewFlipIds[quiz.id] ? 'Click to hide answer' : 'Click to reveal answer'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
