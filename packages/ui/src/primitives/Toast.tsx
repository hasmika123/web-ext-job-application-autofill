import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Toast — transient feedback. `ToastProvider` renders a fixed bottom-center stack and hands
 * out a `toast()` function via `useToast()`. Self-contained (the enter keyframe is injected
 * once), so it works identically in the web app and the extension surfaces — this is the
 * toast surface W3 deferred for the side panel.
 *
 *   const toast = useToast();
 *   toast({ title: "Saved", variant: "ok" });
 */
export type ToastVariant = "default" | "ok" | "danger" | "warn";

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  /** Auto-dismiss after N ms (default 4000). Pass 0 to require manual dismiss. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ToastFn = (opts: ToastOptions) => void;
const Ctx = createContext<ToastFn | null>(null);

/** Access the toast function. Throws if used outside a ToastProvider. */
export function useToast(): ToastFn {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast() must be used inside <ToastProvider>");
  return ctx;
}

const ACCENT: Record<ToastVariant, string> = {
  default: "border-l-ink",
  ok: "border-l-accent",
  danger: "border-l-danger",
  warn: "border-l-brown",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastFn>(
    (opts) => {
      const id = ++seq.current;
      setItems((prev) => [...prev, { ...opts, id }]);
      const duration = opts.duration ?? 4000;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <style>{"@keyframes kiwi-toast-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}"}</style>
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[9999] flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{ animation: "kiwi-toast-in .18s ease-out" }}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius)] border border-line " +
                "border-l-4 bg-paper px-4 py-3 shadow-[var(--shadow-lg)]",
              ACCENT[t.variant ?? "default"],
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.description != null && (
                <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-paper-2 hover:text-ink"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
