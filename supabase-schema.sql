-- ============================================================
-- Study Hub — Supabase Database Schema
-- Run this in the Supabase SQL Editor to set up all tables.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------
-- files: uploaded documents
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  upload_date TIMESTAMPTZ DEFAULT now(),
  verification_status TEXT DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'readable', 'needs_ocr', 'corrupted')),
  verification_report JSONB,
  page_count INTEGER,
  file_size_bytes BIGINT,
  processing_status TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- -----------------------------------------------------------
-- pages: per-page extracted text, linked to file
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE NOT NULL,
  page_number INTEGER NOT NULL,
  raw_text TEXT,
  ocr_text TEXT,
  extraction_method TEXT DEFAULT 'direct'
    CHECK (extraction_method IN ('direct', 'ocr')),
  UNIQUE(file_id, page_number)
);

-- -----------------------------------------------------------
-- topics: auto-generated or manually assigned tags/subjects
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------
-- file_topics: many-to-many relationship
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_topics (
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (file_id, topic_id)
);

-- -----------------------------------------------------------
-- quizzes: static multiple-choice questions
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id),
  question TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'multiple_choice'
    CHECK (format = 'multiple_choice'),
  options JSONB,
  answer TEXT NOT NULL,
  explanation TEXT,
  source_page INTEGER,
  stem TEXT,
  sub_questions JSONB,
  is_testlet BOOLEAN NOT NULL DEFAULT false,
  difficulty TEXT DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------
-- quiz_attempts: per-attempt logging
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  answered_at TIMESTAMPTZ DEFAULT now(),
  selected_answer TEXT,
  is_correct BOOLEAN NOT NULL,
  time_spent_seconds INTEGER
);

-- -----------------------------------------------------------
-- progress: rolling mastery score per topic
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE UNIQUE NOT NULL,
  mastery_score REAL DEFAULT 0
    CHECK (mastery_score >= 0 AND mastery_score <= 1),
  total_attempts INTEGER DEFAULT 0,
  correct_attempts INTEGER DEFAULT 0,
  last_studied TIMESTAMPTZ,
  next_review TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- -----------------------------------------------------------
-- Indexes for performance
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pages_file_id ON pages(file_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_file_id ON quizzes(file_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_topic_id ON quizzes(topic_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_progress_topic_id ON progress(topic_id);
CREATE INDEX IF NOT EXISTS idx_files_verification_status ON files(verification_status);
CREATE INDEX IF NOT EXISTS idx_files_processing_status ON files(processing_status);

-- -----------------------------------------------------------
-- todos: persistent study tasks
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

-- -----------------------------------------------------------
-- Supabase Storage bucket for raw files
-- -----------------------------------------------------------
-- Run in Supabase Dashboard > Storage > Create bucket:
-- Name: study-files
-- Public: false
-- File size limit: 50MB
-- Allowed MIME types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document,
--   application/vnd.openxmlformats-officedocument.presentationml.presentation,
--   text/plain, text/markdown, image/jpeg, image/png
