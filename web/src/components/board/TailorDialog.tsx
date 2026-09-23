"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, Input, Field } from "@/components/ui";
import { Spinner } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";

/**
 * Tailor a resume for this job (Phase 13.4, Pro). Opens on a checked proposal from the server —
 * rewrites of the resume's own bullets and summary, and a reordering of its skills — shown as
 * before/after. The user unticks what they don't want and saves the rest as a NEW resume, linked to
 * this application. The original is never changed.
 *
 * The browser only ever sends which changes to keep, never text: the server rebuilds the new resume
 * from the proposal it checked (no invented numbers, employers or skills), and refuses if the
 * resume changed in the meantime.
 */

type Change = { ref: string; section: string; before: string; after: string };
type Proposal = { proposalId: number; resumeId: number; label: string; changes: Change[]; suggestions: string[] };
type Load =
  | { state: "loading" }
  | { state: "ready"; proposal: Proposal }
  | { state: "message"; text: string; upsell?: boolean };

export default function TailorDialog({
  open,
  onClose,
  appId,
  resumeId,
  resumeLabel,
  company,
}: {
  open: boolean;
  onClose: () => void;
  appId: number;
  resumeId: number;
  resumeLabel: string;
  company: string;
}) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState(`${resumeLabel} — ${company || "tailored"}`);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Mounted fresh each time it opens (ResumeFit renders it only while tailoring), so the initial
    // state is already "loading" — nothing to reset here.
    if (!open) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/applications/${appId}/tailor`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resumeId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.status === 402) return setLoad({ state: "message", text: "Tailoring a resume is part of Pro.", upsell: true });
        if (!res.ok) return setLoad({ state: "message", text: data.error ?? "Couldn't tailor the resume right now. Please try again." });
        if (data.proposal && data.proposal.changes?.length) {
          setLoad({ state: "ready", proposal: data.proposal });
          setKeep(new Set((data.proposal as Proposal).changes.map((c) => c.ref)));
        } else if (data.nothingToChange) {
          setLoad({ state: "message", text: "This resume already reads well for this job — nothing worth rewording." });
        } else if (data.quotaExceeded) {
          const when = formatDate(data.resetsAt, { month: "long", day: "numeric" });
          setLoad({ state: "message", text: `You've used this month's Kiwiply AI — it resets${when ? ` on ${when}` : " next month"}.` });
        } else if (data.noJobDescription) {
          setLoad({ state: "message", text: "This job's description is too short to tailor to. Paste the full description via Edit." });
        } else {
          setLoad({ state: "message", text: "Couldn't tailor the resume right now. Please try again." });
        }
      } catch {
        if (live) setLoad({ state: "message", text: "Something went wrong. Please try again." });
      }
    })();
    return () => {
      live = false;
    };
  }, [open, appId, resumeId]);

  function toggle(ref: string) {
    setKeep((k) => {
      const next = new Set(k);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  async function save() {
    if (load.state !== "ready" || !keep.size) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tailor/${load.proposal.proposalId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keep: [...keep], label, applicationId: appId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save the new resume.");
        return;
      }
      setSaved(data.label ?? label);
      router.refresh(); // the board picks up the new resume and the new link
    } catch {
      setError("Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  async function copyKept() {
    if (load.state !== "ready") return;
    const text = load.proposal.changes
      .filter((c) => keep.has(c.ref))
      .map((c) => `${c.section}\n${c.after}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy — your browser blocked the clipboard.");
    }
  }

  const footer =
    load.state === "ready" && !saved ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {error && (
          <span role="alert" className="mr-auto text-[12.5px] font-medium text-danger">
            {error}
          </span>
        )}
        <button type="button" onClick={() => void copyKept()} disabled={!keep.size} className={buttonVariants("ghost", "sm")}>
          {copied ? "Copied" : "Copy kept changes"}
        </button>
        <button type="button" onClick={() => void save()} disabled={saving || !keep.size} className={cn(buttonVariants("accent", "sm"), "disabled:opacity-50")}>
          {saving ? "Saving…" : `Save as new resume (${keep.size})`}
        </button>
      </div>
    ) : (
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={buttonVariants("ghost", "sm")}>
          Close
        </button>
      </div>
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Tailor “${resumeLabel}” for this job`}
      description="Rewordings of what your resume already says — nothing new is added. Untick anything you don't want."
      footer={footer}
      className="max-w-2xl"
    >
      {load.state === "loading" && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted">
          <Spinner className="h-4 w-4" /> Reading the job and your resume…
        </div>
      )}

      {load.state === "message" && (
        <p className="py-6 text-sm text-ink-soft">
          {load.text}{" "}
          {load.upsell && (
            <Link href="/pricing" className="font-semibold text-accent-deep hover:underline">
              See Pro →
            </Link>
          )}
        </p>
      )}

      {load.state === "ready" && saved && (
        <div className="py-6">
          <p className="text-sm font-semibold text-ink">Saved “{saved}” as a new resume.</p>
          <p className="mt-1 text-[13px] text-muted">
            It&apos;s linked to this application and ready in the extension. Your original resume is unchanged.
          </p>
        </div>
      )}

      {load.state === "ready" && !saved && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2.5">
            {load.proposal.changes.map((c) => {
              const on = keep.has(c.ref);
              return (
                <li key={c.ref} className={cn("rounded-[var(--radius)] border p-3", on ? "border-accent bg-accent-soft/30" : "border-line")}>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" checked={on} onChange={() => toggle(c.ref)} className="mt-1 h-4 w-4 flex-none accent-[var(--color-accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold uppercase tracking-[.08em] text-muted">{c.section}</span>
                      <span className="mt-1 block text-[12.5px] text-muted line-through">{c.before}</span>
                      <span className="mt-0.5 block text-[13.5px] text-ink">{c.after}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {load.proposal.suggestions.length > 0 && (
            <p className="rounded-[var(--radius)] bg-paper-2/60 p-3 text-[12.5px] text-ink-soft">
              <span className="font-semibold text-ink">Only if true, consider adding:</span> {load.proposal.suggestions.join(", ")}.
              Kiwiply never adds these for you.
            </p>
          )}
          <Field label="Name for the new resume" htmlFor="tailor-label" className="mb-0">
            <Input id="tailor-label" value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <p className="text-[12px] text-muted">
            Saved as structured text for autofill and AI; it has no PDF of its own yet, so copy the changes into your
            document if you&apos;re sending a file.
          </p>
        </div>
      )}
    </Dialog>
  );
}
