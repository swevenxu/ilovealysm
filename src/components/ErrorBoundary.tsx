'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component to catch React errors and display fallback UI.
 * 
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render shows the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="page-container">
          <div className="glass-card" style={{ 
            maxWidth: 600, 
            margin: '0 auto', 
            marginTop: 'var(--space-10)',
            padding: 'var(--space-8)',
            textAlign: 'center',
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginBottom: 'var(--space-6)' 
            }}>
              <div style={{ 
                width: 64, 
                height: 64, 
                borderRadius: 'var(--radius-full)',
                background: 'var(--error-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <AlertTriangle size={32} color="var(--error-text)" />
              </div>
            </div>

            <h2 style={{ 
              fontSize: 'var(--text-2xl)', 
              fontWeight: 600,
              marginBottom: 'var(--space-3)',
            }}>
              Something went wrong
            </h2>

            <p style={{ 
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-6)',
            }}>
              We encountered an unexpected error. This has been logged and we&apos;ll look into it.
            </p>

            {this.state.error && (
              <details style={{ 
                marginBottom: 'var(--space-6)',
                textAlign: 'left',
                padding: 'var(--space-4)',
                background: 'var(--glass-bg)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}>
                <summary style={{ 
                  cursor: 'pointer',
                  fontWeight: 500,
                  marginBottom: 'var(--space-2)',
                }}>
                  Error details
                </summary>
                <code style={{ 
                  fontSize: 'var(--text-sm)',
                  color: 'var(--error-text)',
                  display: 'block',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {this.state.error.toString()}
                </code>
                {this.state.errorInfo && (
                  <pre style={{ 
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    marginTop: 'var(--space-2)',
                    overflow: 'auto',
                    maxHeight: 200,
                  }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div style={{ 
              display: 'flex', 
              gap: 'var(--space-3)',
              justifyContent: 'center',
            }}>
              <button 
                onClick={this.handleReset}
                className="btn btn-primary"
              >
                <RefreshCw size={16} />
                Try again
              </button>
              <Link href="/" className="btn btn-secondary">
                <Home size={16} />
                Go home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight error boundary for smaller components
 */
export function SimpleErrorBoundary({ children, fallback }: Props) {
  return (
    <ErrorBoundary
      fallback={
        fallback || (
          <div style={{ 
            padding: 'var(--space-6)',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            <AlertTriangle size={24} style={{ marginBottom: 'var(--space-2)' }} />
            <p>Something went wrong loading this component.</p>
          </div>
        )
      }
    >
      {children}
    </ErrorBoundary>
  );
}
