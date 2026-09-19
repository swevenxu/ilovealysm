export interface SourceOption {
  label: string;   // 'a' | 'b' | 'c' | 'd'
  text: string;
}

export interface SourceSubQuestion {
  number: number;
  text: string;
  options?: SourceOption[];
}

export interface SourceItem {
  stem: string;
  sub_questions: SourceSubQuestion[];
  is_testlet: boolean;
  options?: SourceOption[];
}

const ITEM_START = /^\s*(\d+)\.\s+(?=[A-Z])/m;
const SUBQUESTION = /Question\s+(\d+)\s*:/gi;

/** Max distance between the first and last inline option marker before we bail. */
const INLINE_OPTIONS_MAX_SPAN = 3000;

/**
 * Detect 3+ inline option markers ("a. ", "b. ", "c. " [, "d. "]) appearing in
 * ascending order within a single block. When found, return the clean stem plus
 * the extracted options. Otherwise return the input unchanged.
 *
 * The 3+ requirement and the 3000-char span guard keep normal prose like
 * "a. b." or two-letter references from being mistaken for an option list.
 */
export function splitInlineOptions(text: string): { stem: string; options: SourceOption[] } {
  if (!text || !text.trim()) return { stem: text || '', options: [] };

  const candidates: { idx: number; label: string; end: number }[] = [];
  const re = /\b([a-d])\.\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    candidates.push({
      idx: m.index,
      label: m[1].toLowerCase(),
      end: m.index + m[0].length,
    });
  }

  if (candidates.length < 3) return { stem: text, options: [] };

  // Find the first strictly ascending run starting at 'a' with >= 3 labels.
  let start = -1;
  let end = -1;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].label !== 'a') continue;

    let expected = 'b';
    let last = i;
    for (let j = i + 1; j < candidates.length; j++) {
      if (candidates[j].label === expected) {
        last = j;
        expected = String.fromCharCode(expected.charCodeAt(0) + 1);
        if (expected > 'd') break;
      }
    }

    if (last - i >= 2 && candidates[last].idx - candidates[i].idx <= INLINE_OPTIONS_MAX_SPAN) {
      start = i;
      end = last;
      break;
    }
  }

  if (start < 0) return { stem: text, options: [] };

  const chosen = candidates.slice(start, end + 1);
  const stem = text.slice(0, chosen[0].idx).trim();

  const options: SourceOption[] = [];
  for (let i = 0; i < chosen.length; i++) {
    const optStart = chosen[i].end;
    const optEnd = chosen[i + 1]?.idx ?? text.length;
    const optText = text.slice(optStart, optEnd).trim();
    if (!optText) continue;
    options.push({ label: chosen[i].label, text: optText });
  }

  if (options.length < 3) return { stem: text, options: [] };
  return { stem, options };
}

export function parseSourceItems(text: string): SourceItem[] {
  const starts = [...text.matchAll(new RegExp(ITEM_START.source, 'gm'))];
  if (starts.length === 0) {
    return text.trim() ? [createSourceItem(text.trim())] : [];
  }

  return starts
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = starts[index + 1]?.index ?? text.length;
      return createSourceItem(text.slice(start, end).trim());
    })
    .filter((item) => item.stem || item.sub_questions.length > 0);
}

function createSourceItem(itemText: string): SourceItem {
  const markers = [...itemText.matchAll(SUBQUESTION)];

  // Standalone (non-testlet) item — inline options may live in the whole text.
  if (markers.length === 0) {
    const { stem, options } = splitInlineOptions(itemText);
    if (!stem.trim() && options.length === 0) {
      return { stem: '', sub_questions: [], is_testlet: false };
    }

    const subQuestion: SourceSubQuestion = { number: 1, text: stem };
    if (options.length) subQuestion.options = options;

    const item: SourceItem = { stem, sub_questions: [subQuestion], is_testlet: false };
    if (options.length) item.options = options;
    return item;
  }

  // Testlet — stem + Question 1/2/3 …
  const rawStem = itemText.slice(0, markers[0].index ?? 0).trim();
  const { stem, options: stemOptions } = splitInlineOptions(rawStem);

  const sub_questions = markers
    .map((marker, index) => {
      const contentStart = (marker.index ?? 0) + marker[0].length;
      const contentEnd = markers[index + 1]?.index ?? itemText.length;
      const rawText = itemText.slice(contentStart, contentEnd).trim();

      // Inline options can live inside a sub-question, not just the stem.
      const { stem: subStem, options: subOptions } = splitInlineOptions(rawText);

      const sub: SourceSubQuestion = { number: Number(marker[1]), text: subStem };
      if (subOptions.length) sub.options = subOptions;
      return sub;
    })
    // BUG 4: drop sub-questions whose stem ended up empty after stripping options.
    .filter((sub) => sub.text.trim().length > 0);

  const item: SourceItem = { stem, sub_questions, is_testlet: true };
  if (stemOptions.length) item.options = stemOptions;
  return item;
}

export function formatSourceItems(items: SourceItem[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n');
}