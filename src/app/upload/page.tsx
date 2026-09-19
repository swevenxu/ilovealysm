'use client';

import { useState, useEffect } from 'react';
import {
  HardDrive,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  FolderOpen,
  Zap,
} from 'lucide-react';

interface ScannedTopic {
  folder: string;
  topicName: string;
  fileCount: number;
  totalSizeBytes: number;
  extensions: string[];
}

interface ScannedFile {
  filename: string;
  filepath: string;
  relativePath: string;
  folder: string;
  topicPath: string;
  extension: string;
  sizeBytes: number;
}

interface ScanResult {
  rootPath: string;
  totalFiles: number;
  totalSizeBytes: number;
  topics: ScannedTopic[];
  files: ScannedFile[];
}

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  error?: string;
  results: Array<{
    filename: string;
    status: string;
    reason?: string;
    verificationStatus?: string;
    pageCount?: number;
  }>;
}

function getTopFolder(topicPath: string): string {
  return topicPath.split('/')[0] || 'Root';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getExtIcon(ext: string): string {
  return ext.toUpperCase();
}

export default function ScanImportPage() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  // Scan and synchronize the local study library on page load.
  useEffect(() => {
    void handleScan();
    // This is intentionally a one-time startup synchronization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    setImportResult(null);

    try {
      const res = await fetch('/api/scan');
      if (res.ok) {
        const data = await res.json();
        setScanResult(data);
        setSelectedTopics(new Set(data.topics.map((t: ScannedTopic) => t.folder)));
      }
    } catch (error) {
      console.error('Scan failed:', error);
    } finally {
      setScanning(false);
    }
  }

  function toggleTopic(folder: string) {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  function toggleAll() {
    if (!scanResult) return;
    if (selectedTopics.size === scanResult.topics.length) {
      setSelectedTopics(new Set());
    } else {
      setSelectedTopics(new Set(scanResult.topics.map((t) => t.folder)));
    }
  }

  async function importFiles(filesToImport: ScannedFile[]) {
    setImporting(true);
    setImportProgress(0);
    setImportResult(null);

    // Import in batches of 10 to avoid timeouts
    const batchSize = 10;
    const allResults: ImportResult['results'] = [];
    let totalImported = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let syncErrorMessage: string | undefined;

    for (let i = 0; i < filesToImport.length; i += batchSize) {
      const batch = filesToImport.slice(i, i + batchSize);

      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: batch }),
        });

        if (res.ok) {
          const data: ImportResult = await res.json();
          allResults.push(...data.results);
          totalImported += data.imported;
          totalSkipped += data.skipped;
          totalFailed += data.failed;
        } else {
          const errorData = await res.json().catch(() => ({}));
          if (res.status === 503) {
            syncErrorMessage = errorData.error || 'Database is not configured.';
          }
          totalFailed += batch.length;
          allResults.push(
            ...batch.map((file) => ({
              filename: file.filename,
              status: 'failed',
              reason: errorData.error || 'Import request failed',
            })),
          );
        }
      } catch (error) {
        console.error('Import batch failed:', error);
        totalFailed += batch.length;
      }

      setImportProgress(
        filesToImport.length === 0
          ? 100
          : Math.min(100, Math.round(((i + batch.length) / filesToImport.length) * 100)),
      );
    }

    setImportResult({
      total: filesToImport.length,
      imported: totalImported,
      skipped: totalSkipped,
      failed: totalFailed,
      error: syncErrorMessage,
      results: allResults,
    });
    setImporting(false);
  }

  async function handleImport() {
    if (!scanResult) return;

    const selectedFiles = scanResult.files.filter((f) => {
      const topFolder = getTopFolder(f.topicPath);
      return selectedTopics.has(topFolder);
    });

    await importFiles(selectedFiles);
  }

  const selectedFileCount = scanResult
    ? scanResult.files.filter((f) => {
        const topFolder = getTopFolder(f.topicPath);
        return selectedTopics.has(topFolder);
      }).length
    : 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Study Library</h1>
        <p className="page-subtitle">
          Your study materials are automatically discovered and processed from the local folders
        </p>
      </div>

      {/* Scan Status Bar */}
      <div className="glass-card animate-in animate-in-1" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <div className="scan-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--radius-xl)',
              background: 'var(--accent-blue-glow)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue-light)',
            }}>
              <HardDrive size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>
                {scanResult ? scanResult.rootPath : 'Ready to scan'}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                {scanning
                  ? 'Scanning directories...'
                  : scanResult
                    ? `Found ${scanResult.totalFiles} files in ${scanResult.topics.length} folders (${formatBytes(scanResult.totalSizeBytes)})`
                    : 'Click "Scan" to discover your study materials'}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={handleScan} disabled={scanning}>
            {scanning ? (
              <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Scanning...</>
            ) : (
              <><RefreshCw size={16} /> Re-scan & Sync</>
            )}
          </button>
        </div>
      </div>

      {/* Scan Results */}
      {scanning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-card" style={{ padding: 'var(--space-4)' }}>
              <div className="skeleton" style={{ width: `${60 + i * 5}%`, height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '30%', height: 12 }} />
            </div>
          ))}
        </div>
      )}

      {scanResult && !scanning && (
        <>
          {/* Folder filtering. Synchronization starts only when the user clicks the button. */}
          <div className="scan-header-row" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
                {selectedTopics.size === scanResult.topics.length ? 'Deselect All' : 'Select All'}
              </button>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                {selectedTopics.size} of {scanResult.topics.length} folders selected
                ({selectedFileCount} files)
              </span>
            </div>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleImport}
              disabled={importing || selectedTopics.size === 0}
            >
              {importing ? (
                <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Importing ({importProgress}%)...</>
              ) : (
                <><Zap size={18} /> Sync Selected Files</>
              )}
            </button>
          </div>

          {/* Import Progress */}
          {importing && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${importProgress}%`, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <div className="glass-card animate-in animate-in-1" style={{
              padding: 'var(--space-6)', marginBottom: 'var(--space-6)',
              borderColor: importResult.error
                ? 'rgba(245, 158, 11, 0.4)'
                : importResult.failed > 0
                  ? 'rgba(239, 68, 68, 0.3)'
                  : 'rgba(16, 185, 129, 0.3)',
            }}>
              <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 'var(--text-3xl)' }}>
                  {importResult.failed === 0 ? 'Complete' : 'Attention'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>
                    {importResult.error ? 'Synchronization unavailable' : 'Synchronization complete'}
                  </div>
                  {importResult.error && (
                    <div style={{ color: 'var(--accent-amber)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
                      {importResult.error}. The files above were discovered locally, but were not saved to the study database.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                    <span style={{ color: 'var(--accent-emerald)' }}>
                      <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {importResult.imported} imported
                    </span>
                    {importResult.skipped > 0 && (
                      <span style={{ color: 'var(--accent-amber)' }}>
                        <Clock size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {importResult.skipped} skipped (already exists)
                      </span>
                    )}
                    {!importResult.error && importResult.failed > 0 && (
                      <span style={{ color: 'var(--accent-rose)' }}>
                        <XCircle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> {importResult.failed} failed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Topic Folders */}
          <div className="animate-in animate-in-3" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {scanResult.topics.map((topic) => {
              const isSelected = selectedTopics.has(topic.folder);
              const isExpanded = expandedTopic === topic.folder;
              const topicFiles = scanResult.files.filter((f) => {
                const topFolder = getTopFolder(f.topicPath);
                return topFolder === topic.folder;
              });

              return (
                <div
                  key={topic.folder}
                  className="glass-card"
                  style={{
                    borderColor: isSelected ? 'rgba(59, 130, 246, 0.3)' : undefined,
                    background: isSelected ? 'rgba(59, 130, 246, 0.03)' : undefined,
                  }}
                >
                  {/* Topic Header */}
                  <div
                    style={{
                      padding: 'var(--space-4) var(--space-5)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleTopic(topic.folder)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTopic(topic.folder)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-lg)',
                      background: 'var(--accent-purple-glow)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-lg)',
                      flexShrink: 0,
                    }}>
                      <FolderOpen size={20} style={{ color: 'var(--accent-purple-light)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{topic.folder}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <span>{topic.fileCount} files</span>
                        <span>•</span>
                        <span>{formatBytes(topic.totalSizeBytes)}</span>
                        <span>•</span>
                        <span>{topic.extensions.map((e) => e.toUpperCase()).join(', ')}</span>
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedTopic(isExpanded ? null : topic.folder);
                      }}
                    >
                      {isExpanded ? 'Hide' : 'Show'} files
                    </button>
                  </div>

                  {/* Expanded File List */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 var(--space-5) var(--space-4)',
                      borderTop: '1px solid var(--border-subtle)',
                      marginTop: 'var(--space-1)',
                      paddingTop: 'var(--space-3)',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                        {topicFiles.map((file) => (
                          <div
                            key={file.filepath}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 'var(--space-3)',
                              padding: 'var(--space-2) var(--space-3)',
                              borderRadius: 'var(--radius-md)',
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            <span>{getExtIcon(file.extension)}</span>
                            <span style={{ flex: 1, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                              {file.relativePath}
                            </span>
                            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                              {formatBytes(file.sizeBytes)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
