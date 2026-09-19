'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search as SearchIcon, FileText, Loader2 } from 'lucide-react';

interface SearchResult {
  type: 'file' | 'quiz';
  id: string;
  title: string;
  snippet: string;
  file_type?: string;
  topic?: string;
  source_file?: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }

    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }

  }

  function getResultIcon(type: string) {
    switch (type) {
      case 'file': return <FileText size={18} style={{ color: 'var(--accent-blue)' }} />;
      default: return <FileText size={18} style={{ color: 'var(--text-muted)' }} />;
    }
  }

  function getResultLink(result: SearchResult) {
    switch (result.type) {
      case 'file': return `/files/${result.id}`;
      default: return '#';
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Search</h1>
        <p className="page-subtitle">Search across all your files</p>
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearch} className="animate-in animate-in-1">
        <div style={{ display: 'flex', gap: 'var(--space-3)', maxWidth: 700, flexWrap: 'wrap' }}>
          <div className="search-input-wrapper" style={{ flex: 1, maxWidth: '100%' }}>
            <SearchIcon size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search files, topics..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', fontSize: 'var(--text-lg)', padding: 'var(--space-4) var(--space-4) var(--space-4) var(--space-12)' }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <SearchIcon size={18} />}
            Search
          </button>
        </div>
      </form>

      {/* Results */}
      <div style={{ marginTop: 'var(--space-8)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card" style={{ padding: 'var(--space-5)' }}>
                <div className="skeleton" style={{ width: '70%', height: 16, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: '90%', height: 12 }} />
              </div>
            ))}
          </div>
        ) : searched && results.length === 0 ? (
          <div className="empty-state glass-card animate-in animate-in-1">
            <div className="empty-state-title">No results found</div>
            <div className="empty-state-description">
              Try different keywords or upload more study materials
            </div>
          </div>
        ) : results.length > 0 ? (
          <div className="animate-in animate-in-2">
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-4)' }}>
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {results.map((result, idx) => (
                <Link key={`${result.type}-${result.id}-${idx}`} href={getResultLink(result)} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="glass-card" style={{ padding: 'var(--space-5)', display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
                    <div style={{ marginTop: 2 }}>{getResultIcon(result.type)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-1)' }}>
                        {result.title}
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {result.snippet}
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                        <span className="badge badge-processing" style={{ textTransform: 'capitalize' }}>{result.type}</span>
                        {result.topic && (
                          <span className="chip" style={{ fontSize: '0.65rem' }}>
                            {result.topic}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
