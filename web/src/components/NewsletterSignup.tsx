"use client";

import { useState, type FormEvent } from "react";
import { isEmail } from "@/lib/validate";

/**
 * Footer newsletter opt-in (Phase 9.A4.2). Double opt-in: this just records intent and triggers
 * a confirmation email — we always show the same "check your email" message (no enumeration).
 */
export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source: "footer" }),
      });
      if (res.status === 429) {
        setError("Too many requests — please try again later.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't subscribe. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-[12.5px] leading-relaxed text-ink-soft">
        Thanks! Check your inbox for a confirmation link to finish subscribing.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="nl-email" className="text-[12.5px] font-medium text-ink-soft">
        Product updates &amp; tips
      </label>
      <div className="flex gap-2">
        <input
          id="nl-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email for newsletter"
          className="min-w-0 flex-1 rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-[var(--radius)] bg-ink px-3.5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : "Subscribe"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : (
        <p className="text-[12px] text-muted">Double opt-in. Unsubscribe anytime. No spam.</p>
      )}
    </form>
  );
}
