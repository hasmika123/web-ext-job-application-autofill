"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui";
import { AtsReport, Spinner, type AtsReportData } from "@kiwiply/ui";

/**
 * A resume's ATS score on the Resumes page (Phase 13.5, Pro): fifteen structure checks, what to fix
 * first. No AI and nothing leaves Kiwiply, so it runs as soon as the dialog opens. Free users see
 * what it does and where it lives instead.
 *
 * Mounted fresh each time it opens (the list renders it only while a resume is picked), so the
 * initial state is already "loading".
 */
type Load = { state: "loading" } | { state: "ready"; report: AtsReportData } | { state: "message"; text: string };

export default function AtsScoreDialog({
  resumeId,
  resumeLabel,
  isPro,
  onClose,
}: {
  resumeId: number;
  resumeLabel: string;
  isPro: boolean;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [upsell, setUpsell] = useState(!isPro);

  useEffect(() => {
    if (!isPro) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/resumes/${resumeId}/ats-score`);
        const data = (await res.json().catch(() => ({}))) as AtsReportData & { error?: string; proRequired?: boolean };
        if (!live) return;
        if (res.status === 402 || data.proRequired) setUpsell(true);
        else if (res.ok && Array.isArray(data.checks)) setLoad({ state: "ready", report: data });
        else setLoad({ state: "message", text: data.error ?? "Couldn't score this resume right now. Please try again." });
      } catch {
        if (live) setLoad({ state: "message", text: "Something went wrong. Please try again." });
      }
    })();
    return () => {
      live = false;
    };
  }, [resumeId, isPro]);

  return (
    <Dialog open onClose={onClose} title="ATS score" description={resumeLabel} className="max-w-lg">
      {upsell ? (
        <p className="text-[13.5px] text-ink-soft">
          See how applicant-tracking systems will read this resume — a score out of 100, and what to fix
          first. Against a saved job it also checks the job&rsquo;s key terms.{" "}
          <Link href="/pricing" className="font-semibold text-accent-deep hover:underline">
            Part of Pro →
          </Link>
        </p>
      ) : load.state === "loading" ? (
        <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
          <Spinner className="h-4 w-4" /> Checking…
        </div>
      ) : load.state === "message" ? (
        <p role="status" className="text-[13px] font-medium text-ink-soft">
          {load.text}
        </p>
      ) : (
        <>
          <AtsReport report={load.report} heading="Score" />
          <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">
            To score it against a job&rsquo;s keywords, open that job on the Board and choose &ldquo;See gaps &amp;
            red flags&rdquo;.
          </p>
        </>
      )}
    </Dialog>
  );
}
