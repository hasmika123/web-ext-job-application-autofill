"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Toast, { type ToastVariant } from "./Toast";

export interface ToastInput {
  title?: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  /** Auto-dismiss after this many ms (default 4000; 0 = sticky). */
  duration?: number;
}

type ToastItem = ToastInput & { id: number };

const ToastCtx = createContext<{ toast: (t: ToastInput) => void } | null>(null);

/** Fire a toast from any client component. Must be under <ToastProvider> (mounted in the root layout). */
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = (idRef.current += 1);
      setItems((xs) => [...xs, { ...t, id }]);
      const dur = t.duration ?? 4000;
      if (dur > 0) setTimeout(() => remove(id), dur);
    },
    [remove],
  );

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-full max-w-[360px] flex-col gap-2"
      >
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto" style={{ animation: "toast-in .2s ease-out" }}>
            <Toast
              variant={t.variant}
              title={t.title}
              action={
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label="Dismiss"
                  className="rounded-md px-1.5 text-muted hover:text-ink"
                >
                  ✕
                </button>
              }
            >
              {t.description}
            </Toast>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
