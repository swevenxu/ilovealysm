import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface AttemptRow {
    question_id: string;
    is_correct: boolean;
    answered_at: string;
}

interface QuestionRow {
    id: string;
    topic_id: string | null;
    question_text: string;
    format: string;
    options: unknown;
    correct_answer: string;
    explanation: string | null;
    difficulty: string | null;
    stem: string | null;
    sub_questions: unknown;
    is_testlet: boolean;
    source_quote: string | null;
}

interface TopicRow {
    id: string;
    name: string;
    color: string | null;
}

export async function GET() {
    const supabase = getServerSupabase();
    if (!supabase) return NextResponse.json({ groups: [], total: 0 });

    try {
        const [attemptsRes, questionsRes, topicsRes] = await Promise.all([
            supabase
                .from('attempt_log')
                .select('question_id, is_correct, answered_at')
                .order('answered_at', { ascending: false }),
            supabase
                .from('questions')
                .select('id, topic_id, question_text, format, options, correct_answer, explanation, difficulty, stem, sub_questions, is_testlet, source_quote'),
            supabase.from('topics').select('id, name, color'),
        ]);

        const attempts = (attemptsRes.data as AttemptRow[]) || [];
        const questions = (questionsRes.data as QuestionRow[]) || [];
        const topics = (topicsRes.data as TopicRow[]) || [];

        // Latest attempt per question
        const latest = new Map<string, { is_correct: boolean; answered_at: string }>();
        for (const a of attempts) {
            if (latest.has(a.question_id)) continue;
            latest.set(a.question_id, { is_correct: a.is_correct, answered_at: a.answered_at });
        }

        const wrongIds = new Set(
            [...latest.entries()].filter(([, v]) => !v.is_correct).map(([id]) => id),
        );

        const wrongQuestions = questions.filter((q) => wrongIds.has(q.id));

        // Group by topic
        const topicById = new Map<string, TopicRow>();
        for (const t of topics) topicById.set(t.id, t);

        const grouped = new Map<string, QuestionRow[]>();
        for (const q of wrongQuestions) {
            const key = q.topic_id || '__unassigned__';
            const list = grouped.get(key) || [];
            list.push(q);
            grouped.set(key, list);
        }

        const groups = [...grouped.entries()].map(([topic_id, qs]) => {
            const topic = topicById.get(topic_id);
            return {
                topic_id,
                topic_name: topic?.name || 'Unassigned',
                topic_color: topic?.color || '#3b82f6',
                count: qs.length,
                questions: qs.map((q) => ({
                    id: q.id,
                    question_text: q.question_text,
                    format: q.format,
                    options: q.options,
                    correct_answer: q.correct_answer,
                    explanation: q.explanation,
                    difficulty: q.difficulty,
                    stem: q.stem,
                    sub_questions: q.sub_questions,
                    is_testlet: q.is_testlet,
                    source_quote: q.source_quote,
                    answered_at: latest.get(q.id)?.answered_at,
                })),
            };
        });

        return NextResponse.json({
            groups,
            total: wrongQuestions.length,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('review GET error:', msg);
        return NextResponse.json({ groups: [], total: 0, error: msg }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const supabase = getServerSupabase();
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

    try {
        const body = await request.json();
        const { question_id, selected_answer, is_correct, time_spent_seconds } = body;

        if (!question_id || typeof is_correct !== 'boolean') {
            return NextResponse.json(
                { error: 'question_id and is_correct required' },
                { status: 400 },
            );
        }

        const { data, error } = await supabase
            .from('attempt_log')
            .insert({
                question_id,
                selected_answer,
                is_correct,
                time_spent_seconds: time_spent_seconds || null,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('review POST error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}