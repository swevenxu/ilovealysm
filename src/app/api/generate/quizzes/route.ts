import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { llmGenerate } from '@/lib/llm';
import { getPinnacleSubject, isPinnacleFile } from '@/lib/pinnacle';
import { formatSourceItems, parseSourceItems, SourceItem } from '@/lib/testlets';
import { handleError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const QUIZ_SYSTEM_PROMPT = `You are a quiz generation assistant. Generate quiz questions from the provided study content.

Each output question must retain the complete source context. Output a JSON object with a "questions" array:
{
  "questions": [
  {
    "stem": "The complete shared scenario or standalone source text",
    "sub_questions": [
      {"number": 1, "text": "The complete sub-question text"}
    ],
    "is_testlet": true,
    "question": "Question text",
    "format": "multiple_choice",
    "options": [
      {"label": "A", "text": "Option text", "is_correct": false},
      {"label": "B", "text": "Option text", "is_correct": true},
      {"label": "C", "text": "Option text", "is_correct": false},
      {"label": "D", "text": "Option text", "is_correct": false}
    ],
    "answer": "The correct answer text",
    "explanation": "Explanation referencing source material",
    "difficulty": "easy|medium|hard"
  },
  {
    "question": "Flashcard question/term",
    "format": "flashcard",
    "options": null,
    "answer": "Flashcard answer/definition",
    "explanation": null,
    "difficulty": "easy|medium|hard"
  }
  ]
}

RULES:
1. A testlet is one source item with a shared stem and multiple sub_questions. Never output a sub-question without its stem.
2. Generate 5-10 quiz questions per chunk, but every generated question from a testlet must include the complete stem and complete sub_questions array.
3. For standalone source items, set is_testlet to false and use the same schema with one sub_question.
4. ~60% multiple choice, ~40% flashcards.
5. Questions should test understanding, not just memorization.
6. MC: exactly 4 options, exactly 1 correct.
7. Difficulty mix: ~30% easy, ~50% medium, ~20% hard.
8. Output ONLY valid JSON, no markdown fences.`;

function parseQuizResponse(text: string): Record<string, unknown>[] {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed: unknown = JSON.parse(jsonStr);
  const questions = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'questions' in parsed && Array.isArray(parsed.questions)
      ? parsed.questions
      : parsed && typeof parsed === 'object' && 'quiz' in parsed && Array.isArray(parsed.quiz)
        ? parsed.quiz
        : [];

  return questions.filter(
    (question): question is Record<string, unknown> =>
      Boolean(question) &&
      typeof question === 'object' &&
      typeof (question as Record<string, unknown>).question === 'string' &&
      typeof (question as Record<string, unknown>).answer === 'string',
  );
}

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  try {
    const { fileId, topicId } = await request.json();
    if (!fileId) return NextResponse.json({ error: 'fileId is required' }, { status: 400 });

    const { data: file, error: fileError } = await supabase.from('files').select('*').eq('id', fileId).single();
    if (fileError) return NextResponse.json({ error: `Could not load source file: ${fileError.message}` }, { status: 500 });
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    if (file.verification_status !== 'readable') {
      return NextResponse.json({ error: 'File must be verified first' }, { status: 400 });
    }

    let pagesQuery = supabase.from('pages').select('page_number, raw_text').eq('file_id', fileId);
    let selectedTopicId: string | null = null;
    if (topicId && isPinnacleFile(file.filename)) {
      const { data: topic, error: topicError } = await supabase.from('topics').select('id, name').eq('id', topicId).single();
      if (topicError) return NextResponse.json({ error: `Could not load subject: ${topicError.message}` }, { status: 500 });
      const subject = topic ? getPinnacleSubject(topic.name) : undefined;
      if (topic && subject && subject.startPage !== null && subject.endPage !== null) {
        pagesQuery = pagesQuery.gte('page_number', subject.startPage).lte('page_number', subject.endPage);
        selectedTopicId = topic.id;
      } else if (subject) {
        return NextResponse.json({ error: `${subject.code} has no content section in this PDF` }, { status: 400 });
      }
    }
    const { data: pages, error: pagesError } = await pagesQuery.order('page_number');
    if (pagesError) return NextResponse.json({ error: `Could not load extracted pages: ${pagesError.message}` }, { status: 500 });
    if (!pages || pages.length === 0) return NextResponse.json({ error: 'No pages found' }, { status: 400 });

    let totalQuizzes = 0;
    const generatedQuizIds: string[] = [];
    let lastGenerationError: string | null = null;
    const sourceText = pages.map((page) => page.raw_text || '').filter((text) => text.trim()).join('\n\n');
    if (!sourceText.trim()) return NextResponse.json({ error: 'The selected pages contain no extracted text. Verify or re-extract the file first.' }, { status: 400 });
    const sourceItems = parseSourceItems(sourceText);
    let currentItems: SourceItem[] = [];
    let currentPages: number[] = [];

    for (let i = 0; i < sourceItems.length; i++) {
      const item = sourceItems[i];
      currentItems.push(item);
      currentPages.push(pages[Math.min(i, pages.length - 1)].page_number);

      const serializedItems = formatSourceItems(currentItems);
      const isLast = i === sourceItems.length - 1;
      if ((serializedItems.length > 6000 || currentItems.length >= 3 || isLast) && serializedItems.trim()) {
        try {
          const result = await llmGenerate(QUIZ_SYSTEM_PROMPT,
            `Generate quiz questions from these complete source items. Preserve each item's stem and sub_questions together:\n\n${serializedItems}`, { temperature: 0.5, jsonMode: true });

          const quizData = parseQuizResponse(result.text);

          const quizRows = quizData.map((q) => {
            const question = q.question as string;
            const difficulty = q.difficulty;
            return {
              file_id: fileId, topic_id: selectedTopicId, question,
              format: q.format === 'flashcard' ? 'flashcard' : 'multiple_choice',
              options: q.options ?? null,
              answer: q.answer as string,
              explanation: typeof q.explanation === 'string' ? q.explanation : null,
              source_page: currentPages[0],
              stem: typeof q.stem === 'string' ? q.stem : question,
              sub_questions: Array.isArray(q.sub_questions) ? q.sub_questions : [{ number: 1, text: question }],
              is_testlet: q.is_testlet === true,
              difficulty: ['easy', 'medium', 'hard'].includes(String(difficulty)) ? difficulty : 'medium',
            };
          });

          if (quizRows.length > 0) {
            const { data: insertedQuizzes, error } = await supabase
              .from('quizzes')
              .insert(quizRows)
              .select('id');
            if (error) {
              lastGenerationError = error.message;
              console.error('Quiz insert error:', error);
            } else {
              totalQuizzes += quizRows.length;
              generatedQuizIds.push(...(insertedQuizzes || []).map((quiz) => quiz.id));
            }
          }
        } catch (error) {
          lastGenerationError = error instanceof Error ? error.message : 'Quiz generation failed';
          console.error('Quiz gen error:', error);
        }
        currentItems = [];
        currentPages = [];
      }
    }

    if (totalQuizzes === 0) {
      return NextResponse.json(
        { error: lastGenerationError || 'No quizzes were generated' },
        { status: 502 },
      );
    }

    if (generatedQuizIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from('quizzes')
        .delete()
        .eq('file_id', fileId)
        .not('id', 'in', `(${generatedQuizIds.join(',')})`);

      if (cleanupError) {
        console.error('Quiz cleanup error:', cleanupError);
        return NextResponse.json(
          { error: 'New quizzes were generated, but previous quizzes could not be removed.' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true, quizzesGenerated: totalQuizzes });
  } catch (error) {
    const { message } = handleError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
