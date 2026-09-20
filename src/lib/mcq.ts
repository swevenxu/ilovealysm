export interface MultipleChoiceOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  is_correct: boolean;
}

const EXPECTED_LABELS = ['A', 'B', 'C', 'D'] as const;

export function isMultipleChoiceOptions(value: unknown): value is MultipleChoiceOption[] {
  if (!Array.isArray(value) || value.length !== EXPECTED_LABELS.length) return false;

  const hasExpectedLabels = value.every((option, index) => {
    if (!option || typeof option !== 'object') return false;
    const candidate = option as Record<string, unknown>;
    return candidate.label === EXPECTED_LABELS[index]
      && typeof candidate.text === 'string'
      && candidate.text.trim().length > 0
      && typeof candidate.is_correct === 'boolean';
  });

  const options = value as MultipleChoiceOption[];
  return hasExpectedLabels
    && options.filter((option) => option.is_correct).length === 1
    && new Set(options.map((option) => option.text)).size === EXPECTED_LABELS.length;
}
