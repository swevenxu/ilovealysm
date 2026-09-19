import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { errorResponse, handleError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

type Priority = 'low' | 'medium' | 'high';

interface TodoRow {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  due_date: string | null;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

function shapeTodo(todo: TodoRow) {
  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes,
    priority: todo.priority,
    dueDate: todo.due_date || '',
    completed: todo.completed,
    createdAt: todo.created_at,
    updatedAt: todo.updated_at,
  };
}

function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'medium' || value === 'high';
}

export async function GET() {
  const supabase = getServerSupabase();
  if (!supabase) return errorResponse('Supabase not configured', 503);

  try {
    const { data, error } = await supabase
      .from('todos')
      .select('id, title, notes, priority, due_date, completed, created_at, updated_at')
      .order('completed', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ todos: (data || []).map((todo) => shapeTodo(todo as TodoRow)) });
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return errorResponse('Supabase not configured', 503);

  try {
    const body = await request.json() as {
      title?: unknown;
      notes?: unknown;
      priority?: unknown;
      dueDate?: unknown;
    };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return errorResponse('Task title is required', 400);
    if (body.priority !== undefined && !isPriority(body.priority)) {
      return errorResponse('Invalid task priority', 400);
    }

    const { data, error } = await supabase
      .from('todos')
      .insert({
        title,
        notes: typeof body.notes === 'string' ? body.notes.trim() : '',
        priority: isPriority(body.priority) ? body.priority : 'medium',
        due_date: typeof body.dueDate === 'string' && body.dueDate ? body.dueDate : null,
      })
      .select('id, title, notes, priority, due_date, completed, created_at, updated_at')
      .single();

    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ todo: shapeTodo(data as TodoRow) }, { status: 201 });
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return errorResponse('Supabase not configured', 503);

  try {
    const body = await request.json() as {
      id?: unknown;
      title?: unknown;
      notes?: unknown;
      priority?: unknown;
      dueDate?: unknown;
      completed?: unknown;
    };
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return errorResponse('Task id is required', 400);
    if (body.priority !== undefined && !isPriority(body.priority)) {
      return errorResponse('Invalid task priority', 400);
    }
    if (body.completed !== undefined && typeof body.completed !== 'boolean') {
      return errorResponse('Invalid completed value', 400);
    }

    const updates: Record<string, string | boolean | null> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (!title) return errorResponse('Task title is required', 400);
      updates.title = title;
    }
    if (typeof body.notes === 'string') updates.notes = body.notes.trim();
    if (isPriority(body.priority)) updates.priority = body.priority;
    if (typeof body.dueDate === 'string') updates.due_date = body.dueDate || null;
    if (typeof body.completed === 'boolean') updates.completed = body.completed;

    const { data, error } = await supabase
      .from('todos')
      .update(updates)
      .eq('id', id)
      .select('id, title, notes, priority, due_date, completed, created_at, updated_at')
      .single();

    if (error) return errorResponse(error.message, error.code === 'PGRST116' ? 404 : 500);
    return NextResponse.json({ todo: shapeTodo(data as TodoRow) });
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) return errorResponse('Supabase not configured', 503);

  try {
    const body = await request.json().catch(() => ({})) as { id?: unknown; clearCompleted?: unknown };
    let query = supabase.from('todos').delete();
    if (body.clearCompleted === true) {
      query = query.eq('completed', true);
    } else if (typeof body.id === 'string' && body.id) {
      query = query.eq('id', body.id);
    } else {
      return errorResponse('Task id or clearCompleted is required', 400);
    }

    const { error } = await query;
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ success: true });
  } catch (error) {
    const { message } = handleError(error);
    return errorResponse(message, 500);
  }
}
