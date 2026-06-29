"use client";

import { useEffect, useState, type FormEvent } from "react";

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
      <button
        type="button"
        aria-label="Report a bug"
        title="Report a bug"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="fixed bottom-5 right-5 z-[200] grid h-13 w-13 place-items-center rounded-full bg-ink text-paper shadow-[0_6px_20px_rgba(0,0,0,.25)] transition-transform hover:scale-105"
        style={{ height: 52, width: 52 }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <rect x="8" y="6" width="8" height="13" rx="4" />
          <path d="M12 6V4M5 9h3M16 9h3M4 13h4M16 13h4M5 17h3M16 17h3" />
        </svg>
      </button>

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
                <select
                  id="br-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mb-3 w-full rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                >
                  <option value="BUG">Bug</option>
                  <option value="IDEA">Idea / feedback</option>
                  <option value="OTHER">Other</option>
                </select>

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
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]" />
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
