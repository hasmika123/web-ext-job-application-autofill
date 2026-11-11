"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button, CheckIcon, Input, SideSheet, SparklesIcon, Spinner, cn } from "@kiwiply/ui";
import { applyTailoring, coveredWith, proposeTailoring, scoreWith, statusText, type TailorApplied, type TailorProposal } from "@/lib/ent/marketer-ws/tailor";

/**
 * Marketer tailoring (docs/enterprise-v2/MKT-TAILOR-BUILD.md, gap D2). On an assigned job, AI tailors one of the consultant's resumes; the marketer keeps
 * or skips each change, ticks only the missing keywords that are true, and saves a NEW resume that waits for the consultant's approval and is chosen for
 * the job. The score is keyword coverage, worked out without AI, and moves as changes are kept. Nothing is submitted for anyone (E1).
 */

function Score({ label, value, tone }: { label: string; value: number; tone: "before" | "after" }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p data-tailor-score={tone} className={cn("text-[30px] font-extrabold leading-tight", tone === "after" ? "text-v2-green-ink" : "text-ink")}>{value}%</p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper-2">
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone === "after" ? "bg-v2-green-ink" : "bg-v2-amber-ink")} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function TailorSheet({
  orgId, id, consultant, jobTitle, orgResumeId, onClose, onSaved,
}: {
  orgId: number;
  /** The opportunity (match) id. */
  id: number;
  consultant: string;
  jobTitle: string;
  /** The resume to tailor; null = the job's chosen resume, else the consultant's primary. */
  orgResumeId: number | null;
  onClose: () => void;
  onSaved: (applied: TailorApplied) => void;
}) {
  const sheetId = useId();
  const first = consultant.split(" ")[0] || consultant;
  const [proposal, setProposal] = useState<TailorProposal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void proposeTailoring(orgId, id, orgResumeId).then((r) => {
      if (!live) return;
      if (!r.ok) {
        setFailure(r.message);
        return;
      }
      setProposal(r.value);
      setKept(new Set(r.value.changes.map((c) => c.ref))); // every checked rewrite starts kept; the marketer skips what doesn't read right
      setLabel(`${r.value.source.name} - ${r.value.jobTitle || jobTitle}`.slice(0, 200));
    });
    return () => {
      live = false;
    };
  }, [orgId, id, orgResumeId, jobTitle]);

  const after = useMemo(() => (proposal ? scoreWith(proposal, kept, ticked) : null), [proposal, kept, ticked]);
  const covered = useMemo(() => (proposal ? coveredWith(proposal, kept, ticked) : new Set<string>()), [proposal, kept, ticked]);
  const flip = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };
  const usable = proposal && proposal.proposalId != null && (proposal.status === "OK" || proposal.status === "NOTHING_TO_CHANGE") && (proposal.changes.length > 0 || proposal.additions.length > 0);
  const count = kept.size + ticked.size;

  const save = async () => {
    if (!proposal || proposal.proposalId == null || count === 0) return;
    setSaving(true);
    setError(null);
    const r = await applyTailoring(orgId, id, proposal.proposalId, [...kept], [...ticked], label);
    setSaving(false);
    if (r.ok) onSaved(r.value);
    else setError(r.message);
  };

  return (
    <SideSheet
      id={`tailor-${sheetId}`} side="right" mode="overlay" open width={640}
      title="Tailor resume for this job"
      description={`${consultant} · ${jobTitle}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[12.5px] text-muted">{usable ? `${count} change${count === 1 ? "" : "s"} kept` : ""}</span>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          {usable ? (
            <Button variant="accent" data-tailor-save disabled={saving || count === 0 || !label.trim()} onClick={() => void save()}>
              {saving ? "Saving..." : "Save as new resume for this job"}
            </Button>
          ) : null}
        </div>
      }
    >
      {failure ? (
        <p role="alert" data-tailor-failed className="p-2 text-[13.5px] text-v2-pink-ink">{failure}</p>
      ) : !proposal ? (
        <div data-tailor-thinking className="flex flex-col gap-3 p-2" aria-busy="true">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Spinner /> AI is tailoring {first}&apos;s resume for this job…</p>
          <p className="text-[12.5px] text-muted">It reads the posting, compares it with the resume and rewrites what it can without adding anything that isn&apos;t there. This uses {first}&apos;s AI budget.</p>
        </div>
      ) : !usable ? (
        <p data-tailor-status={proposal.status} className="p-2 text-[13.5px] text-ink-soft">{statusText(proposal.status, first) || "There is nothing to keep."}</p>
      ) : (
        <div data-tailor-sheet className="flex flex-col gap-5 p-1">
          <p className="text-[12.5px] text-muted">Tailoring <b className="text-ink">{proposal.source.name}</b>.</p>
          {proposal.scoreBefore != null && after != null ? (
            <section aria-label="Match score" className="rounded-lg border border-line bg-paper p-4">
              <div className="flex items-end gap-6">
                <Score label="Match before" value={proposal.scoreBefore} tone="before" />
                <Score label="Match after" value={after} tone="after" />
                <p data-tailor-delta className="pb-3 text-[15px] font-bold text-v2-green-ink">{after - proposal.scoreBefore >= 0 ? "+" : ""}{after - proposal.scoreBefore}</p>
              </div>
              <ul aria-label="Job keywords" className="mt-4 flex flex-wrap gap-1.5">
                {proposal.keywords.map((k) => {
                  const on = covered.has(k.term);
                  const fresh = on && !k.coveredBefore;
                  return (
                    <li key={k.term} data-keyword={k.term} data-covered={on ? "true" : "false"} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold", fresh ? "bg-v2-green-soft text-v2-green-ink" : on ? "bg-paper-2 text-ink" : "bg-paper-2 text-muted line-through")}>
                      {on ? <CheckIcon size={12} /> : null}
                      {k.term}
                      {fresh ? <span className="text-[10.5px] font-bold uppercase">new</span> : null}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[11.5px] text-muted">The score is how many of the job&apos;s key terms the resume covers. It is worked out without AI.</p>
            </section>
          ) : null}

          {proposal.changes.length > 0 ? (
            <section aria-label="Suggested changes" className="flex flex-col gap-3">
              <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-ink"><SparklesIcon size={15} className="text-accent-deep" /> AI suggestions</h3>
              {proposal.changes.map((c) => {
                const on = kept.has(c.ref);
                return (
                  <label key={c.ref} data-tailor-change={c.ref} className={cn("block cursor-pointer rounded-lg border p-3", on ? "border-accent bg-paper" : "border-line bg-paper-2/40 opacity-75")}>
                    <span className="flex items-start gap-2.5">
                      <input type="checkbox" checked={on} onChange={() => flip(kept, setKept, c.ref)} aria-label={`Keep the change to ${c.section}`} className="mt-0.5 h-4 w-4 flex-none accent-[var(--brand-primary,var(--color-accent))]" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[12.5px] font-bold uppercase tracking-wide text-accent-deep">{c.section}</span>
                          {c.adds.length ? <span className="text-[12px] font-semibold text-v2-green-ink">+ {c.adds.join(", ")}</span> : null}
                        </span>
                        <span className="mt-1.5 block rounded-md bg-v2-pink-soft/50 px-2.5 py-1.5 text-[13px] leading-relaxed text-ink-soft line-through decoration-v2-pink-ink/50">{c.before}</span>
                        <span className="mt-1 block rounded-md bg-v2-green-soft/60 px-2.5 py-1.5 text-[13px] leading-relaxed text-ink">{c.after}</span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </section>
          ) : null}

          {proposal.additions.length > 0 ? (
            <section aria-label="Skills to add only if true" className="flex flex-col gap-2">
              <h3 className="text-[14px] font-bold text-ink">Add only if true</h3>
              <p className="text-[12.5px] text-muted">The posting asks for these and the resume doesn&apos;t mention them. Tick one only when {first} has really used it.</p>
              {proposal.additions.map((a) => {
                const on = ticked.has(a);
                return (
                  <label key={a} data-tailor-addition={a} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2", on ? "border-accent" : "border-line")}>
                    <input type="checkbox" checked={on} onChange={() => flip(ticked, setTicked, a)} aria-label={`${first} has used ${a}`} className="h-4 w-4 flex-none accent-[var(--brand-primary,var(--color-accent))]" />
                    <span className="text-[13.5px] font-semibold text-ink">{a}</span>
                  </label>
                );
              })}
            </section>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-ink">Name of the new resume</span>
            <Input aria-label="Name of the new resume" value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} />
          </label>

          <p className="rounded-lg bg-accent-soft px-3 py-2 text-[12.5px] text-accent-deep">
            Saving makes a new resume for {first} and chooses it for this job. {first}&apos;s other resumes are not changed. {first} approves it before it is used, and submits the application themself.
          </p>
          {error ? <p role="alert" className="text-[13px] text-v2-pink-ink">{error}</p> : null}
        </div>
      )}
    </SideSheet>
  );
}
