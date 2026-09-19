-- Add structured testlet context to existing quiz databases.
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS stem TEXT;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS sub_questions JSONB;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS is_testlet BOOLEAN NOT NULL DEFAULT false;
