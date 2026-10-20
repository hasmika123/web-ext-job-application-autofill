"use client";

import { useEffect, useState } from "react";
import { SparklesIcon } from "@kiwiply/ui";
import { PRESET_FINAL_SCORE, demoEnabled, fetchTailoredResume, tailorPresetFor, type TailoredResume } from "@/lib/ent/demo/tailorPreset";
import TailorResumeSheet from "./TailorResumeSheet";

/**
 * Enterprise demo only (DEMO-PLAN section 16). On the consultant's Assigned Opportunities row of the preset job: "Resume tailored by Rahul · 58% → 87% ·
 * View changes". Shows only when the demo is on and the consultant's account holds the tailored resume.
 */

let cached: Promise<TailoredResume | null> | null = null;
/** The consultant's tailored resume, read once per page (null when the demo is off or there is none). */
export function tailoredResumeOnce(): Promise<TailoredResume | null> {
  if (!cached) cached = demoEnabled().then((on) => (on ? fetchTailoredResume() : null));
  return cached;
}

export default function TailoredRowNote({ title, company }: { title: string; company: string | null }) {
  const preset = tailorPresetFor(title, company);
  const [resume, setResume] = useState<TailoredResume | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!preset) return;
    let live = true;
    void tailoredResumeOnce().then((r) => live && setResume(r));
    return () => {
      live = false;
    };
  }, [preset]);
  if (!preset || !resume) return null;
  const marketer = preset.consultant.marketer.split(" ")[0];
  return (
    <>
      <button type="button" data-tailored-note onClick={() => setOpen(true)} className="mt-1 inline-flex items-center gap-1 rounded-md bg-v2-green-soft px-2 py-0.5 text-left text-[11.5px] font-semibold text-v2-green-ink hover:underline">
        <SparklesIcon size={12} /> Resume tailored by {marketer} · {preset.scoreBefore}% → {PRESET_FINAL_SCORE}% · View changes
      </button>
      {open ? <TailorResumeSheet preset={preset} mode="view" onClose={() => setOpen(false)} resumeHref={`/api/resumes/${resume.id}/file`} /> : null}
    </>
  );
}
