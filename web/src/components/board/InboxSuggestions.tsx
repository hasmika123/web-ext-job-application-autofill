"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, useToast } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import LocalDate from "@/components/LocalDate";
import { cn } from "@/lib/cn";

/**
 * "From your inbox" (Phase 14.4b): jobs the connected inbox shows that the board doesn't track —
 * a confirmation, an interview invite, a test or an offer from a company with no application here.
 * Add one and it lands at the stage the mail showed, dated by it; dismiss and that company's
 * suggestions go away. When the mail didn't name the role, the role is asked for first.
 */

export interface InboxSuggestion {
  id: number;
  company: string | null;
  role: string | null;
  category: string | null;
  subject: string | null;
  fromName: string | null;
  fromAddress: string | null;
  sentAt: string | null;
}

const WHAT: Record<string, string> = {
  APPLIED: "Application confirmed",
  INTERVIEW: "Interview invite",
  ASSESSMENT: "Assessment",
  OFFER: "Offer",
};
const WHEN = { month: "short", day: "numeric" } as const;

export default function InboxSuggestions({ items }: { items: InboxSuggestion[] }) {
  const router = useRouter();
  const toast = useToast();
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const [role, setRole] = useState("");

  const shown = items.filter((s) => !gone.has(s.id));
  if (shown.length === 0) return null;

  async function act(s: InboxSuggestion, action: "accept" | "dismiss", roleTitle?: string) {
    setBusy(s.id);
    const res = await fetch(`/api/inbox/suggestions/${s.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(roleTitle ? { roleTitle } : {}),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "error", title: body.error ?? "That didn't work." });
      return;
    }
    setAsking(null);
    setRole("");
    // Dismissing or adding clears every suggestion from that company.
    setGone((g) => {
      const next = new Set(g);
      for (const x of items) if ((x.company ?? "").toLowerCase() === (s.company ?? "").toLowerCase()) next.add(x.id);
      return next;
    });
    if (action === "accept") {
      toast({ variant: "success", title: `Added ${s.company} to your board.` });
      router.refresh();
    }
  }

  return (
    <section aria-label="From your inbox" className="mb-4 rounded-[var(--radius-lg)] border border-accent/40 bg-accent-soft/30 p-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[.08em] text-accent-deep">From your inbox</h2>
      <p className="mt-0.5 text-[12.5px] text-ink-soft">Jobs your email shows that aren&apos;t on the board yet.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.id} className="rounded-[var(--radius)] border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">
                  {s.company}
                  {s.role ? <span className="font-normal text-ink-soft"> · {s.role}</span> : null}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-muted">
                  {WHAT[s.category ?? ""] ?? "From your email"}
                  {s.sentAt && (
                    <>
                      {" · "}
                      <LocalDate iso={s.sentAt} options={WHEN} />
                    </>
                  )}
                  {s.subject && <> · &ldquo;{s.subject}&rdquo;</>}
                </div>
              </div>
              {asking !== s.id && (
                <div className="flex flex-none items-center gap-2">
                  <button
                    type="button"
                    onClick={() => (s.role ? void act(s, "accept") : (setAsking(s.id), setRole("")))}
                    disabled={busy === s.id}
                    className={cn(buttonVariants("primary", "sm"), "disabled:opacity-60")}
                  >
                    Add to board
                  </button>
                  <button
                    type="button"
                    onClick={() => void act(s, "dismiss")}
                    disabled={busy === s.id}
                    className="text-[13px] font-semibold text-ink-soft hover:text-ink hover:underline disabled:opacity-60"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
            {asking === s.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (role.trim()) void act(s, "accept", role.trim());
                }}
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <Input
                  autoFocus
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Which role? e.g. Backend Engineer"
                  aria-label="Role"
                  className="min-w-[12rem] flex-1"
                />
                <button type="submit" disabled={!role.trim() || busy === s.id} className={cn(buttonVariants("primary", "sm"), "disabled:opacity-60")}>
                  Add
                </button>
                <button type="button" onClick={() => setAsking(null)} className={buttonVariants("ghost", "sm")}>
                  Cancel
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
