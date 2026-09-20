-- ============================================================
-- Attempt log + question snapshots
-- Mastery becomes: distinct questions with latest answer correct
-- / distinct questions ever attempted. Survives regeneration.
-- ============================================================

-- 1. Question snapshots — independent of the quizzes table
CREATE TABLE IF NOT EXISTS questions (
  id              TEXT PRIMARY KEY,               -- sha256(normalized question text), 16 hex chars
  topic_id        UUID REFERENCES topics(id) ON DELETE SET NULL,
  question_text   TEXT NOT NULL,
  format          TEXT,
  options         JSONB,
  correct_answer  TEXT NOT NULL,
  explanation     TEXT,
  difficulty      TEXT,
  stem            TEXT,
  sub_questions   JSONB,
  is_testlet      BOOLEAN DEFAULT false,
  source_quote    TEXT,
  first_seen_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic_id);

-- 2. Attempt log — append-only, no FK to quizzes
CREATE TABLE IF NOT EXISTS attempt_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id         TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_answer     TEXT,
  is_correct          BOOLEAN NOT NULL,
  time_spent_seconds  INTEGER,
  answered_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempt_log_question
  ON attempt_log(question_id, answered_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempt_log_answered_at
  ON attempt_log(answered_at DESC);