'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    XCircle,
    RotateCcw,
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

export default function ReviewPage() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const r = await fetch('/api/review', { cache: 'no-store' });
            const d = await r.json();
            setGroups(d.groups || []);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }

    useEffect(() => {
        load();
    }, []);

    const total = groups.reduce((s, g) => s + g.count, 0);

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

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Review</h1>
            </div>

            {loading ? (
                <div className="grid grid-2">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="glass-card" style={{ padding: 'var(--space-6)' }}>
                            <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 12 }} />
                            <div className="skeleton" style={{ width: '40%', height: 12 }} />
                        </div>
                    ))}
                </div>
            ) : total === 0 ? (
                <div className="empty-state glass-card animate-in animate-in-1">
                    <div className="empty-state-title">Nothing to review</div>
                    <div className="empty-state-description">
                        Anything you get wrong on a quiz will show up here. Take a quiz session and come back.
                    </div>
                    <Link href="/quizzes" className="btn btn-primary">
                        Go to Quizzes
                    </Link>
                </div>
            ) : (
                <div className="grid grid-2 animate-in animate-in-1">
                    {groups.map((g) => (
                        <button
                            key={g.topic_id}
                            onClick={() => setSelectedTopic(g.topic_id)}
                            className="glass-card quiz-card"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 'var(--space-4)',
                                textAlign: 'left',
                                width: '100%',
                                font: 'inherit',
                                color: 'inherit',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-3)',
                                    minWidth: 0,
                                }}
                            >
                                <span
                                    style={{
                                        display: 'inline-block',
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        background: g.topic_color,
                                        flexShrink: 0,
                                    }}
                                />
                                <span
                                    style={{
                                        fontFamily: 'var(--font-heading)',
                                        fontWeight: 700,
                                        fontSize: 'var(--text-base)',
                                    }}
                                >
                                    {g.topic_name}
                                </span>
                            </div>
                            <span
                                style={{
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--text-tertiary)',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-1)',
                                }}
                            >
                                {g.count} to review <ChevronRight size={14} />
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function ReviewSession({
    title,
    questions,
    onExit,
}: {
    title: string;
    questions: ReviewQuestion[];
    onExit: () => void;
}) {
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [answering, setAnswering] = useState(false);
    const [score, setScore] = useState({ right: 0, wrong: 0 });

    const q = questions[index];
    const complete = index >= questions.length;

    async function submit(opt: Option) {
        if (revealed || answering || !q) return;
        setSelected(opt.text);
        setRevealed(true);
        setAnswering(true);
        setScore((s) => ({
            right: s.right + (opt.is_correct ? 1 : 0),
            wrong: s.wrong + (opt.is_correct ? 0 : 1),
        }));
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

    return (
        <div className="page-container">
            {/* Progress Bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-4)',
                    marginBottom: 'var(--space-6)',
                }}
            >
                <button className="btn btn-ghost" onClick={onExit}>
                    <ChevronLeft size={16} /> Exit
                </button>
                <div style={{ flex: 1 }}>
                    <div className="progress-bar-track">
                        <div
                            className="progress-bar-fill"
                            style={{
                                width: `${(Math.min(index + (revealed ? 1 : 0), questions.length) / questions.length) * 100}%`,
                            }}
                        />
                    </div>
                </div>
                <span
                    style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    {Math.min(index + 1, questions.length)}/{questions.length}
                </span>
            </div>

            {/* Complete */}
            {complete && (
                <div
                    className="glass-card animate-in animate-in-1"
                    style={{
                        padding: 'var(--space-10)',
                        textAlign: 'center',
                        maxWidth: 640,
                        margin: '0 auto',
                    }}
                >
                    <h2
                        style={{
                            fontSize: 'var(--text-2xl)',
                            fontWeight: 700,
                            marginBottom: 'var(--space-2)',
                        }}
                    >
                        Review Complete!
                    </h2>
                    <p
                        style={{
                            fontSize: 'var(--text-4xl)',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color:
                                score.right / questions.length >= 0.8
                                    ? 'var(--accent-emerald)'
                                    : 'var(--accent-amber)',
                        }}
                    >
                        {score.right}/{questions.length}
                    </p>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
                        {Math.round((score.right / questions.length) * 100)}% correct on {title}
                    </p>
                    <button className="btn btn-primary" onClick={onExit}>
                        <RotateCcw size={16} /> Back to Review
                    </button>
                </div>
            )}

            {/* Question */}
            {!complete && q && (
                <div
                    className="glass-card animate-in animate-in-1"
                    style={{ padding: 'var(--space-8)', maxWidth: 720, margin: '0 auto' }}
                >
                    <div
                        style={{
                            display: 'flex',
                            gap: 'var(--space-2)',
                            marginBottom: 'var(--space-4)',
                        }}
                    >
                        <span className="badge badge-processing">Review</span>
                        {q.difficulty && <span className="badge badge-pending">{q.difficulty}</span>}
                    </div>

                    <div
                        className="quiz-card-question"
                        style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-6)' }}
                    >
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
                                }}
                            >
                                <strong>Shared scenario:</strong>
                                {'\n'}
                                {q.stem}
                            </div>
                        )}
                        {q.question_text}
                    </div>

                    <div>
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
                                >
                                    <span className="quiz-option-label">{labels[idx]}</span>
                                    <span>{option.text}</span>
                                    {revealed && option.is_correct && (
                                        <CheckCircle2
                                            size={16}
                                            style={{ marginLeft: 'auto', color: 'var(--accent-emerald)' }}
                                        />
                                    )}
                                    {revealed && option.text === selected && !option.is_correct && (
                                        <XCircle
                                            size={16}
                                            style={{ marginLeft: 'auto', color: 'var(--accent-rose)' }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

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
                            }}
                        >
                            <strong style={{ color: 'var(--accent-blue-light)' }}>Explanation:</strong>{' '}
                            {q.explanation}
                        </div>
                    )}

                    {revealed && q.source_quote && (
                        <div
                            style={{
                                marginTop: 'var(--space-3)',
                                fontSize: 'var(--text-xs)',
                                fontStyle: 'italic',
                                color: 'var(--text-muted)',
                            }}
                        >
                            &ldquo;{q.source_quote}&rdquo;
                        </div>
                    )}

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