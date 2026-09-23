-- MCQ-only study flow hardening.
-- Apply after supabase-attempt-log-migration.sql.
-- Re-runnable: drops + recreates the attempt RPCs, which now also return
-- correct_answer and explanation (sent to the UI only after an answer is
-- recorded, so the correct answer is never exposed before answering).

BEGIN;

-- Remove legacy formats and their dependent attempt history. Existing MCQ history is retained.
DELETE FROM quizzes WHERE format IS DISTINCT FROM 'multiple_choice';
DELETE FROM questions WHERE format IS DISTINCT FROM 'multiple_choice';

CREATE OR REPLACE FUNCTION is_valid_multiple_choice_options(p_options JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_typeof(p_options) = 'array'
    AND jsonb_array_length(p_options) = 4
    AND (
      SELECT COUNT(*) = 4
      FROM jsonb_array_elements(p_options) WITH ORDINALITY AS option_value(option, position)
      WHERE option ->> 'label' = CASE position
        WHEN 1 THEN 'A' WHEN 2 THEN 'B' WHEN 3 THEN 'C' WHEN 4 THEN 'D'
      END
        AND jsonb_typeof(option -> 'text') = 'string'
        AND btrim(option ->> 'text') <> ''
        AND jsonb_typeof(option -> 'is_correct') = 'boolean'
    )
    AND (
      SELECT COUNT(*) = 1
      FROM jsonb_array_elements(p_options) AS option_value(option)
      WHERE option ->> 'is_correct' = 'true'
    )
    AND (
      SELECT COUNT(DISTINCT option ->> 'text') = 4
      FROM jsonb_array_elements(p_options) AS option_value(option)
    ),
    FALSE
  );
$$;

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_format_check;
ALTER TABLE quizzes
  ADD CONSTRAINT quizzes_format_check CHECK (format = 'multiple_choice');
ALTER TABLE quizzes
  ALTER COLUMN format SET DEFAULT 'multiple_choice';
ALTER TABLE quizzes
  ALTER COLUMN options SET NOT NULL;
ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_options_check;
ALTER TABLE quizzes
  ADD CONSTRAINT quizzes_options_check CHECK (is_valid_multiple_choice_options(options));

ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_format_check;
ALTER TABLE questions
  ALTER COLUMN format SET NOT NULL;
ALTER TABLE questions
  ADD CONSTRAINT questions_format_check CHECK (format = 'multiple_choice');
ALTER TABLE questions
  ALTER COLUMN format SET DEFAULT 'multiple_choice';
ALTER TABLE questions
  ALTER COLUMN options SET NOT NULL;
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_options_check;
ALTER TABLE questions
  ADD CONSTRAINT questions_options_check CHECK (is_valid_multiple_choice_options(options));

ALTER TABLE attempt_log
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attempt_log_idempotency_key
  ON attempt_log(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Return type changed (adds correct_answer, explanation). Postgres cannot
-- CREATE OR REPLACE a function whose return type changed, so drop first.
DROP FUNCTION IF EXISTS record_multiple_choice_attempt(TEXT, TEXT, UUID, INTEGER);
DROP FUNCTION IF EXISTS record_quiz_attempt(UUID, TEXT, TEXT, UUID, INTEGER);

CREATE OR REPLACE FUNCTION record_multiple_choice_attempt(
  p_question_id TEXT,
  p_selected_answer TEXT,
  p_idempotency_key UUID,
  p_time_spent_seconds INTEGER DEFAULT NULL
)
RETURNS TABLE (attempt_id UUID, question_id TEXT, is_correct BOOLEAN, correct_answer TEXT, explanation TEXT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_options JSONB;
  v_is_correct BOOLEAN;
  v_is_valid_answer BOOLEAN;
  v_explanation TEXT;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;

  SELECT q.options, q.explanation INTO v_options, v_explanation
  FROM questions q
  WHERE q.id = p_question_id
    AND q.format = 'multiple_choice';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  -- Idempotent replay: return the already-recorded attempt (with reveal data).
  SELECT a.id, a.question_id, a.is_correct
  INTO attempt_id, question_id, is_correct
  FROM attempt_log a
  WHERE a.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    correct_answer := (
      SELECT option_value ->> 'text'
      FROM jsonb_array_elements(v_options) AS option_value
      WHERE option_value ->> 'is_correct' = 'true'
      LIMIT 1
    );
    explanation := v_explanation;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT is_valid_multiple_choice_options(v_options) THEN
    RAISE EXCEPTION 'question options are invalid';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_options) option_value
    WHERE option_value ->> 'text' = p_selected_answer
  ) INTO v_is_valid_answer;

  IF NOT v_is_valid_answer THEN
    RAISE EXCEPTION 'selected answer is not a valid option';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_options) option_value
    WHERE option_value ->> 'text' = p_selected_answer
      AND option_value ->> 'is_correct' = 'true'
  ) INTO v_is_correct;

  INSERT INTO attempt_log AS a (
    question_id,
    selected_answer,
    is_correct,
    time_spent_seconds,
    idempotency_key
  ) VALUES (
    p_question_id,
    p_selected_answer,
    v_is_correct,
    p_time_spent_seconds,
    p_idempotency_key
  )
  ON CONFLICT DO NOTHING
  RETURNING a.id, a.question_id, a.is_correct
  INTO attempt_id, question_id, is_correct;

  IF NOT FOUND THEN
    -- Concurrent insert won the race on the idempotency key; replay it.
    SELECT a.id, a.question_id, a.is_correct
    INTO attempt_id, question_id, is_correct
    FROM attempt_log a
    WHERE a.idempotency_key = p_idempotency_key;
  END IF;

  correct_answer := (
    SELECT option_value ->> 'text'
    FROM jsonb_array_elements(v_options) AS option_value
    WHERE option_value ->> 'is_correct' = 'true'
    LIMIT 1
  );
  explanation := v_explanation;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION record_quiz_attempt(
  p_quiz_id UUID,
  p_question_id TEXT,
  p_selected_answer TEXT,
  p_idempotency_key UUID,
  p_time_spent_seconds INTEGER DEFAULT NULL
)
RETURNS TABLE (attempt_id UUID, question_id TEXT, is_correct BOOLEAN, correct_answer TEXT, explanation TEXT)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_quiz quizzes%ROWTYPE;
BEGIN
  SELECT q.* INTO v_quiz
  FROM quizzes q
  WHERE q.id = p_quiz_id
    AND q.file_id IS NULL
    AND q.format = 'multiple_choice';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quiz not found';
  END IF;

  INSERT INTO questions (
    id,
    topic_id,
    question_text,
    format,
    options,
    correct_answer,
    explanation,
    difficulty,
    stem,
    sub_questions,
    is_testlet,
    source_quote
  ) VALUES (
    p_question_id,
    v_quiz.topic_id,
    v_quiz.question,
    'multiple_choice',
    v_quiz.options,
    v_quiz.answer,
    v_quiz.explanation,
    v_quiz.difficulty,
    v_quiz.stem,
    v_quiz.sub_questions,
    v_quiz.is_testlet,
    v_quiz.source_quote
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY
  SELECT * FROM record_multiple_choice_attempt(
    p_question_id,
    p_selected_answer,
    p_idempotency_key,
    p_time_spent_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION record_multiple_choice_attempt(TEXT, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_quiz_attempt(UUID, TEXT, TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_multiple_choice_attempt(TEXT, TEXT, UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION record_quiz_attempt(UUID, TEXT, TEXT, UUID, INTEGER)
  TO service_role;

COMMIT;
