import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Check if Supabase credentials are configured.
 */
export function isSupabaseConfigured(): boolean {
  return (
    supabaseUrl.startsWith('http') &&
    supabaseAnonKey.length > 10
  );
}

/**
 * Supabase client for browser-side usage.
 * Returns null if not configured.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Get a server-side Supabase client using the service role key.
 * Returns null if not configured.
 */
export function getServerSupabase(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
  if (!supabaseUrl.startsWith('http') || serviceKey.length < 10) {
    return null;
  }
  return createClient(supabaseUrl, serviceKey);
}

/**
 * Type definitions for the database tables.
 * Note: For full type definitions, import from @/types
 */
export interface FileRecord {
  id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  upload_date: string;
  verification_status: 'pending' | 'readable' | 'needs_ocr' | 'corrupted';
  verification_report: Record<string, unknown> | null;
  page_count: number | null;
  file_size_bytes: number | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface PageRecord {
  id: string;
  file_id: string;
  page_number: number;
  raw_text: string | null;
  ocr_text: string | null;
  extraction_method: 'direct' | 'ocr';
}

export interface TopicRecord {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  created_at: string;
}

export interface QuizRecord {
  id: string;
  file_id: string;
  topic_id: string | null;
  question: string;
  format: 'multiple_choice' | 'flashcard';
  options: { label: string; text: string; is_correct: boolean }[] | null;
  answer: string;
  explanation: string | null;
  source_page: number | null;
  difficulty: 'easy' | 'medium' | 'hard';
  created_at: string;
}

export interface QuizAttemptRecord {
  id: string;
  quiz_id: string;
  answered_at: string;
  selected_answer: string | null;
  is_correct: boolean;
  time_spent_seconds: number | null;
}

export interface ProgressRecord {
  id: string;
  topic_id: string;
  mastery_score: number;
  total_attempts: number;
  correct_attempts: number;
  last_studied: string | null;
  next_review: string | null;
  updated_at: string;
}
