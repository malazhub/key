import React, {
  Component,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const App = React.lazy(() => import("./App.tsx"));

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
        "key_last_boot_error_v1",
        JSON.stringify({
          message: error.message,
          stack: error.stack || "",
          componentStack: info.componentStack || "",
          capturedAt: new Date().toISOString(),
          href: window.location.href,
        }),
      );
    } catch {
      // Ignore storage failures.
    }
  }

  render() {
    if (this.state.error) {
      const error = this.state.error;

      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#020617",
            color: "#f8fafc",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: 960, margin: "0 auto" }}>
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
                color: "#fda4af",
                marginBottom: 16,
              }}
            >
              The Key application failed while loading. The actual browser
              error is shown below instead of displaying a blank page.
            </p>

            <pre
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 12,
                padding: 16,
                fontSize: 13,
              }}
            >
              {error.message}
              {"\n\n"}
              {error.stack || "No stack trace available."}
            </pre>

            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #475569",
                background: "#10b981",
                color: "#020617",
                fontWeight: 800,
                cursor: "pointer",
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

function KeyLoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#020617",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            marginBottom: 8,
          }}
        >
          Key
        </div>

        <div
          style={{
            color: "#94a3b8",
            fontSize: 14,
          }}
        >
          Loading Key application…
        </div>
      </div>
    </div>
  );
}

function KeyFatalBootError({ error }: { error: Error }) {
  try {
    localStorage.setItem(
      "key_last_boot_error_v1",
      JSON.stringify({
        message: error.message,
        stack: error.stack || "",
        capturedAt: new Date().toISOString(),
        href: window.location.href,
      }),
    );
  } catch {
    // Ignore storage failures.
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#f8fafc",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
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
            color: "#fda4af",
            marginBottom: 16,
          }}
        >
          Key could not load its application module.
        </p>

        <pre
          style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 12,
            padding: 16,
            fontSize: 13,
          }}
        >
          {error.message}
          {"\n\n"}
          {error.stack || "No stack trace available."}
        </pre>

        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #475569",
            background: "#10b981",
            color: "#020617",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Reload Key
        </button>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  document.body.innerHTML = `
    <main
      style="
        padding:24px;
        font-family:system-ui;
        background:#020617;
        color:#f8fafc;
        min-height:100vh
      "
    >
      <h1>Key boot error</h1>
      <p>Root element #root is missing from index.html.</p>
    </main>
  `;
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <KeyBootErrorBoundary>
        <Suspense fallback={<KeyLoadingScreen />}>
          <App />
        </Suspense>
      </KeyBootErrorBoundary>
    </StrictMode>,
  );
}
