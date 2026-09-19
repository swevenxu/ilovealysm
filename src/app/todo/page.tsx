'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  ClipboardList,
  Flag,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

type Priority = 'low' | 'medium' | 'high';
type StatusFilter = 'all' | 'active' | 'completed';
type SortOption = 'due' | 'priority' | 'created';

interface TodoItem {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

interface TodoDraft {
  title: string;
  notes: string;
  priority: Priority;
  dueDate: string;
}

const STORAGE_KEY = 'study-hub-todos';
const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const emptyDraft: TodoDraft = {
  title: '',
  notes: '',
  priority: 'medium',
  dueDate: '',
};

function normalizeTodos(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : `${Date.now()}-${Math.random()}`,
      title: typeof item.title === 'string' ? item.title : '',
      notes: typeof item.notes === 'string' ? item.notes : '',
      priority: (item.priority === 'high' || item.priority === 'low' ? item.priority : 'medium') as Priority,
      dueDate: typeof item.dueDate === 'string' ? item.dueDate : '',
      completed: item.completed === true,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    }))
    .filter((item) => item.title.trim());
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDueDate(dueDate: string) {
  if (!dueDate) return '';
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TodoPage() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [draft, setDraft] = useState<TodoDraft>(emptyDraft);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [sortBy, setSortBy] = useState<SortOption>('due');
  const [showCompleted, setShowCompleted] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loadTodos = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) setTodos(normalizeTodos(JSON.parse(stored)));
      } catch (error) {
        console.error('Failed to load to-do items:', error);
      } finally {
        setHydrated(true);
      }
    }, 0);

    return () => window.clearTimeout(loadTodos);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [hydrated, todos]);

  function updateDraft(field: keyof TodoDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;

    const now = Date.now();
    const newTodo: TodoItem = {
      id: `${now}-${Math.random().toString(36).slice(2)}`,
      title,
      notes: draft.notes.trim(),
      priority: draft.priority,
      dueDate: draft.dueDate,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    setTodos((currentTodos) => [newTodo, ...currentTodos]);
    setDraft(emptyDraft);
  }

  function toggleTodo(id: string) {
    setTodos((currentTodos) => currentTodos.map((todo) => (
      todo.id === id
        ? { ...todo, completed: !todo.completed, updatedAt: Date.now() }
        : todo
    )));
  }

  function updateTodo(id: string, changes: TodoDraft) {
    const title = changes.title.trim();
    if (!title) return;

    setTodos((currentTodos) => currentTodos.map((todo) => (
      todo.id === id
        ? { ...todo, ...changes, title, notes: changes.notes.trim(), updatedAt: Date.now() }
        : todo
    )));
  }

  function deleteTodo(id: string) {
    setTodos((currentTodos) => currentTodos.filter((todo) => todo.id !== id));
  }

  function clearCompleted() {
    setTodos((currentTodos) => currentTodos.filter((todo) => !todo.completed));
  }

  const activeTodos = todos.filter((todo) => !todo.completed);
  const completedTodos = todos.filter((todo) => todo.completed);
  const overdueCount = activeTodos.filter((todo) => todo.dueDate && todo.dueDate < todayString()).length;

  const visibleTodos = useMemo(() => {
    const query = search.trim().toLowerCase();
    return todos
      .filter((todo) => {
        if (statusFilter === 'active' && todo.completed) return false;
        if (statusFilter === 'completed' && !todo.completed) return false;
        if (priorityFilter !== 'all' && todo.priority !== priorityFilter) return false;
        return !query || `${todo.title} ${todo.notes}`.toLowerCase().includes(query);
      })
      .sort((first, second) => {
        if (sortBy === 'priority') return priorityRank[first.priority] - priorityRank[second.priority];
        if (sortBy === 'created') return second.createdAt - first.createdAt;
        if (!first.dueDate && !second.dueDate) return second.createdAt - first.createdAt;
        if (!first.dueDate) return 1;
        if (!second.dueDate) return -1;
        return first.dueDate.localeCompare(second.dueDate);
      });
  }, [priorityFilter, search, sortBy, statusFilter, todos]);

  return (
    <div className="page-container todo-page">
      <div className="page-header">
        <h1 className="page-title">To Do</h1>
      </div>

      <div className="grid grid-4 todo-stats animate-in animate-in-1" style={{ marginBottom: 'var(--space-6)' }}>
        <StatCard label="Active" value={activeTodos.length} icon={<ClipboardList size={18} />} />
        <StatCard label="Completed" value={completedTodos.length} icon={<CheckCircle2 size={18} />} />
        <StatCard label="Overdue" value={overdueCount} icon={<CalendarDays size={18} />} />
        <StatCard label="Completion" value={todos.length ? `${Math.round((completedTodos.length / todos.length) * 100)}%` : '0%'} icon={<Check size={18} />} />
      </div>

      <div className="glass-card todo-composer animate-in animate-in-2" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <form onSubmit={addTodo}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
            <label htmlFor="todo-title" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
              New task
            </label>
            <input id="todo-title" type="text" value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="What needs to get done?" autoComplete="off" style={{ flex: 1, minWidth: 220 }} />
            <button type="submit" className="btn btn-primary" disabled={!draft.title.trim()}><Plus size={16} /> Add task</button>
          </div>
          <div className="todo-draft-fields" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 150px 170px', gap: 'var(--space-3)' }}>
            <input type="text" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Notes or study context (optional)" aria-label="Task notes" />
            <select value={draft.priority} onChange={(event) => updateDraft('priority', event.target.value)} aria-label="Task priority">
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
            <input type="date" value={draft.dueDate} onChange={(event) => updateDraft('dueDate', event.target.value)} aria-label="Task due date" />
          </div>
        </form>
      </div>

      <div className="todo-toolbar animate-in animate-in-3" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-4)', maxWidth: 980 }}>
        <div className="search-input-wrapper" style={{ flex: '1 1 220px', maxWidth: '100%' }}>
          <Search size={16} className="search-icon" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks..." aria-label="Search tasks" />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="Filter tasks by status">
          <option value="all">All tasks</option>
          <option value="active">Active only</option>
          <option value="completed">Completed only</option>
        </select>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)} aria-label="Filter tasks by priority">
          <option value="all">All priorities</option>
          <option value="high">High priority</option>
          <option value="medium">Medium priority</option>
          <option value="low">Low priority</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          <ArrowUpDown size={15} />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} aria-label="Sort tasks">
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
            <option value="created">Recently added</option>
          </select>
        </label>
      </div>

      <div className="todo-list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {visibleTodos.length === 0 ? (
          <div className="empty-state glass-card animate-in animate-in-4">
            <div className="empty-state-icon"><ClipboardList size={48} /></div>
            <div className="empty-state-title">{todos.length ? 'No matching tasks' : 'Nothing on your list'}</div>
            <div className="empty-state-description">{todos.length ? 'Try clearing a filter or searching for something else.' : 'Add a task above to give your next study session a clear direction.'}</div>
          </div>
        ) : (
          <>
            {visibleTodos.filter((todo) => !todo.completed).map((todo) => (
              <TodoRow key={todo.id} todo={todo} onToggle={toggleTodo} onDelete={deleteTodo} onSave={updateTodo} />
            ))}
            {visibleTodos.some((todo) => todo.completed) && (
              <section style={{ marginTop: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCompleted((visible) => !visible)} aria-expanded={showCompleted} style={{ paddingLeft: 0 }}>
                    <CheckCircle2 size={16} /> Completed ({completedTodos.length})
                  </button>
                  {completedTodos.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={clearCompleted}>Clear completed</button>}
                </div>
                {showCompleted && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                    {visibleTodos.filter((todo) => todo.completed).map((todo) => (
                      <TodoRow key={todo.id} todo={todo} onToggle={toggleTodo} onDelete={deleteTodo} onSave={updateTodo} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="glass-card stat-card todo-stat-card">
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{label}</div>
    </div>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
  onSave,
}: {
  todo: TodoItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (id: string, changes: TodoDraft) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TodoDraft>({ title: todo.title, notes: todo.notes, priority: todo.priority, dueDate: todo.dueDate });
  const overdue = !todo.completed && Boolean(todo.dueDate) && todo.dueDate < todayString();

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    onSave(todo.id, draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <form className="glass-card" onSubmit={saveEdit} style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} aria-label="Edit task title" autoFocus />
        <input value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" aria-label="Edit task notes" />
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))} aria-label="Edit task priority">
            <option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option>
          </select>
          <input type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} aria-label="Edit task due date" />
          <button type="submit" className="btn btn-primary"><Check size={15} /> Save</button>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}><X size={15} /> Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="glass-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
      <button type="button" onClick={() => onToggle(todo.id)} aria-label={todo.completed ? `Mark ${todo.title} as active` : `Complete ${todo.title}`} style={{ display: 'inline-flex', color: todo.completed ? 'var(--accent-emerald)' : 'var(--text-muted)', flexShrink: 0, marginTop: 2 }}>
        {todo.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ overflowWrap: 'anywhere', textDecoration: todo.completed ? 'line-through' : 'none', color: todo.completed ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: 600 }}>{todo.title}</span>
          <span className={`badge badge-${todo.priority}`}><Flag size={11} /> {todo.priority}</span>
          {todo.dueDate && <span className={`todo-due-date ${overdue ? 'overdue' : ''}`}><CalendarDays size={13} /> {overdue ? 'Overdue' : formatDueDate(todo.dueDate)}</span>}
        </div>
        {todo.notes && <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)', whiteSpace: 'pre-wrap' }}>{todo.notes}</div>}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} aria-label={`Edit ${todo.title}`}><Pencil size={15} /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(todo.id)} aria-label={`Delete ${todo.title}`}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}
