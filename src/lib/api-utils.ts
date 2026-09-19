/**
 * Utility functions for API routes
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Standard error response format
 */
export function errorResponse(
  message: string,
  statusCode: number = 500,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      ...(details && { details }),
    },
    { status: statusCode }
  );
}

/**
 * Handle unknown errors safely
 */
export function handleError(error: unknown): { message: string; statusCode: number } {
  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode: 500,
    };
  }
  
  if (typeof error === 'string') {
    return {
      message: error,
      statusCode: 500,
    };
  }

  return {
    message: 'An unknown error occurred',
    statusCode: 500,
  };
}

/**
 * Success response helper
 */
export function successResponse<T extends Record<string, unknown>>(
  data: T,
  statusCode: number = 200
): NextResponse {
  return NextResponse.json(data, { status: statusCode });
}

/**
 * Validate required fields in request body
 */
export function validateRequired<T extends Record<string, unknown>>(
  body: T,
  requiredFields: (keyof T)[]
): { valid: true } | { valid: false; missing: string[] } {
  const missing = requiredFields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    return { valid: false, missing: missing.map(String) };
  }

  return { valid: true };
}

/**
 * Validate request body with Zod schema
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<
  | { success: true; data: T }
  | { success: false; response: NextResponse }
> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    
    if (result.success) {
      return { success: true, data: result.data };
    }
    
    const errors = result.error.issues.map((err) => {
      const path = err.path.join('.');
      return path ? `${path}: ${err.message}` : err.message;
    });
    
    return {
      success: false,
      response: errorResponse(`Validation failed: ${errors.join(', ')}`, 400),
    };
  } catch {
    return {
      success: false,
      response: errorResponse('Invalid JSON body', 400),
    };
  }
}
