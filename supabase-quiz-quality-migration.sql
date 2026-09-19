-- ============================================================
-- Quiz quality migration
-- Adds source grounding + true_false format support.
-- Safe to run on an existing Study Hub database.
-- ============================================================

-- 1. Source-grounding column
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS source_quote TEXT;

-- 2. Allow 'true_false' as a quiz format
ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_format_check;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_format_check
  CHECK (format IN ('multiple_choice', 'flashcard', 'true_false'));