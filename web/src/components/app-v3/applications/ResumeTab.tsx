"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, FileTextIcon, cn } from "@kiwiply/ui";
import ResumeFit from "@/components/board/ResumeFit";
import type { ApplicationDetailData } from "@/lib/applications";

/**
 * The resume used for this application, the job description captured when it was saved or filled (readable here
 * without opening the posting), and "which of my resumes fits best" (Pro, runs only when asked).
 */
export default function ResumeTab({
  app,
  isPro,
  onLink,
}: {
  app: Pick<ApplicationDetailData, "id" | "company" | "resume" | "jobDescription" | "jobUrl">;
  isPro: boolean;
  onLink(resumeId: number): void;
}) {
  const [jdOpen, setJdOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Resume used" className="flex items-center gap-3 rounded-2xl border border-v2-line/70 bg-paper p-3.5">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-v2-blue-soft text-v2-blue">
          <FileTextIcon aria-hidden className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-v2-muted">Resume used</p>
          <p className="truncate text-[14px] font-bold text-ink">{app.resume?.label || (app.resume ? "Your resume" : "None linked yet")}</p>
        </div>
        <Link href="/resume-builder" className="flex-none text-[13px] font-bold text-v2-blue-ink hover:underline">
          {app.resume ? "Open" : "Build one"}
        </Link>
      </section>

      <section aria-label="Job description">
        <button
          type="button"
          aria-expanded={jdOpen}
          onClick={() => setJdOpen((o) => !o)}
          className="flex min-h-10 w-full items-center gap-1.5 text-left text-ink hover:text-v2-blue-ink"
        >
          <ChevronDownIcon aria-hidden className={cn("h-4 w-4 text-v2-muted transition-transform", jdOpen && "rotate-180")} />
          <span className="font-display text-[15px] font-bold">Job description</span>
        </button>
        {jdOpen &&
          (app.jobDescription ? (
            <div className="mt-1 max-h-72 overflow-y-auto overflow-x-hidden rounded-xl border border-v2-line bg-paper-2/40 p-3">
              <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-soft">{app.jobDescription}</p>
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-v2-muted">No description was captured for this job.</p>
          ))}
      </section>

      <ResumeFit
        key={app.id}
        appId={app.id}
        jobDescription={app.jobDescription}
        company={app.company}
        isPro={isPro}
        linkedResumeId={app.resume?.id ?? null}
        onLink={onLink}
      />
    </div>
  );
}
