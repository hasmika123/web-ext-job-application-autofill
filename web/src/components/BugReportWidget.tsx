"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import Select from "@/components/ui/Select";
import { BugIcon } from "@kiwiply/ui";

const NUDGE_SEEN_KEY = "kiwiply_bugnudge_seen";
const NUDGE_LABEL = "Found a bug? Let us know 🐛";

// Draggable position — the button snaps to one of four corners; the choice persists.
const POS_KEY = "kiwiply_bugpos";
type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
const CORNERS: Corner[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
const OFFSET = 20; // matches the old bottom-5/right-5 (5 * 4px)

function cornerStyle(c: Corner): CSSProperties {
  return {
    top: c.startsWith("top") ? OFFSET : undefined,
    bottom: c.startsWith("bottom") ? OFFSET : undefined,
    left: c.endsWith("left") ? OFFSET : undefined,
    right: c.endsWith("right") ? OFFSET : undefined,
  };
}

// Persisted corner via an external store (server snapshot = default) — hydrates cleanly without a
// setState-in-effect, matching the sidebar-collapse pattern in AppShell.
function subscribePos(cb: () => void) {
  window.addEventListener("kiwiply:bugpos", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("kiwiply:bugpos", cb);
    window.removeEventListener("storage", cb);
  };
}
function readPos(): Corner {
  try {
    const v = localStorage.getItem(POS_KEY);
    if (v && (CORNERS as string[]).includes(v)) return v as Corner;
  } catch {
    /* private mode */
  }
  return "bottom-right";
}
function writePos(c: Corner) {
  try {
    localStorage.setItem(POS_KEY, c);
  } catch {
    /* private mode — position just won't persist */
  }
  window.dispatchEvent(new Event("kiwiply:bugpos"));
}

/**
 * Floating "report a bug" button (Phase 9.A5.2) — a persistent circle at the bottom-right that
 * opens a small dialog. Diagnostic context (this page's URL + browser) is attached only if the
 * reporter leaves the consent box ticked. Submits to the rate-limiting BFF; the user's login is
 * attached server-side when they're signed in (anonymous is fine too).
 */
export default function BugReportWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("BUG");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false); // one-time "Found a bug?" bubble on first visit
  const corner = useSyncExternalStore(subscribePos, readPos, () => "bottom-right" as Corner);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null); // live pointer pos while dragging
  const draggedRef = useRef(false); // set once a pointerdown turns into a real drag
  const downRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Show the nudge once, a moment after first load; never again once seen/opened/dismissed.
  useEffect(() => {
    try {
      if (localStorage.getItem(NUDGE_SEEN_KEY)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setNudge(true), 1500);
    return () => clearTimeout(t);
  }, []);

  function dismissNudge() {
    setNudge(false);
    try {
      localStorage.setItem(NUDGE_SEEN_KEY, "1");
    } catch {
      /* private mode — just don't persist */
    }
  }

  function reset() {
    setMessage("");
    setCategory("BUG");
    setEmail("");
    setConsent(true);
    setSent(false);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please describe the issue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { message, category, email: email || undefined };
      if (consent) {
        payload.url = window.location.href;
        payload.userAgent = navigator.userAgent;
      }
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        setError("Too many reports — please try again later.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't send your report.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={`group fixed z-[200] flex items-center gap-2 ${corner.endsWith("left") ? "flex-row-reverse" : ""}`}
        style={drag ? { left: drag.x, top: drag.y, transform: "translate(-50%, -50%)" } : cornerStyle(corner)}
      >
        {!open &&
          (nudge ? (
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper py-2 pl-3.5 pr-2 text-[13px] font-medium text-ink shadow-[0_6px_20px_rgba(0,0,0,.18)]">
              <span>{NUDGE_LABEL}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={dismissNudge}
                className="grid h-5 w-5 flex-none place-items-center rounded-full text-muted hover:bg-paper-2 hover:text-ink"
              >
                ✕
              </button>
            </div>
          ) : (
            <span className="pointer-events-none whitespace-nowrap rounded-full border border-line bg-paper px-3.5 py-2 text-[13px] font-medium text-ink opacity-0 shadow-[0_6px_20px_rgba(0,0,0,.18)] transition-opacity group-hover:opacity-100">
              {NUDGE_LABEL}
            </span>
          ))}
        <button
          type="button"
          aria-label="Report a bug (drag to move)"
          title="Report a bug — drag to move"
          onPointerDown={(e) => {
            downRef.current = { x: e.clientX, y: e.clientY };
            draggedRef.current = false;
            try {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
              /* capture is best-effort */
            }
          }}
          onPointerMove={(e) => {
            if (!downRef.current) return;
            const dx = e.clientX - downRef.current.x;
            const dy = e.clientY - downRef.current.y;
            if (!draggedRef.current && Math.hypot(dx, dy) < 6) return; // ignore tiny jitters (still a click)
            draggedRef.current = true;
            setDrag({ x: e.clientX, y: e.clientY });
          }}
          onPointerUp={(e) => {
            if (draggedRef.current) {
              const c = `${e.clientY < window.innerHeight / 2 ? "top" : "bottom"}-${
                e.clientX < window.innerWidth / 2 ? "left" : "right"
              }` as Corner;
              writePos(c);
            }
            setDrag(null);
            downRef.current = null;
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
              /* best-effort */
            }
          }}
          onClick={() => {
            if (draggedRef.current) {
              draggedRef.current = false; // a drag just ended — swallow the click
              return;
            }
            dismissNudge();
            reset();
            setOpen(true);
          }}
          className="grid h-13 w-13 flex-none touch-none cursor-grab place-items-center rounded-full bg-ink text-paper shadow-[0_6px_20px_rgba(0,0,0,.25)] transition-transform hover:scale-105 active:cursor-grabbing"
          style={{ height: 52, width: 52 }}
        >
          <BugIcon className="h-6 w-6" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[210] grid place-items-end justify-end p-5 sm:place-items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Report a bug">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-[rgba(35,40,38,.45)]" />
          <div className="relative z-10 w-full max-w-md rounded-[var(--radius-lg)] border border-line bg-paper p-6 shadow-[var(--shadow)]">
            {sent ? (
              <div className="text-center">
                <h2 className="text-lg font-bold text-ink">Thanks for the report 🙏</h2>
                <p className="mt-2 text-sm text-ink-soft">We&apos;ve logged it and will take a look.</p>
                <button type="button" onClick={() => setOpen(false)} className="mt-5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90">
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-ink">Report a bug</h2>
                  <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-ink-soft hover:text-ink">✕</button>
                </div>

                <label className="mb-1 block text-[13px] font-medium text-ink-soft" htmlFor="br-category">Type</label>
                <Select
                  id="br-category"
                  aria-label="Type"
                  className="mb-3"
                  value={category}
                  onChange={setCategory}
                  options={[
                    { value: "BUG", label: "Bug" },
                    { value: "IDEA", label: "Idea / feedback" },
                    { value: "OTHER", label: "Other" },
                  ]}
                />

                <label className="mb-1 block text-[13px] font-medium text-ink-soft" htmlFor="br-message">What happened?</label>
                <textarea
                  id="br-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  autoFocus
                  className="mb-3 w-full resize-y rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  placeholder="Describe the issue or idea…"
                />

                <label className="mb-1 block text-[13px] font-medium text-ink-soft" htmlFor="br-email">Email (optional, for a reply)</label>
                <input
                  id="br-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  className="mb-3 w-full rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                  placeholder="you@example.com"
                />

                <label className="mb-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-soft">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-[var(--color-accent)]" />
                  <span>Include this page&apos;s address and my browser info to help us debug.</span>
                </label>

                {error && <p role="alert" className="mb-3 text-sm font-medium text-danger">{error}</p>}

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2">
                    Cancel
                  </button>
                  <button type="submit" disabled={busy} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-50">
                    {busy ? "Sending…" : "Send report"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
