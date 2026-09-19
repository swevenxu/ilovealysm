'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  BrainCircuit,
  Trash2,
} from 'lucide-react';

interface FileDetail {
  id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  upload_date: string;
  verification_status: string;
  verification_report: any;
  page_count: number | null;
  file_size_bytes: number | null;
  processing_status: string;
  pages: Array<{
    id: string;
    page_number: number;
    raw_text: string | null;
    extraction_method: string;
  }>;
  quizzes: Array<{
    id: string;
    question: string;
    format: string;
    difficulty: string;
  }>;
  topics: Array<{
    id: string;
    name: string;
    color: string;
    icon: string;
  }>;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'readable':
      return <span className="badge badge-readable"><CheckCircle2 size={12} /> Verified</span>;
    case 'needs_ocr':
      return <span className="badge badge-needs-ocr"><AlertTriangle size={12} /> Needs OCR</span>;
    case 'corrupted':
      return <span className="badge badge-corrupted"><XCircle size={12} /> Failed</span>;
    default:
      return <span className="badge badge-pending"><Clock size={12} /> Pending</span>;
  }
}

export default function FileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;

  const [file, setFile] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pages' | 'quizzes'>('pages');
  const [generating, setGenerating] = useState<'quizzes' | null>(null);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);

  useEffect(() => {
    loadFile();
  }, [fileId]);

  async function loadFile() {
    try {
      const res = await fetch(`/api/files/${fileId}`);
      if (res.ok) {
        const data = await res.json();
        setFile(data);
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteFile() {
    if (!file || !confirm('Are you sure you want to delete this file and all its data?')) return;
    try {
      const res = await fetch(`/api/files/${file.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/files');
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
          <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 'var(--radius-full)' }} />
          <div className="skeleton" style={{ width: 300, height: 24 }} />
        </div>
        <div className="glass-card" style={{ padding: 'var(--space-8)' }}>
          <div className="skeleton" style={{ width: '80%', height: 20, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: '40%', height: 16 }} />
        </div>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="page-container">
        <div className="empty-state glass-card">
          <div className="empty-state-title">File not found</div>
          <div className="empty-state-description">This file may have been deleted.</div>
          <Link href="/files" className="btn btn-primary">Back to Files</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="animate-in animate-in-1" style={{ marginBottom: 'var(--space-6)' }}>
        <Link href="/files" className="btn btn-ghost" style={{ padding: 0 }}>
          <ArrowLeft size={16} /> Back to Files
        </Link>
      </div>

      {/* Header */}
      <div className="animate-in animate-in-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-8)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          <div
            className={`file-icon file-icon-${file.file_type}`}
            style={{ width: 56, height: 56, fontSize: 'var(--text-2xl)' }}
          >
            {file.file_type.toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              {file.filename}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span>{file.file_type.toUpperCase()}</span>
              <span>•</span>
              <span>{formatBytes(file.file_size_bytes)}</span>
              {file.page_count && (
                <>
                  <span>•</span>
                  <span>{file.page_count} pages</span>
                </>
              )}
              <span>•</span>
              <StatusBadge status={file.verification_status} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-danger btn-sm" onClick={deleteFile}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* Topics */}
      {file.topics.length > 0 && (
        <div className="animate-in animate-in-2" style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
          {file.topics.map((topic) => (
            <span key={topic.id} className="chip active">
              {topic.name}
            </span>
          ))}
        </div>
      )}

      {/* Verification Report */}
      {file.verification_report && (
        <div className="glass-card animate-in animate-in-3" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
            Verification Report
          </h3>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
            {file.verification_report.message}
          </p>
          {file.verification_report.pages && file.verification_report.pages.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {file.verification_report.pages.map((p: any) => (
                <div
                  key={p.page_number}
                  className="tooltip"
                  data-tooltip={`Page ${p.page_number}: ${p.has_text_layer ? `${p.text_length} chars` : 'No text layer'}`}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    background: p.has_text_layer ? 'var(--accent-emerald-glow)' : 'var(--accent-amber-glow)',
                    color: p.has_text_layer ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
                    border: `1px solid ${p.has_text_layer ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
                  }}
                >
                  {p.page_number}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="animate-in animate-in-4" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'pages' ? 'active' : ''}`}
            onClick={() => setActiveTab('pages')}
          >
            Pages ({file.pages.length})
          </button>
          <button
            className={`tab ${activeTab === 'quizzes' ? 'active' : ''}`}
            onClick={() => setActiveTab('quizzes')}
          >
            Quizzes ({file.quizzes.length})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-in animate-in-5">
        {activeTab === 'pages' && (
          <div>
            {file.pages.length === 0 ? (
              <div className="empty-state glass-card">
                <div className="empty-state-title">No pages extracted yet</div>
                <div className="empty-state-description">
                  Text extraction happens during the verification pipeline.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {file.pages.map((page) => (
                  <div key={page.id} className="glass-card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={() => setExpandedPage(expandedPage === page.page_number ? null : page.page_number)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          background: 'var(--bg-elevated)',
                          padding: 'var(--space-1) var(--space-2)',
                          borderRadius: 'var(--radius-sm)',
                        }}>
                          P{page.page_number}
                        </span>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                          Page {page.page_number}
                        </span>
                        <span className={`badge ${page.extraction_method === 'ocr' ? 'badge-needs-ocr' : 'badge-readable'}`}>
                          {page.extraction_method === 'ocr' ? 'OCR' : 'Direct'}
                        </span>
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                        {page.raw_text ? `${page.raw_text.length.toLocaleString()} chars` : 'Empty'}
                      </span>
                    </div>
                    {expandedPage === page.page_number && page.raw_text && (
                      <div style={{
                        marginTop: 'var(--space-4)',
                        padding: 'var(--space-4)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-lg)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        lineHeight: 1.6,
                        maxHeight: 400,
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: 'var(--text-secondary)',
                      }}>
                        {page.raw_text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'quizzes' && (
          <div>
            {file.quizzes.length === 0 ? (
              <div className="empty-state glass-card">
                <div className="empty-state-title">No quizzes generated yet</div>
                <div className="empty-state-description">
                  Click &ldquo;Generate Quizzes&rdquo; to create questions from this file&apos;s content.
                </div>
                <Link className="btn btn-primary" href="/quizzes">
                  <BrainCircuit size={16} /> Open Quizzes
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {file.quizzes.map((quiz) => (
                  <div key={quiz.id} className="glass-card" style={{ padding: 'var(--space-5)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
                          {quiz.question.length > 120 ? quiz.question.slice(0, 120) + '...' : quiz.question}
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <span className="badge badge-processing">{quiz.format === 'multiple_choice' ? 'MC' : 'Flash'}</span>
                          <span className="badge badge-pending">{quiz.difficulty}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
