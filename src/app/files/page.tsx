'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ChevronRight,
} from 'lucide-react';

interface FileItem {
  id: string;
  filename: string;
  file_type: string;
  upload_date: string;
  verification_status: string;
  page_count: number | null;
  file_size_bytes: number | null;
  processing_status: string;
}

function getFileIcon(type: string): string {
  return type.toUpperCase();
}

function getFileIconClass(type: string): string {
  if (type === 'pdf') return 'file-icon-pdf';
  if (type === 'docx') return 'file-icon-docx';
  if (type === 'pptx') return 'file-icon-pptx';
  if (['jpg', 'jpeg', 'png'].includes(type)) return 'file-icon-image';
  return 'file-icon-txt';
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes === 0) return '0 B';
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

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    async function loadFiles() {
      try {
        const res = await fetch('/api/files');
        if (res.ok) {
          const data = await res.json();
          setFiles(data.files || []);
        }
      } catch (error) {
        console.error('Failed to load files:', error);
      } finally {
        setLoading(false);
      }
    }
    loadFiles();
  }, []);

  const filteredFiles = files.filter((f) => {
    if (searchQuery && !f.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterType !== 'all' && f.file_type !== filterType) return false;
    if (filterStatus !== 'all' && f.verification_status !== filterStatus) return false;
    return true;
  });

  const fileTypes = [...new Set(files.map((f) => f.file_type))];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">File Library</h1>
        <p className="page-subtitle">
          Browse and manage your uploaded study materials
        </p>
      </div>

      {/* Filters */}
      <div
        className="animate-in animate-in-1 filter-row"
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div className="search-input-wrapper" style={{ flex: 1, maxWidth: 400 }}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="select-wrapper">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {fileTypes.map((t) => (
              <option key={t} value={t}>{t.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div className="select-wrapper">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="readable">Verified</option>
            <option value="needs_ocr">Needs OCR</option>
            <option value="corrupted">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
          {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* File List */}
      {loading ? (
        <div className="file-list">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="file-item animate-in" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)' }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: '30%', height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="empty-state glass-card animate-in animate-in-1">
          <div className="empty-state-title">
            {files.length === 0 ? 'No files uploaded' : 'No files match your filters'}
          </div>
          <div className="empty-state-description">
            {files.length === 0
              ? 'Upload your study materials to see them here'
              : 'Try adjusting your search or filter criteria'}
          </div>
          {files.length === 0 && (
            <Link href="/upload" className="btn btn-primary">
              Upload Files
            </Link>
          )}
        </div>
      ) : (
        <div className="file-list animate-in animate-in-2">
          {filteredFiles.map((file, index) => (
            <Link
              key={file.id}
              href={`/files/${file.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                className="file-item"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className={`file-icon ${getFileIconClass(file.file_type)}`}>
                  {getFileIcon(file.file_type)}
                </div>
                <div className="file-info">
                  <div className="file-name">{file.filename}</div>
                  <div className="file-meta">
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
                    <span>{new Date(file.upload_date).toLocaleDateString()}</span>
                  </div>
                </div>
                <StatusBadge status={file.verification_status} />
                <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
