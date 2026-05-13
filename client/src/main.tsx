import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { Component, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import { VoiceContextProvider } from "@/contexts/VoiceContext";

// ─── Global Error Boundary ────────────────────────────────────────────────────
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[AppErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
          background: "#f8f9fa",
          padding: "2rem",
          textAlign: "center",
        }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1a1a1a", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", marginBottom: "1.5rem", maxWidth: "400px" }}>
            The page encountered an unexpected error. Please reload to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#1a5c38",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 2rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload Page
          </button>
          {process.env.NODE_ENV !== "production" && this.state.error && (
            <pre style={{
              marginTop: "2rem",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "1rem",
              fontSize: "0.75rem",
              color: "#dc2626",
              maxWidth: "600px",
              overflow: "auto",
              textAlign: "left",
            }}>
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Query client ─────────────────────────────────────────────────────────────
const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password"];
  if (publicPaths.some((p) => window.location.pathname.startsWith(p))) return;

  // Save the current path so we can restore it after re-login
  try { sessionStorage.setItem("hibba_return_path", window.location.pathname + window.location.search); } catch { /* storage unavailable */ }

  // Show a friendly toast before redirecting
  toast.warning("Your session has expired. Any unsaved form data has been preserved — please log in again to continue.", {
    duration: 5000,
    id: "session-expired",
  });

  // Short delay so the toast is visible before redirect
  setTimeout(() => { window.location.href = "/login"; }, 1500);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
    // ── Show human-readable error toast for tRPC BAD_REQUEST / FORBIDDEN errors ──
    if (error instanceof TRPCClientError) {
      const code = (error.data as any)?.code;
      const msg = error.message;
      if (code === "BAD_REQUEST" || code === "FORBIDDEN" || code === "NOT_FOUND") {
        // Use sonner toast if available
        toast.error(msg || "An error occurred. Please try again.");
      }
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <VoiceContextProvider>
          <App />
        </VoiceContextProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </AppErrorBoundary>
);
