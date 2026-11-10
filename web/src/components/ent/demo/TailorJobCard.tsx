"use client";

import { useEffect, useState } from "react";
import { Button, MemberAvatar, SparklesIcon, cn } from "@kiwiply/ui";
import { assignJob, fetchCandidates } from "@/lib/ent/marketer-ws/jobs";
import { DUPLICATE_WARNING, plainRefusal } from "@/lib/ent/marketer-ws/duplicate";
import { demoEnabled, tailorPresetFor, type TailorPreset } from "@/lib/ent/demo/tailorPreset";
import TailorResumeSheet from "./TailorResumeSheet";

/**
 * Enterprise demo only (DEMO-PLAN section 16). On the marketer's job sheet, for the one preset job: "Anika Rao · 58% match · Tailor resume". The sheet shows
 * the (preset) AI suggestions; Save assigns the job to the consultant for real (the same call as Assign). The tailored resume itself already exists in the
 * consultant's account (web/scripts/demo-setup.mjs, archived until she approves it by preparing the application).
 */

/** The preset for this job when the demo is on, else null. */
export function useTailorPreset(title: string, company: string): TailorPreset | null {
  const match = tailorPresetFor(title, company);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!match) return;
    let live = true;
    void demoEnabled().then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, [match]);
  return on ? match : null;
}

/** The card inside the job sheet. */
export function TailorJobCard({ preset, onTailor }: { preset: TailorPreset; onTailor: () => void }) {
  const missing = preset.keywords.filter((k) => !k.before).slice(0, 4).map((k) => k.term);
  return (
    <section data-tailor-card aria-label="Tailor a resume for this job" className="rounded-lg border border-accent/40 bg-accent-soft/40 p-3">
      <div className="flex items-center gap-2.5">
        <MemberAvatar name={preset.consultant.name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink">{preset.consultant.name}</p>
          <p className="truncate text-[12px] text-muted">Her resume is missing: {missing.join(", ")}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-bold", "bg-v2-amber-soft text-v2-amber-ink")}>{preset.scoreBefore}%</span>
      </div>
      <Button variant="accent" size="sm" className="mt-2.5 w-full" data-tailor-open onClick={onTailor}>
        <SparklesIcon size={14} /> Tailor {preset.consultant.name.split(" ")[0]}&apos;s resume for this job
      </Button>
    </section>
  );
}

/** The tailor sheet with the real assignment behind Save. */
export function TailorAssignSheet({ orgId, jobId, preset, onClose, onDone }: { orgId: number; jobId: number; preset: TailorPreset; onClose: () => void; onDone: (message: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = preset.consultant.name.split(" ")[0];

  const save = async () => {
    setSaving(true);
    setError(null);
    const who = await fetchCandidates(orgId, jobId, preset.consultant.name);
    const c = who.ok ? who.value.find((x) => x.name === preset.consultant.name) : undefined;
    if (!c) {
      setSaving(false);
      setError(`${preset.consultant.name} isn't one of your consultants.`);
      return;
    }
    let r = await assignJob(orgId, jobId, c.consultantId);
    // the demo story assigns on purpose: a duplicate warning is answered with the reason the marketer would type
    if (!r.ok && r.status === 409 && r.code === DUPLICATE_WARNING) r = await assignJob(orgId, jobId, c.consultantId, { reason: `Tailored ${first}'s resume for this job` });
    setSaving(false);
    if (!r.ok) {
      setError(plainRefusal({ code: r.code ?? null, error: r.error }));
      return;
    }
    onDone(`Saved "${preset.resume.label}" and assigned ${preset.consultant.name} - ${preset.job.title}. ${first} approves the resume when she prepares the application, and submits it herself.`);
  };

  return <TailorResumeSheet preset={preset} mode="edit" onClose={onClose} onSave={() => void save()} saving={saving} error={error} />;
}
