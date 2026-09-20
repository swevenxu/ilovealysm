export interface TimestampedAttempt {
  question_id: string;
  is_correct: boolean;
  answered_at: string;
}

/** Returns the single latest saved answer for each question. */
export function latestAttempts<T extends TimestampedAttempt>(attempts: readonly T[]): Map<string, T> {
  const latest = new Map<string, T>();

  for (const attempt of attempts) {
    const previous = latest.get(attempt.question_id);
    if (!previous || attempt.answered_at > previous.answered_at) {
      latest.set(attempt.question_id, attempt);
    }
  }

  return latest;
}
