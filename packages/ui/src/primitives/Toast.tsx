import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Toast — transient feedback, styled 1:1 with the web app's `ui/Toast` + `ToastProvider`
 * (bottom-right stack, left accent border). `ToastProvider` hands out a `toast()` via
 * `useToast()`. Self-contained (the enter keyframe is injected once) so it works in the
 * extension surfaces too — this is the toast surface W3 deferred.
 *
 *   const toast = useToast();
 *   toast({ title: "Saved", variant: "success" });
 */
export type ToastVariant = "default" | "success" | "error";

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
  default: "border-l-line",
  success: "border-l-accent",
  error: "border-l-danger",
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
      <style>{"@keyframes kiwi-toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"}</style>
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-full max-w-[360px] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{ animation: "kiwi-toast-in .2s ease-out" }}
            className={cn(
              "pointer-events-auto flex min-w-[260px] max-w-[92vw] items-start gap-3 rounded-[var(--radius)] border border-line " +
                "border-l-4 bg-paper px-4 py-3 text-sm text-ink shadow-[var(--shadow-lg)]",
              ACCENT[t.variant ?? "default"],
            )}
          >
            <div className="flex-1">
              {t.title != null && <p className="font-semibold">{t.title}</p>}
              {t.description != null && <div className="text-[13px] text-ink-soft">{t.description}</div>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="flex-none rounded-md px-1.5 text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
