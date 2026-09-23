import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { isMultipleChoiceOptions } from '@/lib/mcq';
import { latestAttempts } from '@/lib/attempts';
import { reviewAttemptSchema, validateBody } from '@/lib/validation';

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
            // NOTE: correct_answer/explanation are intentionally NOT selected so
            // they never reach the browser before an answer is recorded. They are
            // revealed by the POST response after grading.
            supabase
                .from('questions')
                .select('id, topic_id, question_text, format, options, difficulty, stem, sub_questions, is_testlet, source_quote')
                .eq('format', 'multiple_choice'),
            supabase.from('topics').select('id, name, color'),
        ]);

        const attempts = (attemptsRes.data as AttemptRow[]) || [];
        const questions = (questionsRes.data as QuestionRow[]) || [];
        const topics = (topicsRes.data as TopicRow[]) || [];

        if (attemptsRes.error) throw attemptsRes.error;
        if (questionsRes.error) throw questionsRes.error;
        if (topicsRes.error) throw topicsRes.error;

        // Use the same latest-answer rule as Dashboard and Progress.
        const latest = latestAttempts(attempts);

        const wrongIds = new Set(
            [...latest.entries()].filter(([, v]) => !v.is_correct).map(([id]) => id),
        );

        const wrongQuestions = questions.filter(
            (q) => wrongIds.has(q.id) && isMultipleChoiceOptions(q.options),
        );

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
                    options: (q.options as { label: string; text: string; is_correct: boolean }[]).map(
                        ({ label, text }) => ({ label, text }),
                    ),
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

    const parsed = await validateBody(request, reviewAttemptSchema);
    if (!parsed.valid) {
        return NextResponse.json({ error: parsed.errors.join(', ') }, { status: 400 });
    }

    try {
        const { data, error } = await supabase
            .rpc('record_multiple_choice_attempt', {
                p_question_id: parsed.data.question_id,
                p_selected_answer: parsed.data.selected_answer,
                p_idempotency_key: parsed.data.idempotency_key,
                p_time_spent_seconds: parsed.data.time_spent_seconds ?? null,
            })

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        const attempt = (data || [])[0] as AttemptResult | undefined;
        if (!attempt) return NextResponse.json({ error: 'Attempt could not be recorded' }, { status: 500 });

        // Reveal data is only returned AFTER the answer has been recorded.
        return NextResponse.json({
            attempt_id: attempt.attempt_id,
            question_id: attempt.question_id,
            is_correct: attempt.is_correct,
            correct_answer: attempt.correct_answer,
            explanation: attempt.explanation,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('review POST error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

interface AttemptResult {
    attempt_id: string;
    question_id: string;
    is_correct: boolean;
    correct_answer: string | null;
    explanation: string | null;
}
