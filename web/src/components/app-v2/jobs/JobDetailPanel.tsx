"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  LightbulbIcon,
  UserIcon,
  XIcon,
  ZapIcon,
  ArrowRightIcon,
  cn,
} from "@kiwiply/ui";
import { CompanyTile, ProgressRing, UnderlineTabs } from "@/components/app-v2/common";
import type { SampleJob } from "@/components/app-v2/sample-data";
import { JobTag, SaveButton } from "./JobBits";
import { detailFor, metaLine, scoreTone } from "./job-utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "requirements", label: "Requirements" },
  { id: "about", label: "About Company" },
  { id: "reviews", label: "Reviews" },
];

/**
 * The right-hand detail panel of the split view (board `app-job-search-split.webp`): header with
 * the match ring, chips, meta, tabs, description, responsibilities, skills and the two actions.
 */
export default function JobDetailPanel({ job, onClose }: { job: SampleJob; onClose: () => void }) {
  const d = detailFor(job);
  const [tab, setTab] = useState("overview");
  const have = d.skillsHave;
  const improve = d.skillsImprove;

  return (
    <aside
      aria-label={`${job.title} at ${job.company}`}
      className="flex min-w-0 flex-col rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft xl:sticky xl:top-[84px] xl:max-h-[calc(100dvh-100px)] xl:overflow-y-auto"
    >
      <div className="p-5">
        <div className="flex items-start gap-3.5">
          <CompanyTile name={job.company} size={60} className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[20px] font-extrabold! leading-tight! tracking-tight! text-ink">
              <Link href={`/jobs/${job.id}`} className="hover:underline">
                {job.title}
              </Link>
            </h2>
            <div className="mt-1 text-[14px] text-ink-soft">{job.company}</div>
            <div className="text-[13px] text-v2-muted">
              {[metaLine(job, false), job.tags[0]].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="flex flex-none items-start gap-1.5">
            <SaveButton job={job} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-paper-2 hover:text-ink"
            >
              <XIcon size={16} />
            </button>
            <ProgressRing value={job.score} tone={scoreTone(job.score)} size={64} thickness={6} label={`${job.score} percent match`}>
              <span className="leading-none">
                <span className="block font-display text-[16px] font-extrabold text-ink">{job.score}%</span>
                <span className="block text-[10px] text-v2-muted">Match</span>
              </span>
            </ProgressRing>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {d.salary !== "Not listed" && (
            <span className="rounded-lg bg-paper-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft">{d.salary}</span>
          )}
          <span className="rounded-lg bg-v2-violet-soft px-3 py-1.5 text-[12.5px] font-semibold text-v2-violet-ink">{job.tags[0] ?? "Role"}</span>
          {job.tags.slice(1, 2).map((t) => (
            <span key={t} className="rounded-lg bg-v2-blue-soft px-3 py-1.5 text-[12.5px] font-semibold text-v2-blue-ink">
              {t}
            </span>
          ))}
        </div>

        <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-soft">
          <li className="flex items-center gap-1.5">
            <CalendarIcon size={15} />
            Posted {job.posted.toLowerCase()}
          </li>
          <li className="flex items-center gap-1.5">
            <UserIcon size={15} />
            {d.applicants}
          </li>
          <li className="flex items-center gap-1.5">
            <BriefcaseIcon size={15} />
            {d.workMode}
          </li>
        </ul>
      </div>

      <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} className="px-5" aria-label="Job sections" />

      <div className="flex-1 space-y-5 p-5">
        {tab === "overview" && (
          <>
            <section>
              <h3 className="font-display text-[15px] font-bold! tracking-normal! text-ink">Job Description</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{d.description}</p>
            </section>
            <section>
              <h3 className="font-display text-[15px] font-bold! tracking-normal! text-ink">Key Responsibilities</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-ink-soft marker:text-ink">
                {d.responsibilities.slice(0, 5).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
            <div className="grid gap-5 border-t border-v2-line/70 pt-4 sm:grid-cols-[1.4fr_1fr]">
              <section>
                <h3 className="flex items-center gap-2 font-display text-[13.5px] font-bold! tracking-normal! text-ink">
                  <CheckCircleIcon size={16} className="text-v2-green" />
                  Skills You Have <span className="font-medium text-v2-green-ink">({have.length}/{have.length + improve.length})</span>
                </h3>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {have.map((s) => (
                    <li key={s}>
                      <JobTag className="bg-v2-green-soft text-v2-green-ink">{s}</JobTag>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="flex items-center gap-2 font-display text-[13.5px] font-bold! tracking-normal! text-ink">
                  <LightbulbIcon size={16} className="text-v2-coral" />
                  Skills to Improve
                </h3>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {improve.map((s) => (
                    <li key={s}>
                      <JobTag className="bg-paper-2 text-ink-soft">{s}</JobTag>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
        {tab === "requirements" && (
          <>
            <section>
              <h3 className="font-display text-[15px] font-bold! tracking-normal! text-ink">Required Qualifications</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-ink-soft marker:text-ink">
                {d.required.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="font-display text-[15px] font-bold! tracking-normal! text-ink">Preferred Qualifications</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-ink-soft marker:text-ink">
                {d.preferred.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          </>
        )}
        {tab === "about" && (
          <section>
            <h3 className="font-display text-[15px] font-bold! tracking-normal! text-ink">About {d.about.name}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{d.about.blurb}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-v2-muted">Industry</dt>
              <dd className="text-ink">{d.about.industry}</dd>
              <dt className="text-v2-muted">Size</dt>
              <dd className="text-ink">{d.about.size}</dd>
              <dt className="text-v2-muted">Headquarters</dt>
              <dd className="text-ink">{d.about.hq}</dd>
            </dl>
          </section>
        )}
        {tab === "reviews" && (
          <p className="rounded-xl bg-paper-2 p-4 text-[13.5px] text-ink-soft">No reviews yet.</p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2.5 border-t border-v2-line/70 bg-paper p-4 sm:flex-row">
        <Link
          href={`/ai-apply?job=${job.id}`}
          className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-v2-green px-5 py-3 text-[15px] font-bold text-white transition-[filter] hover:brightness-95"
        >
          <ZapIcon size={17} />
          Apply with AI
          <ArrowRightIcon size={16} />
        </Link>
        <SaveButton job={job} label="Save Job" className={cn("sm:w-[150px]")} size={17} />
      </div>
    </aside>
  );
}
