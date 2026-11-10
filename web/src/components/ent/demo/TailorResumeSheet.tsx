"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button, CheckIcon, SideSheet, SparklesIcon, Spinner, cn } from "@kiwiply/ui";
import { defaultAccepted, keywordCovered, scoreAfter, type TailorPreset } from "@/lib/ent/demo/tailorPreset";

/**
 * Enterprise demo only (DEMO-PLAN section 16): "Tailor resume for this job". The marketer (`mode="edit"`) reviews the suggested changes to the consultant's
 * resume, before and after, with the match score moving as changes are kept, then saves the new resume and assigns the job. The consultant (`mode="view"`)
 * sees the same changes read-only. The suggestions are preset (tailor-preset.json); the job assignment and the resume file are real.
 */

const STEPS = ["Reading the job posting", "Comparing it with the resume", "Writing suggestions"];
const STEP_MS = 650;

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

export default function TailorResumeSheet({
  preset, mode, onClose, onSave, saving = false, error = null, resumeHref = null,
}: {
  preset: TailorPreset;
  mode: "edit" | "view";
  onClose: () => void;
  /** edit: save the new resume and assign the job (the accepted change ids). */
  onSave?: (accepted: ReadonlySet<string>) => void;
  saving?: boolean;
  error?: string | null;
  /** view: a link to the tailored resume's PDF. */
  resumeHref?: string | null;
}) {
  const id = useId();
  const first = preset.consultant.name.split(" ")[0];
  const [step, setStep] = useState(mode === "edit" ? 0 : STEPS.length);
  const [accepted, setAccepted] = useState<Set<string>>(() => defaultAccepted(preset));
  const thinking = step < STEPS.length;

  useEffect(() => {
    if (!thinking) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, thinking]);

  const after = useMemo(() => scoreAfter(preset, accepted), [preset, accepted]);
  const toggle = (cid: string) =>
    setAccepted((cur) => {
      const next = new Set(cur);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  const kept = preset.changes.filter((c) => accepted.has(c.id)).length + preset.additions.filter((a) => accepted.has(a.id)).length;

  return (
    <SideSheet
      id={`tailor-${id}`} side="right" mode="overlay" open width={640}
      title={mode === "edit" ? "Tailor resume for this job" : "Resume tailored for this job"}
      description={`${preset.consultant.name} · ${preset.job.title} at ${preset.job.company}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mode === "edit" ? (
            <>
              <span className="mr-auto text-[12.5px] text-muted">{thinking ? "" : `${kept} change${kept === 1 ? "" : "s"} kept`}</span>
              <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button variant="accent" data-tailor-save disabled={thinking || saving || kept === 0} onClick={() => onSave?.(accepted)}>
                {saving ? "Saving..." : `Save as new resume & assign to ${first}`}
              </Button>
            </>
          ) : (
            <>
              {resumeHref ? <a href={resumeHref} target="_blank" rel="noreferrer" className="mr-auto text-[13px] font-semibold text-accent-deep hover:underline">Open the tailored resume (PDF)</a> : null}
              <Button variant="accent" onClick={onClose}>Close</Button>
            </>
          )}
        </div>
      }
    >
      {thinking ? (
        <div data-tailor-thinking className="flex flex-col gap-3 p-2" aria-busy="true">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ink"><SparklesIcon size={16} className="text-accent-deep" /> AI is tailoring {first}&apos;s resume</p>
          <ul className="flex flex-col gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-2 text-[13.5px]", i <= step ? "text-ink" : "text-muted")}>
                {i < step ? <CheckIcon size={15} className="text-v2-green-ink" /> : i === step ? <Spinner /> : <span className="inline-block h-[15px] w-[15px]" />}
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div data-tailor-sheet className="flex flex-col gap-5 p-1">
          <section aria-label="Match score" className="rounded-lg border border-line bg-paper p-4">
            <div className="flex items-end gap-6">
              <Score label="Match before" value={preset.scoreBefore} tone="before" />
              <Score label={mode === "edit" ? "Match after" : "Match now"} value={after} tone="after" />
              <p data-tailor-delta className="pb-3 text-[15px] font-bold text-v2-green-ink">+{after - preset.scoreBefore}</p>
            </div>
            <ul aria-label="Job keywords" className="mt-4 flex flex-wrap gap-1.5">
              {preset.keywords.map((k) => {
                const on = keywordCovered(k, accepted);
                const fresh = on && !k.before;
                return (
                  <li key={k.term} data-keyword={k.term} data-covered={on ? "true" : "false"} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold", fresh ? "bg-v2-green-soft text-v2-green-ink ring-1 ring-v2-green-ink/30" : on ? "bg-accent-soft text-accent-deep" : "bg-paper-2 text-muted line-through decoration-1")}>
                    {on ? <CheckIcon size={12} /> : null}
                    {k.term}
                    {fresh ? <span className="text-[10.5px] font-bold uppercase">new</span> : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Suggested changes" className="flex flex-col gap-3">
            <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-ink"><SparklesIcon size={15} className="text-accent-deep" /> {mode === "edit" ? "AI suggestions" : `What ${preset.consultant.marketer.split(" ")[0]} changed`}</h3>
            {preset.changes.map((c) => {
              const on = accepted.has(c.id);
              return (
                <label key={c.id} data-tailor-change={c.id} className={cn("block rounded-lg border p-3", on ? "border-accent bg-paper" : "border-line bg-paper-2/40 opacity-75", mode === "edit" && "cursor-pointer")}>
                  <span className="flex items-start gap-2.5">
                    {mode === "edit" ? <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="mt-0.5 h-4 w-4 flex-none accent-[var(--brand-primary,var(--color-accent))]" /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[12.5px] font-bold uppercase tracking-wide text-accent-deep">{c.section}</span>
                        <span className="text-[12px] font-semibold text-v2-green-ink">+{c.points}</span>
                      </span>
                      <span className="mt-1.5 block rounded-md bg-v2-pink-soft/50 px-2.5 py-1.5 text-[13px] leading-relaxed text-ink-soft line-through decoration-v2-pink-ink/50">{c.before}</span>
                      <span className="mt-1 block rounded-md bg-v2-green-soft/60 px-2.5 py-1.5 text-[13px] leading-relaxed text-ink">{c.after}</span>
                      <span className="mt-1.5 block text-[12px] text-muted">{c.why}</span>
                    </span>
                  </span>
                </label>
              );
            })}
          </section>

          <section aria-label="Skills to add only if true" className="flex flex-col gap-2">
            <h3 className="text-[14px] font-bold text-ink">Add only if true</h3>
            <p className="text-[12.5px] text-muted">The posting asks for these and the resume doesn&apos;t list them. Add one only when {first} has really used it.</p>
            {preset.additions.map((a) => {
              const on = accepted.has(a.id);
              return (
                <label key={a.id} data-tailor-addition={a.id} className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2", on ? "border-accent" : "border-line", mode === "edit" && "cursor-pointer")}>
                  {mode === "edit" ? <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="mt-0.5 h-4 w-4 flex-none accent-[var(--brand-primary,var(--color-accent))]" /> : on ? <CheckIcon size={15} className="mt-0.5 flex-none text-v2-green-ink" /> : <span className="inline-block h-[15px] w-[15px] flex-none" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{a.skill}</span>
                      <span className="text-[12px] font-semibold text-v2-green-ink">+{a.points}</span>
                    </span>
                    <span className="block text-[12px] text-muted">{a.note}</span>
                  </span>
                </label>
              );
            })}
          </section>

          <p className="rounded-lg bg-accent-soft px-3 py-2 text-[12.5px] text-accent-deep">
            {mode === "edit"
              ? `Saving makes a new resume for ${first} ("${preset.resume.label}") and assigns her the job with it. Her current resume is not changed. ${first} approves it when she prepares the application, and she submits it herself.`
              : `This resume is used for this job only. Preparing the application approves it; you still review the form and press Submit yourself.`}
          </p>
          {error ? <p role="alert" className="text-[13px] text-v2-pink-ink">{error}</p> : null}
        </div>
      )}
    </SideSheet>
  );
}
