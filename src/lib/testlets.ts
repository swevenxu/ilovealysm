export interface SourceSubQuestion {
  number: number;
  text: string;
}

export interface SourceItem {
  stem: string;
  sub_questions: SourceSubQuestion[];
  is_testlet: boolean;
}

const ITEM_START = /^\s*(\d+)\.\s+(?=[A-Z])/m;
const SUBQUESTION = /Question\s+(\d+)\s*:/gi;

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
  if (markers.length === 0) {
    return {
      stem: itemText,
      sub_questions: [{ number: 1, text: itemText }],
      is_testlet: false,
    };
  }

  const stem = itemText.slice(0, markers[0].index ?? 0).trim();
  const sub_questions = markers.map((marker, index) => {
    const contentStart = (marker.index ?? 0) + marker[0].length;
    const contentEnd = markers[index + 1]?.index ?? itemText.length;
    return {
      number: Number(marker[1]),
      text: itemText.slice(contentStart, contentEnd).trim(),
    };
  }).filter((subQuestion) => subQuestion.text);

  return { stem, sub_questions, is_testlet: true };
}

export function formatSourceItems(items: SourceItem[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n');
}
