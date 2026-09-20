/**
 * Zod validation schemas for API requests
 */

import { z } from 'zod';

// ============================================================
// File Operations
// ============================================================

export const uploadFileSchema = z.object({
  file: z.instanceof(File).refine(
    (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return ['pdf', 'docx', 'pptx', 'txt', 'md', 'jpg', 'jpeg', 'png'].includes(ext);
    },
    { message: 'Unsupported file type' }
  ).refine(
    (file) => file.size <= 50 * 1024 * 1024, // 50MB
    { message: 'File size must be less than 50MB' }
  ),
});

export const verifyFileSchema = z.object({
  fileId: z.string().uuid('Invalid file ID format'),
});

export const quizAttemptSchema = z.object({
  selected_answer: z.string().min(1, 'Answer is required'),
  idempotency_key: z.string().uuid('Invalid attempt ID'),
  time_spent_seconds: z.number().int().min(0).nullable().optional(),
});

export const reviewAttemptSchema = z.object({
  question_id: z.string().regex(/^[a-f0-9]{16}$/, 'Invalid question ID'),
  selected_answer: z.string().min(1, 'Answer is required'),
  idempotency_key: z.string().uuid('Invalid attempt ID'),
  time_spent_seconds: z.number().int().min(0).nullable().optional(),
});

// ============================================================
// Topic Management
// ============================================================

export const createTopicSchema = z.object({
  name: z.string().min(1, 'Topic name is required').max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
  icon: z.string().max(10).optional(),
});

// ============================================================
// Search
// ============================================================

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  topicId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// ============================================================
// File Import
// ============================================================

export const importFileSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  filename: z.string().min(1, 'Filename is required'),
});

// ============================================================
// Helper function to validate and return parsed data or error
// ============================================================

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.issues.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
  
  return { success: false, errors };
}

/**
 * Middleware-style validator for API routes
 */
export async function validateBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ valid: true; data: T } | { valid: false; errors: string[] }> {
  try {
    const body = await request.json();
    const result = validateRequest(schema, body);
    
    if (result.success) {
      return { valid: true, data: result.data };
    }
    
    return { valid: false, errors: result.errors };
  } catch {
    return { valid: false, errors: ['Invalid JSON body'] };
  }
}
