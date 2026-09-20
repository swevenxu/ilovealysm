import assert from 'node:assert/strict';
import test from 'node:test';
import { latestAttempts } from './attempts';
import { isMultipleChoiceOptions } from './mcq';
import { questionHash } from './question-hash';

const validOptions = [
  { label: 'A', text: 'First', is_correct: false },
  { label: 'B', text: 'Second', is_correct: true },
  { label: 'C', text: 'Third', is_correct: false },
  { label: 'D', text: 'Fourth', is_correct: false },
] as const;

test('accepts exactly four labelled MCQ options with one correct answer', () => {
  assert.equal(isMultipleChoiceOptions(validOptions), true);
  assert.equal(isMultipleChoiceOptions(validOptions.slice(0, 3)), false);
  assert.equal(isMultipleChoiceOptions([
    ...validOptions.slice(0, 3),
    { label: 'D', text: 'Fourth', is_correct: true },
  ]), false);
  assert.equal(isMultipleChoiceOptions([
    { label: 'B', text: 'Second', is_correct: true },
    ...validOptions.filter((option) => option.label !== 'B'),
  ]), false);
  assert.equal(isMultipleChoiceOptions([
    ...validOptions.slice(0, 3),
    { label: 'D', text: 'Third', is_correct: false },
  ]), false);
});

test('uses the latest saved answer for mastery and review eligibility', () => {
  const latest = latestAttempts([
    { question_id: 'q-1', is_correct: false, answered_at: '2026-09-20T10:00:00.000Z' },
    { question_id: 'q-2', is_correct: false, answered_at: '2026-09-20T10:01:00.000Z' },
    { question_id: 'q-1', is_correct: true, answered_at: '2026-09-20T10:02:00.000Z' },
  ]);

  assert.equal(latest.get('q-1')?.is_correct, true);
  assert.equal(latest.get('q-2')?.is_correct, false);
  assert.equal([...latest.values()].filter((attempt) => !attempt.is_correct).length, 1);
});

test('normalizes equivalent question text to one snapshot identifier', () => {
  assert.equal(
    questionHash('  What is revenue? '),
    questionHash('what   is revenue'),
  );
});
