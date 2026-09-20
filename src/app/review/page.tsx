'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    XCircle,
    RotateCcw,
    BookOpen,
    AlertTriangle,
    Zap,
    Trophy,
    Target,
} from 'lucide-react';

interface Option {
    label: string;
    text: string;
    is_correct: boolean;
}

interface ReviewQuestion {
    id: string;
    question_text: string;
    format: string;
    options: Option[] | null;
    correct_answer: string;
    explanation: string | null;
    difficulty: string | null;
    stem: string | null;
    sub_questions: { number: number; text: string }[] | null;
    is_testlet: boolean;
    source_quote: string | null;
}

interface Group {
    topic_id: string;
    topic_name: string;
    topic_color: string;
    count: number;
    questions: ReviewQuestion[];
}

/** Fisher-Yates shuffle (immutable) */
function shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export default function ReviewPage() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [reviewAll, setReviewAll] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await fetch('/api/review', { cache: 'no-store' });
            if (!r.ok) throw new Error(`Server error ${r.status}`);
            const d = await r.json();
            setGroups(d.groups || []);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to load review data';
            console.error(e);
            setError(msg);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const total = useMemo(() => groups.reduce((s, g) => s + g.count, 0), [groups]);

    /* Entering a review session */
    if (reviewAll) {
        const allQuestions = groups.flatMap((g) => g.questions);
        return (
            <ReviewSession
                title="All Topics"
                questions={allQuestions}
                onExit={() => {
                    setReviewAll(false);
                    load();
                }}
            />
        );
    }

    if (selectedTopic) {
        const group = groups.find((g) => g.topic_id === selectedTopic);
        return (
            <ReviewSession
                title={group?.topic_name || 'Review'}
                questions={group?.questions || []}
                onExit={() => {
                    setSelectedTopic(null);
                    load();
                }}
            />
        );
    }

    /* Topic picker */
    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Review</h1>
                {!loading && total > 0 && (
                    <p className="page-subtitle">
                        {total} question{total !== 1 ? 's' : ''} to review across{' '}
                        {groups.length} topic{groups.length !== 1 ? 's' : ''}
                    </p>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="glass-card animate-in"
                            style={{
                                padding: 'var(--space-5)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-4)',
                                animationDelay: `${i * 60}ms`,
                            }}
                        >
                            <div
                                className="skeleton"
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 'var(--radius-md)',
                                    flexShrink: 0,
                                }}
                            />
                            <div style={{ flex: 1 }}>
                                <div
                                    className="skeleton"
                                    style={{ width: '55%', height: 14, marginBottom: 8 }}
                                />
                                <div
                                    className="skeleton"
                                    style={{ width: '30%', height: 10 }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            ) : error ? (
                <div className="empty-state glass-card animate-in animate-in-1">
                    <AlertTriangle
                        size={40}
                        style={{ color: 'var(--accent-amber)', marginBottom: 'var(--space-4)' }}
                    />
                    <div className="empty-state-title">Failed to load</div>
                    <div className="empty-state-description">{error}</div>
                    <button className="btn btn-primary" onClick={load}>
                        <RotateCcw size={14} /> Retry
                    </button>
                </div>
            ) : total === 0 ? (
                <div className="empty-state glass-card animate-in animate-in-1">
                    <CheckCircle2
                        size={40}
                        style={{ color: 'var(--accent-emerald)', marginBottom: 'var(--space-4)' }}
                    />
                    <div className="empty-state-title">Nothing to review</div>
                    <div className="empty-state-description">
                        Anything you get wrong on a quiz will show up here. Take a quiz session and
                        come back.
                    </div>
                    <Link href="/quizzes" className="btn btn-primary">
                        <Zap size={14} /> Go to Quizzes
                    </Link>
                </div>
            ) : (
                <div className="animate-in animate-in-1">
                    {/* Review All button */}
                    {groups.length > 1 && (
                        <button
                            onClick={() => setReviewAll(true)}
                            className="btn btn-primary btn-lg"
                            style={{ marginBottom: 'var(--space-6)', width: '100%' }}
                        >
                            <BookOpen size={16} /> Review All ({total} questions)
                        </button>
                    )}

                    {/* Topic list */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-3)',
                        }}
                    >
                        {groups.map((g, i) => (
                            <button
                                key={g.topic_id}
                                onClick={() => setSelectedTopic(g.topic_id)}
                                className="glass-card animate-in"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-4)',
                                    padding: 'var(--space-5)',
                                    textAlign: 'left',
                                    width: '100%',
                                    cursor: 'pointer',
                                    animationDelay: `${(i + 1) * 60}ms`,
                                }}
                            >
                                {/* Color indicator */}
                                <div
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 'var(--radius-md)',
                                        background: g.topic_color + '20',
                                        border: `2px solid ${g.topic_color}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <BookOpen
                                        size={18}
                                        style={{ color: g.topic_color }}
                                    />
                                </div>

                                {/* Topic info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontFamily: 'var(--font-heading)',
                                            fontWeight: 700,
                                            fontSize: 'var(--text-base)',
                                            lineHeight: 1.3,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {g.topic_name}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--text-tertiary)',
                                            marginTop: 'var(--space-1)',
                                        }}
                                    >
                                        {g.count} question{g.count !== 1 ? 's' : ''} to review
                                    </div>
                                </div>

                                {/* Badge + arrow */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-2)',
                                        flexShrink: 0,
                                    }}
                                >
                                    <span
                                        className="badge badge-needs-ocr"
                                        style={{ fontSize: '0.7rem' }}
                                    >
                                        {g.count}
                                    </span>
                                    <ChevronRight
                                        size={16}
                                        style={{ color: 'var(--text-muted)' }}
                                    />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ===============================================================
   ReviewSession — quiz-like flow for wrong answers
   =============================================================== */

function ReviewSession({
    title,
    questions: rawQuestions,
    onExit,
}: {
    title: string;
    questions: ReviewQuestion[];
    onExit: () => void;
}) {
    const questions = useMemo(() => shuffle(rawQuestions), [rawQuestions]);

    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [answering, setAnswering] = useState(false);
    const [results, setResults] = useState<boolean[]>([]);

    const q = questions[index] ?? null;
    const complete = index >= questions.length;
    const rightCount = results.filter(Boolean).length;
    const wrongCount = results.filter((r) => !r).length;

    async function submit(opt: Option) {
        if (revealed || answering || !q) return;
        setSelected(opt.text);
        setRevealed(true);
        setAnswering(true);
        setResults((prev) => [...prev, opt.is_correct]);

        try {
            await fetch('/api/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question_id: q.id,
                    selected_answer: opt.text,
                    is_correct: opt.is_correct,
                }),
            });
        } catch (e) {
            console.error(e);
        }
        setAnswering(false);
    }

    function next() {
        setSelected(null);
        setRevealed(false);
        setIndex((i) => i + 1);
    }

    const progressPct =
        questions.length > 0
            ? (Math.min(index + (revealed ? 1 : 0), questions.length) / questions.length) * 100
            : 0;

    return (
        <div className="page-container">
            {/* Header: Exit + Progress bar + counter + live score */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    marginBottom: 'var(--space-6)',
                    flexWrap: 'wrap',
                }}
            >
                <button className="btn btn-ghost" onClick={onExit}>
                    <ChevronLeft size={16} /> Exit
                </button>

                <div style={{ flex: 1, minWidth: 120 }}>
                    <div className="progress-bar-track">
                        <div
                            className="progress-bar-fill"
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                </div>

                <span
                    style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {Math.min(index + 1, questions.length)}/{questions.length}
                </span>

                {/* Live score pills */}
                {results.length > 0 && (
                    <div
                        style={{
                            display: 'flex',
                            gap: 'var(--space-2)',
                            alignItems: 'center',
                        }}
                    >
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 'var(--text-xs)',
                                fontWeight: 600,
                                color: 'var(--accent-emerald)',
                            }}
                        >
                            <CheckCircle2 size={13} /> {rightCount}
                        </span>
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 'var(--text-xs)',
                                fontWeight: 600,
                                color: 'var(--accent-rose)',
                            }}
                        >
                            <XCircle size={13} /> {wrongCount}
                        </span>
                    </div>
                )}
            </div>

            {/* -------- Complete screen -------- */}
            {complete && (
                <CompletionSummary
                    title={title}
                    results={results}
                    questions={questions}
                    onExit={onExit}
                />
            )}

            {/* -------- Active question -------- */}
            {!complete && q && (
                <div
                    key={q.id}
                    className="glass-card animate-in animate-in-1"
                    style={{ padding: 'var(--space-8)', maxWidth: 720, margin: '0 auto' }}
                >
                    {/* Badges */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 'var(--space-2)',
                            marginBottom: 'var(--space-4)',
                            flexWrap: 'wrap',
                        }}
                    >
                        <span className="badge badge-processing">Review</span>
                        {q.difficulty && (
                            <span className="badge badge-pending">{q.difficulty}</span>
                        )}
                    </div>

                    {/* Testlet stem */}
                    {q.is_testlet && q.stem && (
                        <div
                            style={{
                                marginBottom: 'var(--space-4)',
                                padding: 'var(--space-4)',
                                background: 'var(--bg-tertiary)',
                                borderRadius: 'var(--radius-lg)',
                                color: 'var(--text-secondary)',
                                fontSize: 'var(--text-sm)',
                                whiteSpace: 'pre-wrap',
                                lineHeight: 1.6,
                            }}
                        >
                            <strong>Shared scenario:</strong>
                            {'\n'}
                            {q.stem}
                        </div>
                    )}

                    {/* Question text */}
                    <div
                        className="quiz-card-question"
                        style={{
                            fontSize: 'var(--text-lg)',
                            marginBottom: 'var(--space-6)',
                            lineHeight: 1.6,
                        }}
                    >
                        {q.question_text}
                    </div>

                    {/* Options */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {q.options?.map((option, idx) => {
                            const labels = ['A', 'B', 'C', 'D', 'E'];
                            let optionClass = 'quiz-option';
                            if (revealed) {
                                if (option.is_correct) optionClass += ' correct';
                                else if (option.text === selected) optionClass += ' incorrect';
                            } else if (option.text === selected) {
                                optionClass += ' selected';
                            }

                            return (
                                <div
                                    key={idx}
                                    className={optionClass}
                                    onClick={() => !revealed && submit(option)}
                                    style={{ cursor: revealed ? 'default' : 'pointer' }}
                                >
                                    <span className="quiz-option-label">{labels[idx]}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>{option.text}</span>
                                    {revealed && option.is_correct && (
                                        <CheckCircle2
                                            size={16}
                                            style={{
                                                flexShrink: 0,
                                                color: 'var(--accent-emerald)',
                                            }}
                                        />
                                    )}
                                    {revealed &&
                                        option.text === selected &&
                                        !option.is_correct && (
                                            <XCircle
                                                size={16}
                                                style={{
                                                    flexShrink: 0,
                                                    color: 'var(--accent-rose)',
                                                }}
                                            />
                                        )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Explanation */}
                    {revealed && q.explanation && (
                        <div
                            style={{
                                marginTop: 'var(--space-4)',
                                padding: 'var(--space-4)',
                                background: 'var(--accent-blue-glow)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                fontSize: 'var(--text-sm)',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.6,
                            }}
                        >
                            <strong style={{ color: 'var(--accent-blue-light)' }}>
                                Explanation:
                            </strong>{' '}
                            {q.explanation}
                        </div>
                    )}

                    {/* Source quote */}
                    {revealed && q.source_quote && (
                        <div
                            style={{
                                marginTop: 'var(--space-3)',
                                fontSize: 'var(--text-xs)',
                                fontStyle: 'italic',
                                color: 'var(--text-muted)',
                                lineHeight: 1.5,
                            }}
                        >
                            &ldquo;{q.source_quote}&rdquo;
                        </div>
                    )}

                    {/* Next button */}
                    {revealed && (
                        <div
                            style={{
                                marginTop: 'var(--space-6)',
                                display: 'flex',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <button className="btn btn-primary" onClick={next}>
                                {index < questions.length - 1 ? 'Next Question' : 'Finish'}{' '}
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ===============================================================
   CompletionSummary — shown after finishing a review session
   =============================================================== */

function CompletionSummary({
    title,
    results,
    questions,
    onExit,
}: {
    title: string;
    results: boolean[];
    questions: ReviewQuestion[];
    onExit: () => void;
}) {
    const total = results.length;
    const correct = results.filter(Boolean).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const excellent = pct >= 80;

    return (
        <div
            className="glass-card animate-in animate-in-1"
            style={{
                padding: 'var(--space-10)',
                textAlign: 'center',
                maxWidth: 640,
                margin: '0 auto',
            }}
        >
            {/* Trophy / Target icon */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
                {excellent ? (
                    <Trophy
                        size={48}
                        style={{ color: 'var(--accent-emerald)' }}
                    />
                ) : (
                    <Target
                        size={48}
                        style={{ color: 'var(--accent-amber)' }}
                    />
                )}
            </div>

            <h2
                style={{
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 700,
                    marginBottom: 'var(--space-2)',
                }}
            >
                Review Complete!
            </h2>

            {/* Score */}
            <p
                style={{
                    fontSize: 'var(--text-4xl)',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: excellent ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                    margin: 'var(--space-2) 0',
                }}
            >
                {correct}/{total}
            </p>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                {pct}% correct on {title}
            </p>

            {/* Mini stat row */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 'var(--space-6)',
                    marginBottom: 'var(--space-6)',
                    flexWrap: 'wrap',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--accent-emerald)',
                        fontWeight: 600,
                    }}
                >
                    <CheckCircle2 size={16} /> {correct} correct
                </div>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--accent-rose)',
                        fontWeight: 600,
                    }}
                >
                    <XCircle size={16} /> {total - correct} wrong
                </div>
            </div>

            {/* Progress bar */}
            <div
                className="progress-bar-track"
                style={{ marginBottom: 'var(--space-6)', height: 10 }}
            >
                <div
                    className="progress-bar-fill"
                    style={{
                        width: `${pct}%`,
                        background: excellent
                            ? 'linear-gradient(90deg, var(--accent-emerald) 0%, #34d399 100%)'
                            : 'linear-gradient(90deg, var(--accent-amber) 0%, #fbbf24 100%)',
                    }}
                />
            </div>

            {/* Message */}
            <p
                style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-tertiary)',
                    marginBottom: 'var(--space-6)',
                }}
            >
                {excellent
                    ? 'Great job! You\'re mastering these topics.'
                    : 'Keep practicing — you\'ll get there! Wrong answers stay in your review queue.'}
            </p>

            <button className="btn btn-primary btn-lg" onClick={onExit}>
                <RotateCcw size={16} /> Back to Review
            </button>
        </div>
    );
}