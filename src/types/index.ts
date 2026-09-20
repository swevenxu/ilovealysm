/**
 * Shared TypeScript types for Study Hub
 */

// ============================================================
// Error Types
// ============================================================

export interface ApiError {
  error: string;
  details?: string;
  code?: string;
}

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// ============================================================
// Database Record Types (matching Supabase schema)
// ============================================================

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
  file_id: string | null;
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

export interface QuizOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  is_correct: boolean;
}

export interface QuizSubQuestion {
  question: string;
  options: QuizOption[];
  answer: string;
  explanation?: string;
}

export interface QuizRecord {
  id: string;
  file_id: string;
  topic_id: string | null;
  question: string;
  format: 'multiple_choice';
  options: QuizOption[];
  answer: string;
  explanation: string | null;
  source_page: number | null;
  stem: string | null;
  sub_questions: QuizSubQuestion[] | null;
  is_testlet: boolean;
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

// ============================================================
// API Request/Response Types
// ============================================================

export interface UploadResponse {
  id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  upload_date: string;
  verification_status: string;
  processing_status: string;
}

export interface VerifyRequest {
  fileId: string;
}

export interface VerificationReport {
  status: 'readable' | 'needs_ocr' | 'corrupted';
  page_count: number | null;
  file_size_bytes: number | null;
  error?: string;
  warnings?: string[];
}

export interface QuizAttemptRequest {
  selected_answer: string;
  idempotency_key: string;
  time_spent_seconds?: number | null;
}

export interface QuizAttemptResponse {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string | null;
  attemptId: string;
}

export interface SearchQuery {
  q: string;
  topicId?: string;
  limit?: number;
}

export interface SearchResult {
  quizzes: QuizRecord[];
  totalResults: number;
}

export interface SubjectMastery {
  code: string;
  name: string;
  quizCount: number;
  attemptCount: number;
  correctCount: number;
  mastery: number;
}

export interface DashboardStats {
  subjects: SubjectMastery[];
  weakSubjects: SubjectMastery[];
}

export interface TopicWithProgress extends TopicRecord {
  mastery_score?: number;
  total_attempts?: number;
  correct_attempts?: number;
  last_studied?: string | null;
  next_review?: string | null;
}

// ============================================================
// Python Extractor Types
// ============================================================

export interface ExtractedPage {
  page_number: number;
  text: string;
  extraction_method: 'direct' | 'ocr';
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  total_pages: number;
  error?: string;
}

export interface BatchVerificationReport {
  reports: VerificationReport[];
  batch_failed: boolean;
  total_files: number;
  readable: number;
  needs_ocr: number;
  corrupted: number;
}
