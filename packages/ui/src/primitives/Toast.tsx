"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Toast — transient feedback, styled 1:1 with the web app's `ui/Toast` + `ToastProvider`
 * (bottom-right stack, left accent border). `ToastProvider` hands out a `toast()` via
 * `useToast()`. Self-contained (the enter keyframe is injected once) so it works in the
 * extension surfaces too — this is the toast surface W3 deferred. A toast that has a timer stops it while the
 * pointer is over it or focus is inside it (so an Undo can be reached), and runs the rest of its time afterwards.
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
  /** A text button in the toast (e.g. "Undo"). Clicking runs `onClick`, then dismisses the toast. */
  action?: { label: string; onClick: () => void };
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
  // Per toast: its timer (null while paused), when it ends, and how long was left when it was paused.
  const timers = useRef(new Map<number, { timer: ReturnType<typeof setTimeout> | null; end: number; left: number }>());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      if (t.timer) clearTimeout(t.timer);
      timers.current.delete(id);
    }
  }, []);

  const arm = useCallback(
    (id: number, ms: number) => {
      timers.current.set(id, { timer: setTimeout(() => dismiss(id), ms), end: Date.now() + ms, left: ms });
    },
    [dismiss],
  );

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t || !t.timer) return;
    clearTimeout(t.timer);
    t.timer = null;
    t.left = Math.max(0, t.end - Date.now());
  }, []);

  const resume = useCallback(
    (id: number) => {
      const t = timers.current.get(id);
      if (!t || t.timer) return;
      arm(id, t.left);
    },
    [arm],
  );

  // No timer outlives the provider.
  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const t of all.values()) if (t.timer) clearTimeout(t.timer);
      all.clear();
    };
  }, []);

  const toast = useCallback<ToastFn>(
    (opts) => {
      const id = ++seq.current;
      setItems((prev) => [...prev, { ...opts, id }]);
      const duration = opts.duration ?? 4000;
      if (duration > 0) arm(id, duration);
    },
    [arm],
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
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            onFocus={() => pause(t.id)}
            onBlur={(e: FocusEvent<HTMLDivElement>) => {
              if (!e.currentTarget.contains(e.relatedTarget)) resume(t.id);
            }}
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
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="flex-none rounded-md px-2 py-1 text-[13px] font-bold text-accent-deep transition-colors hover:bg-accent-soft max-sm:min-h-11"
              >
                {t.action.label}
              </button>
            )}
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
