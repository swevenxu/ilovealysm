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

    if (loading) return <div className="p-8 text-gray-500">Loading…</div>;

    const total = groups.reduce((s, g) => s + g.count, 0);

    if (total === 0) {
        return (
            <div className="p-8 max-w-2xl">
                <h1 className="text-2xl font-semibold mb-3">Review</h1>
                <p className="text-gray-600">
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
                onExit={() => { setSelectedTopic(null); load(); }}
            />
        );
    }

    return (
        <div className="p-8 max-w-3xl">
            <h1 className="text-2xl font-semibold mb-1">Review</h1>
            <p className="text-sm text-gray-500 mb-6">
                {total} wrong {total === 1 ? 'answer' : 'answers'} across {groups.length}{' '}
                {groups.length === 1 ? 'subject' : 'subjects'}
            </p>

            <div className="space-y-3">
                {groups.map((g) => (
                    <button
                        key={g.topic_id}
                        onClick={() => setSelectedTopic(g.topic_id)}
                        className="w-full text-left p-4 border rounded hover:bg-gray-50 flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: g.topic_color }}
                            />
                            <span className="font-medium">{g.topic_name}</span>
                        </div>
                        <span className="text-sm text-gray-500">{g.count} to review →</span>
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
            <div className="p-8 max-w-2xl">
                <h1 className="text-2xl font-semibold mb-3">Review complete</h1>
                <p className="text-gray-700">
                    {title}: {score.right} right, {score.wrong} wrong out of {questions.length}.
                </p>
                <button
                    className="mt-6 px-4 py-2 bg-black text-white rounded"
                    onClick={onExit}
                >
                    Back to Review
                </button>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-3xl">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-semibold">{title}</h1>
                    <p className="text-sm text-gray-500">
                        {index + 1} of {questions.length}
                    </p>
                </div>
                <button
                    className="text-sm text-gray-500 hover:text-black"
                    onClick={onExit}
                >
                    Exit
                </button>
            </div>

            {q.is_testlet && q.stem && (
                <div className="mb-4 p-4 bg-gray-50 rounded text-sm whitespace-pre-wrap">
                    {q.stem}
                </div>
            )}

            <p className="text-lg mb-6 whitespace-pre-wrap">{q.question_text}</p>

            {q.options && (
                <div className="space-y-2">
                    {q.options.map((o) => {
                        const isPicked = selected === o.text;
                        let cls = 'w-full text-left p-3 border rounded ';
                        if (!revealed) cls += 'hover:bg-gray-50';
                        else if (o.is_correct) cls += 'bg-green-50 border-green-500';
                        else if (isPicked) cls += 'bg-red-50 border-red-500';
                        else cls += 'opacity-60';

                        return (
                            <button
                                key={o.label}
                                className={cls}
                                onClick={() => submit(o)}
                                disabled={revealed}
                            >
                                <span className="font-semibold mr-2">{o.label}.</span>
                                {o.text}
                            </button>
                        );
                    })}
                </div>
            )}

            {revealed && (
                <div className="mt-6 p-4 bg-gray-50 rounded">
                    <p className="font-semibold mb-2">Explanation</p>
                    <p className="text-sm whitespace-pre-wrap">
                        {q.explanation || 'No explanation provided.'}
                    </p>
                    {q.source_quote && (
                        <p className="mt-3 text-xs italic text-gray-500">"{q.source_quote}"</p>
                    )}
                </div>
            )}

            {revealed && (
                <button
                    className="mt-6 px-4 py-2 bg-black text-white rounded"
                    onClick={next}
                >
                    {index < questions.length - 1 ? 'Next' : 'Finish'}
                </button>
            )}
        </div>
    );
}