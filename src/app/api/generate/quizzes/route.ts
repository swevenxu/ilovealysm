import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { llmGenerate } from '@/lib/llm';
import { getPinnacleSubject, isPinnacleFile } from '@/lib/pinnacle';
import { formatSourceItems, parseSourceItems, SourceItem } from '@/lib/testlets';
import { handleError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
const MAX_GENERATION_CHUNKS = 12;
const MIN_QUESTIONS_PER_FORMAT = 10;

// ============================================================
// System prompt
// ============================================================

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
      "explanation": "1-3 sentences referencing source material",
      "source_quote": "Verbatim 10-40 word excerpt from the chunk this item is based on",
      "difficulty": "easy|medium|hard"
    },
    {
      "question": "Flashcard question/term",
      "format": "flashcard",
      "options": null,
      "answer": "Flashcard answer/definition",
      "explanation": null,
      "source_quote": "Verbatim 10-40 word excerpt from the chunk",
      "difficulty": "easy|medium|hard"
    },
    {
      "question": "A statement the learner judges as true or false",
      "format": "true_false",
      "options": [
        {"label": "A", "text": "True",  "is_correct": true},
        {"label": "B", "text": "False", "is_correct": false}
      ],
      "answer": "True",
      "explanation": "1-3 sentences",
      "source_quote": "Verbatim 10-40 word excerpt from the chunk",
      "difficulty": "easy|medium|hard"
    }
  ]
}

FORMATS:
- "multiple_choice": exactly 4 options, exactly 1 is_correct=true. Labels A, B, C, D.
- "true_false": exactly 2 options — A = "True", B = "False". Exactly 1 is_correct=true.
  No filler options. Do NOT pad true/false with a fake C or D.
- "flashcard": options = null.

RULES:
1. A testlet is one source item with a shared stem and multiple sub_questions. Never output a sub-question without its stem.
2. Generate 5-10 quiz questions per chunk. Every generated question from a testlet must include the complete stem and complete sub_questions array.
3. For standalone source items, set is_testlet to false and use the same schema with one sub_question.
4. Generate both formats as requested. When a format count is provided, return exactly that many questions for that format.
5. If the source text already contains inline option labels (a. b. c. d.), do NOT copy them into your "stem" field — put the prompt in "stem" and the options in the "options" array.
6. MC: exactly 4 options, exactly 1 correct. True/False: exactly 2 options.
7. Difficulty mix: ~30% easy, ~50% medium, ~20% hard.
8. Output ONLY valid JSON, no markdown fences.

CONTENT QUALITY:
A. Wrong options must be plausible and drawn from the same source material. Base them on common CPA-exam misconceptions: FIFO vs weighted-average, debit/credit reversals, wrong formula variants, treating a period cost as a product cost, confusing perpetual vs periodic, etc. Never use "none of the above", "all of the above", or obviously wrong filler. The three wrong options must be the same length and style as the correct one.
B. Prefer positive stems. If the source item is "Which is NOT…" you may keep it. Do not invent new negative questions. Never stack negatives ("Which is NOT false…").
C. Application over recall. For computational topics (FAR, AFAR, MS, TAX, RFBT computations), the question must be a mini-scenario with numbers, not "what is the formula for X". For theory topics, present a short fact pattern and ask which treatment or standard applies. Recall-only questions ("What is the definition of X?") should be flashcards, not MCQs.
D. Explanation must be 1-3 sentences and must state BOTH: (a) why the correct option is correct, referencing the source concept, and (b) why the single most tempting wrong option is wrong. Do not just restate the correct answer.
E. Within one chunk, do not generate multiple questions from the same paragraph or the same table row. Each question must come from a distinct part of the chunk. If the chunk has less unique content than the requested number of questions, return fewer.
F. Vary the position of the correct option across A, B, C, D. Do not put the correct answer in the same slot twice in a row.

SOURCE GROUNDING:
- Every item MUST include a "source_quote" field: a verbatim excerpt (10-40 words) copied exactly from the chunk text. The quote must appear in the chunk as-is. Items without a valid source_quote will be discarded.

DANGLING REFERENCES:
- If a sub-question references "the statement above / below / following / preceding" and the referenced content is NOT present in the stem you received, return an empty array for that item. Do NOT invent a stem to make it work.`;

// ============================================================
// Response parser
// ============================================================

function parseQuizResponse(text: string): Record<string, unknown>[] {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    const objectStart = jsonStr.indexOf('{');
    const objectEnd = jsonStr.lastIndexOf('}');
    if (objectStart < 0 || objectEnd <= objectStart) return [];

    try {
      parsed = JSON.parse(jsonStr.slice(objectStart, objectEnd + 1));
    } catch {
      return [];
    }
  }

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

// ============================================================
// Post-parse validation
// ============================================================

const DANGLE_RE = /the\s+(statement|passage|scenario|case|text)\s+(above|below|following|preceding)/i;
const BANNED_OPTION_RE = /\b(all|none)\s+of\s+the\s+above\b/i;
const INLINE_OPTION_LABELS_RE = /(^|\s)[a-d]\.\s+\S/m;

/** Aggressive normalization used to test whether source_quote is grounded in the chunk. */
function normalizeForMatch(t: string): string {
  return t
    .toLowerCase()
    .replace(/\\[nrt"]/g, ' ')                 // JSON escapes → space
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[^\w\s]/g, ' ')                  // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalization used for the dedup hash. */
function normalizeQuestionForHash(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface NormalizedOption {
  label: string;
  text: string;
  is_correct: boolean;
}

interface ValidatedItem {
  question: string;
  format: 'multiple_choice' | 'true_false' | 'flashcard';
  options: NormalizedOption[] | null;
  answer: string;
  explanation: string | null;
  stem: string;
  sub_questions: { number: number; text: string }[];
  is_testlet: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  source_quote: string;
}

interface ValidationResult {
  item: ValidatedItem | null;
  reason?: string;
}

function normalizeSubQuestions(raw: unknown, fallbackQuestion: string) {
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = list
    .map((s) => {
      const obj = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
      const num = typeof obj.number === 'number' ? obj.number : 0;
      const text = String(obj.text || '').trim();
      return { number: num, text };
    })
    .filter((s) => s.text.length > 0);

  return cleaned.length > 0 ? cleaned : [{ number: 1, text: fallbackQuestion }];
}

function validateQuizItem(
  raw: Record<string, unknown>,
  chunkText: string,
  seenHashes: Set<string>,
): ValidationResult {
  const question = String(raw.question || '').trim();
  if (!question) return { item: null, reason: 'empty question' };

  // Format detection — flashcard / true_false / (default) multiple_choice
  const rawFormat = String(raw.format || 'multiple_choice');
  let format: 'multiple_choice' | 'true_false' | 'flashcard';
  if (rawFormat === 'flashcard') format = 'flashcard';
  else if (rawFormat === 'true_false') format = 'true_false';
  else format = 'multiple_choice';

  const stem = String(raw.stem || '').trim();

  // ---- BUG 4: dangling "the statement above" ----
  if (DANGLE_RE.test(question)) {
    const stemIsUsable = stem.length > 0 && stem !== question && /[A-Za-z]{3}/.test(stem);
    if (!stemIsUsable) {
      return { item: null, reason: 'dangling reference with no usable stem' };
    }
  }

  // ---- BUG 2: inline option labels must not leak into stem/question ----
  if (INLINE_OPTION_LABELS_RE.test(question) || INLINE_OPTION_LABELS_RE.test(stem)) {
    return { item: null, reason: 'inline option labels leaked into stem/question' };
  }

  // ---- QUALITY 7: dedup by normalized question hash ----
  const hash = normalizeQuestionForHash(question);
  if (!hash) return { item: null, reason: 'empty question hash' };
  if (seenHashes.has(hash)) return { item: null, reason: 'duplicate question' };

  // ---- QUALITY 8: source_quote must be grounded in the chunk ----
  const sourceQuote = String(raw.source_quote || '').trim();
  if (!sourceQuote) return { item: null, reason: 'missing source_quote' };
  const normalizedQuote = normalizeForMatch(sourceQuote);
  if (normalizedQuote.length < 4 || !normalizeForMatch(chunkText).includes(normalizedQuote)) {
    return { item: null, reason: 'source_quote not found in chunk text' };
  }

  const difficulty: 'easy' | 'medium' | 'hard' = ['easy', 'medium', 'hard'].includes(
    String(raw.difficulty),
  )
    ? (raw.difficulty as 'easy' | 'medium' | 'hard')
    : 'medium';

  // Flashcards skip option validation entirely.
  if (format === 'flashcard') {
    return {
      item: {
        question,
        format: 'flashcard',
        options: null,
        answer: String(raw.answer || '').trim(),
        explanation: typeof raw.explanation === 'string' ? raw.explanation : null,
        stem: stem || question,
        sub_questions: normalizeSubQuestions(raw.sub_questions, question),
        is_testlet: raw.is_testlet === true,
        difficulty,
        source_quote: sourceQuote,
      },
    };
  }

  // Normalize options
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  let options: NormalizedOption[] = rawOptions
    .map((o) => {
      const obj = o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
      return {
        label: String(obj.label || '').toUpperCase().trim(),
        text: String(obj.text || '').trim(),
        is_correct: obj.is_correct === true,
      };
    })
    .filter((o) => o.text.length > 0);

  const requiredCount = format === 'true_false' ? 2 : 4;
  if (options.length !== requiredCount) {
    return {
      item: null,
      reason: `${format} has ${options.length} options (needs ${requiredCount})`,
    };
  }

  // ---- QUALITY 1 (enforcement): banned filler options ----
  for (const o of options) {
    if (BANNED_OPTION_RE.test(o.text)) {
      return { item: null, reason: 'banned option text ("all/none of the above")' };
    }
  }

  // ---- BUG 1: exactly one correct option ----
  let correctCount = options.filter((o) => o.is_correct).length;
  if (correctCount !== 1) {
    // Try to repair by matching item.answer to an option's text or label.
    const answer = String(raw.answer || '').trim().toLowerCase();
    if (answer) {
      const matches = options.filter(
        (o) => o.text.toLowerCase() === answer || o.label.toLowerCase() === answer,
      );
      if (matches.length === 1) {
        const winner = matches[0];
        options = options.map((o) => ({ ...o, is_correct: o === winner }));
        correctCount = 1;
      }
    }
  }
  if (correctCount !== 1) {
    return { item: null, reason: `has ${correctCount} correct options (needs 1)` };
  }

  // ---- BUG 3: canonicalize true/false to A=True, B=False ----
  if (format === 'true_false') {
    const trueOpt = options.find((o) => /^true$/i.test(o.text));
    const falseOpt = options.find((o) => /^false$/i.test(o.text));

    if (trueOpt && falseOpt) {
      options = [
        { label: 'A', text: 'True', is_correct: trueOpt.is_correct },
        { label: 'B', text: 'False', is_correct: falseOpt.is_correct },
      ];
    } else {
      // Model returned non-canonical text; preserve is_correct flags and relabel.
      options = [
        { label: 'A', text: 'True', is_correct: options[0].is_correct },
        { label: 'B', text: 'False', is_correct: options[1].is_correct },
      ];
    }
  }

  return {
    item: {
      question,
      format,
      options,
      answer:
        String(raw.answer || '').trim() ||
        options.find((o) => o.is_correct)?.text ||
        '',
      explanation: typeof raw.explanation === 'string' ? raw.explanation : null,
      stem: stem || question,
      sub_questions: normalizeSubQuestions(raw.sub_questions, question),
      is_testlet: raw.is_testlet === true,
      difficulty,
      source_quote: sourceQuote,
    },
  };
}

// ============================================================
// Route handler
// ============================================================

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  try {
    const { fileId, topicId } = await request.json();
    if (!fileId) return NextResponse.json({ error: 'fileId is required' }, { status: 400 });

    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();
    if (fileError)
      return NextResponse.json(
        { error: `Could not load source file: ${fileError.message}` },
        { status: 500 },
      );
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    if (file.verification_status !== 'readable') {
      return NextResponse.json({ error: 'File must be verified first' }, { status: 400 });
    }

    let pagesQuery = supabase.from('pages').select('page_number, raw_text').eq('file_id', fileId);
    let selectedTopicId: string | null = null;
    if (topicId && isPinnacleFile(file.filename)) {
      const { data: topic, error: topicError } = await supabase
        .from('topics')
        .select('id, name')
        .eq('id', topicId)
        .single();
      if (topicError)
        return NextResponse.json(
          { error: `Could not load subject: ${topicError.message}` },
          { status: 500 },
        );
      const subject = topic ? getPinnacleSubject(topic.name) : undefined;
      if (topic && subject && subject.startPage !== null && subject.endPage !== null) {
        pagesQuery = pagesQuery.gte('page_number', subject.startPage).lte('page_number', subject.endPage);
        selectedTopicId = topic.id;
      } else if (subject) {
        return NextResponse.json(
          { error: `${subject.code} has no content section in this PDF` },
          { status: 400 },
        );
      }
    }

    const { data: pages, error: pagesError } = await pagesQuery.order('page_number');
    if (pagesError)
      return NextResponse.json(
        { error: `Could not load extracted pages: ${pagesError.message}` },
        { status: 500 },
      );
    if (!pages || pages.length === 0)
      return NextResponse.json({ error: 'No pages found' }, { status: 400 });

    let totalQuizzes = 0;
    let multipleChoiceCount = 0;
    let flashcardCount = 0;
    const generatedQuizIds: string[] = [];
    let lastGenerationError: string | null = null;

    const sourceText = pages
      .map((page) => page.raw_text || '')
      .filter((text) => text.trim())
      .join('\n\n');
    if (!sourceText.trim())
      return NextResponse.json(
        { error: 'The selected pages contain no extracted text. Verify or re-extract the file first.' },
        { status: 400 },
      );

    const sourceItems = parseSourceItems(sourceText);

    // QUALITY 7: dedup hash set persists across the whole generation run.
    const seenQuestionHashes = new Set<string>();

    let currentItems: SourceItem[] = [];
    let currentPages: number[] = [];

    let processedChunks = 0;
    for (let i = 0; i < sourceItems.length; i++) {
      const item = sourceItems[i];
      currentItems.push(item);
      currentPages.push(pages[Math.min(i, pages.length - 1)].page_number);

      const serializedItems = formatSourceItems(currentItems);
      const isLast = i === sourceItems.length - 1;

      if (
        (serializedItems.length > 6000 || currentItems.length >= 3 || isLast) &&
        serializedItems.trim()
      ) {
        processedChunks++;
        if (processedChunks > MAX_GENERATION_CHUNKS) break;
        if (
          multipleChoiceCount >= MIN_QUESTIONS_PER_FORMAT &&
          flashcardCount >= MIN_QUESTIONS_PER_FORMAT
        )
          break;

        try {
          const multipleChoiceNeeded = Math.max(0, MIN_QUESTIONS_PER_FORMAT - multipleChoiceCount);
          const flashcardsNeeded = Math.max(0, MIN_QUESTIONS_PER_FORMAT - flashcardCount);

          const result = await llmGenerate(
            QUIZ_SYSTEM_PROMPT,
            `Generate up to ${Math.min(2, multipleChoiceNeeded)} multiple-choice questions and up to ${Math.min(2, flashcardsNeeded)} flashcards from these complete source items. Return compact valid JSON only. Preserve each item's stem and sub_questions together:\n\n${serializedItems}`,
            { temperature: 0.5, maxTokens: 2500, jsonMode: true },
          );

          const parsedItems = parseQuizResponse(result.text);
          if (parsedItems.length === 0) {
            lastGenerationError = 'The AI returned invalid JSON for one chunk.';
          }

          // ---- Post-parse validation ----
          const validated: ValidatedItem[] = [];
          const dropReasons: string[] = [];

          for (const rawItem of parsedItems) {
            const { item: ok, reason } = validateQuizItem(rawItem, serializedItems, seenQuestionHashes);
            if (ok) {
              seenQuestionHashes.add(normalizeQuestionForHash(ok.question));
              validated.push(ok);
            } else if (reason) {
              dropReasons.push(reason);
            }
          }

          if (dropReasons.length > 0) {
            console.warn(
              `[Quiz] Dropped ${dropReasons.length} invalid item(s) in chunk ${processedChunks}: ` +
              dropReasons.slice(0, 6).join('; '),
            );
          }

          const quizRows = validated.map((q) => ({
            file_id: fileId,
            topic_id: selectedTopicId,
            question: q.question,
            format: q.format,                 // 'multiple_choice' | 'true_false' | 'flashcard'
            options: q.options,
            answer: q.answer,
            explanation: q.explanation,
            source_page: currentPages[0],
            stem: q.stem,
            sub_questions: q.sub_questions,
            is_testlet: q.is_testlet,
            difficulty: q.difficulty,
            source_quote: q.source_quote,     // NEW column
          }));

          const insertedFormatCounts = quizRows.reduce(
            (counts, quiz) => {
              if (quiz.format === 'flashcard') counts.flashcards += 1;
              else if (quiz.format === 'true_false') counts.trueFalse += 1;
              else counts.multipleChoice += 1;
              return counts;
            },
            { multipleChoice: 0, flashcards: 0, trueFalse: 0 },
          );

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
              multipleChoiceCount += insertedFormatCounts.multipleChoice;
              flashcardCount += insertedFormatCounts.flashcards;
              generatedQuizIds.push(...(insertedQuizzes || []).map((quiz) => quiz.id));
            }
          }
        } catch (error) {
          lastGenerationError =
            error instanceof Error ? error.message : 'Quiz generation failed';
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

    if (
      multipleChoiceCount < MIN_QUESTIONS_PER_FORMAT ||
      flashcardCount < MIN_QUESTIONS_PER_FORMAT
    ) {
      if (generatedQuizIds.length > 0) {
        await supabase.from('quizzes').delete().in('id', generatedQuizIds);
      }
      return NextResponse.json(
        {
          error: `Could not reach the minimum of ${MIN_QUESTIONS_PER_FORMAT} multiple-choice questions and ${MIN_QUESTIONS_PER_FORMAT} flashcards. Generated ${multipleChoiceCount} multiple-choice questions and ${flashcardCount} flashcards.`,
        },
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