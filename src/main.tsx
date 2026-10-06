import React, {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
} from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const App = React.lazy(() => import('./App.tsx'));

class KeyBootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      localStorage.setItem(
        'key_last_boot_error_v1',
        JSON.stringify({
          message: error.message,
          stack: error.stack || '',
          componentStack: info.componentStack || '',
          capturedAt: new Date().toISOString(),
          href: window.location.href,
        }),
      );
    } catch {
      // Ignore storage failures so the diagnostic screen still renders.
    }
  }

  render() {
    if (this.state.error) {
      const error = this.state.error;

      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#020617',
            color: '#f8fafc',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                marginBottom: 12,
              }}
            >
              Key boot error
            </h1>

            <p
              style={{
                color: '#fda4af',
                marginBottom: 16,
              }}
            >
              The Key application failed while rendering. The error is shown
              below instead of a blank browser.
            </p>

            <pre
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 16,
                fontSize: 13,
              }}
            >
              {error.message}
              {'\n\n'}
              {error.stack || 'No stack trace available.'}
            </pre>

            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #475569',
                background: '#10b981',
                color: '#020617',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Reload Key
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  document.body.innerHTML =
    '<main style="padding:24px;font-family:system-ui;background:#020617;color:#f8fafc;min-height:100vh"><h1>Key boot error</h1><p>Root element #root is missing from index.html.</p></main>';
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <KeyBootErrorBoundary>
        <Suspense
          fallback={
            <div
              style={{
                minHeight: '100vh',
                background: '#020617',
                color: '#f8fafc',
                padding: 24,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              Loading Key…
            </div>
          }
        >
          <App />
        </Suspense>
      </KeyBootErrorBoundary>
    </StrictMode>,
  );
}
