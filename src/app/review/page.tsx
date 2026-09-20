'use client';

import { useEffect, useState } from 'react';

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

const pageStyle: React.CSSProperties = {
    padding: '32px',
    maxWidth: '840px',
    margin: '0 auto',
};

const h1Style: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '8px',
    color: 'var(--text-primary, #111)',
};

const subStyle: React.CSSProperties = {
    fontSize: '13px',
    color: 'var(--text-muted, #666)',
    marginBottom: '24px',
};

const groupBtnStyle: React.CSSProperties = {
    width: '100%',
    textAlign: 'left',
    padding: '16px',
    border: '1px solid var(--border, #e5e5e5)',
    borderRadius: '8px',
    background: 'var(--surface, #fff)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '10px',
    fontFamily: 'inherit',
    fontSize: '14px',
    color: 'var(--text-primary, #111)',
};

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

    if (loading) {
        return <div style={pageStyle}>Loading…</div>;
    }

    const total = groups.reduce((s, g) => s + g.count, 0);

    if (total === 0) {
        return (
            <div style={pageStyle}>
                <h1 style={h1Style}>Review</h1>
                <p style={{ color: 'var(--text-muted, #666)' }}>
                    Nothing to review right now. Anything you get wrong on a quiz will show up here.
                </p>
            </div>
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

    return (
        <div style={pageStyle}>
            <h1 style={h1Style}>Review</h1>
            <p style={subStyle}>
                {total} wrong {total === 1 ? 'answer' : 'answers'} across {groups.length}{' '}
                {groups.length === 1 ? 'subject' : 'subjects'}
            </p>

            <div>
                {groups.map((g) => (
                    <button
                        key={g.topic_id}
                        onClick={() => setSelectedTopic(g.topic_id)}
                        style={groupBtnStyle}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                                style={{
                                    display: 'inline-block',
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: g.topic_color,
                                }}
                            />
                            <span style={{ fontWeight: 500 }}>{g.topic_name}</span>
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted, #666)' }}>
                            {g.count} to review →
                        </span>
                    </button>
                ))}
            </div>
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

    async function submit(opt: Option) {
        if (revealed || answering) return;
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

    if (index >= questions.length) {
        return (
            <div style={pageStyle}>
                <h1 style={h1Style}>Review complete</h1>
                <p style={{ color: 'var(--text-primary, #111)' }}>
                    {title}: {score.right} right, {score.wrong} wrong out of {questions.length}.
                </p>
                <button
                    onClick={onExit}
                    style={{
                        marginTop: '24px',
                        padding: '10px 18px',
                        background: 'var(--accent, #111)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                    }}
                >
                    Back to Review
                </button>
            </div>
        );
    }

    return (
        <div style={pageStyle}>
            <div
                style={{
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div>
                    <h1
                        style={{
                            fontSize: '20px',
                            fontWeight: 600,
                            margin: 0,
                            color: 'var(--text-primary, #111)',
                        }}
                    >
                        {title}
                    </h1>
                    <p
                        style={{
                            fontSize: '13px',
                            color: 'var(--text-muted, #666)',
                            margin: '4px 0 0',
                        }}
                    >
                        {index + 1} of {questions.length}
                    </p>
                </div>
                <button
                    onClick={onExit}
                    style={{
                        fontSize: '13px',
                        color: 'var(--text-muted, #666)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                    }}
                >
                    Exit
                </button>
            </div>

            {q.is_testlet && q.stem && (
                <div
                    style={{
                        marginBottom: '16px',
                        padding: '16px',
                        background: 'var(--surface-muted, #f7f7f7)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-primary, #111)',
                    }}
                >
                    {q.stem}
                </div>
            )}

            <p
                style={{
                    fontSize: '17px',
                    marginBottom: '20px',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-primary, #111)',
                }}
            >
                {q.question_text}
            </p>

            {q.options && (
                <div>
                    {q.options.map((o) => {
                        const isPicked = selected === o.text;
                        let bg = 'var(--surface, #fff)';
                        let border = '1px solid var(--border, #e5e5e5)';
                        let opacity = 1;

                        if (revealed) {
                            if (o.is_correct) {
                                bg = '#f0fdf4';
                                border = '1px solid #16a34a';
                            } else if (isPicked) {
                                bg = '#fef2f2';
                                border = '1px solid #dc2626';
                            } else {
                                opacity = 0.5;
                            }
                        }

                        return (
                            <button
                                key={o.label}
                                onClick={() => submit(o)}
                                disabled={revealed}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '14px 16px',
                                    marginBottom: '8px',
                                    background: bg,
                                    border,
                                    borderRadius: '8px',
                                    cursor: revealed ? 'default' : 'pointer',
                                    opacity,
                                    fontSize: '14px',
                                    fontFamily: 'inherit',
                                    color: 'var(--text-primary, #111)',
                                }}
                            >
                                <span style={{ fontWeight: 600, marginRight: '8px' }}>
                                    {o.label}.
                                </span>
                                {o.text}
                            </button>
                        );
                    })}
                </div>
            )}

            {revealed && (
                <div
                    style={{
                        marginTop: '20px',
                        padding: '16px',
                        background: 'var(--surface-muted, #f7f7f7)',
                        borderRadius: '8px',
                    }}
                >
                    <p style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
                        Explanation
                    </p>
                    <p
                        style={{
                            fontSize: '13px',
                            whiteSpace: 'pre-wrap',
                            color: 'var(--text-primary, #111)',
                            margin: 0,
                        }}
                    >
                        {q.explanation || 'No explanation provided.'}
                    </p>
                    {q.source_quote && (
                        <p
                            style={{
                                marginTop: '12px',
                                fontSize: '12px',
                                fontStyle: 'italic',
                                color: 'var(--text-muted, #666)',
                                margin: 0,
                            }}
                        >
                            &ldquo;{q.source_quote}&rdquo;
                        </p>
                    )}
                </div>
            )}

            {revealed && (
                <button
                    onClick={next}
                    style={{
                        marginTop: '20px',
                        padding: '10px 18px',
                        background: 'var(--accent, #111)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                    }}
                >
                    {index < questions.length - 1 ? 'Next' : 'Finish'}
                </button>
            )}
        </div>
    );
}