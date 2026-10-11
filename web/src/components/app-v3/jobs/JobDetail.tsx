"use client";

import { useState } from "react";
import {
  BuildingIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PlusIcon,
  StarIcon,
  XIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import { CompanyTile, UnderlineTabs } from "@/components/app-v2/common";
import { JobTag, SaveButton } from "@/components/app-v2/jobs/JobBits";
import type { V3Job } from "@/components/app-v3/sample-data.a";
import { detailV3 } from "./filter";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "requirements", label: "Requirements" },
  { id: "benefits", label: "Benefits" },
  { id: "company", label: "Company" },
  { id: "reviews", label: "Reviews" },
];

function Bullets({ items, empty = "Not listed." }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="text-[13.5px] text-v2-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-soft marker:text-ink">
      {items.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
}

const H = "font-display text-[15px] font-bold! tracking-normal! text-ink";

/**
 * Right-hand detail panel of Job Search (APP-V3-SPEC 2.2, variant 3): a tinted photo placeholder, title,
 * company, location, salary, tags, Apply / Save / "+", tabs and the role copy. Apply never submits:
 * a real match opens the employer's page in a new tab; a sample listing says so.
 */
export default function JobDetail({ job, onClose }: { job: V3Job; onClose: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const d = detailV3(job);
  const applyUrl = job.real ? (job.real.applyUrl ?? job.real.url) : null;
  const actionCls =
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[14.5px] font-bold transition-[filter] hover:brightness-95";

  return (
    <aside
      aria-label={`${job.title} at ${job.company}`}
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-v2-line/70 bg-paper shadow-v2-soft md:sticky md:top-[84px] md:max-h-[calc(100dvh-100px)] md:overflow-y-auto"
    >
      {/* Photo placeholder: a tinted panel standing in for the company's building photo. */}
      <div className="relative h-[120px] flex-none bg-[linear-gradient(120deg,#DDEBFF_0%,#E6F6EE_55%,#F1FBE4_100%)]">
        <BuildingIcon size={72} className="absolute bottom-[-6px] right-6 text-v2-blue/20" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-paper/90 text-ink-soft shadow-v2-soft hover:text-ink"
        >
          <XIcon size={16} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="absolute left-3 top-3 inline-flex h-9 items-center gap-1 rounded-full bg-paper/90 px-3 text-[12.5px] font-semibold text-ink-soft shadow-v2-soft hover:text-ink md:hidden"
        >
          <ChevronLeftIcon size={14} />
          Results
        </button>
      </div>

      <div className="-mt-8 px-5 pb-4">
        <CompanyTile name={job.company} size={60} className="relative z-[1] rounded-xl border-2 border-paper shadow-v2-soft" />
        <h2 className="mt-3 font-display text-[21px] font-extrabold! leading-tight! tracking-tight! text-ink">{job.title}</h2>
        <div className="mt-1 text-[14px] text-ink-soft">{job.company}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-v2-muted">
          <MapPinIcon size={13} />
          {[job.location, job.type, job.mode === "Remote" && !/remote/i.test(job.location) ? "Remote" : null].filter(Boolean).join(" · ")}
        </div>
        {job.salary && <div className="mt-2 text-[15px] font-bold text-ink">{job.salary}</div>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.tags.map((t) => (
            <JobTag key={t}>{t}</JobTag>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {applyUrl ? (
            <a href={applyUrl} target="_blank" rel="noopener noreferrer" className={cn(actionCls, "flex-1 bg-v2-lime text-v2-navy")}>
              Apply
              <ExternalLinkIcon size={15} />
            </a>
          ) : (
            <button
              type="button"
              onClick={() =>
                toast({ variant: "default", title: "Sample listing. Real matches open the employer's page; you review and press Submit yourself." })
              }
              className={cn(actionCls, "flex-1 bg-v2-lime text-v2-navy")}
            >
              Apply
            </button>
          )}
          <SaveButton job={job} label="Save" className="h-11 flex-1 px-4! py-0! text-[14.5px]!" size={16} />
          <button
            type="button"
            aria-label="Add to a collection"
            onClick={() => toast({ variant: "default", title: "Collections are coming soon." })}
            className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-v2-line bg-paper text-ink-soft hover:bg-paper-2"
          >
            <PlusIcon size={18} />
          </button>
        </div>
      </div>

      <UnderlineTabs tabs={TABS} value={tab} onChange={setTab} className="px-5" ariaLabel="Job sections" />

      <div className="space-y-5 p-5">
        {tab === "overview" && (
          <>
            <section>
              <h3 className={H}>About the role</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{d.about}</p>
            </section>
            <section>
              <h3 className={H}>What you&apos;ll do</h3>
              <div className="mt-2">
                <Bullets items={d.doing} />
              </div>
            </section>
            <section>
              <h3 className={H}>Requirements</h3>
              <div className="mt-2">
                <Bullets items={d.requirements} />
              </div>
            </section>
          </>
        )}
        {tab === "requirements" && (
          <section>
            <h3 className={H}>Requirements</h3>
            <div className="mt-2">
              <Bullets items={d.requirements} />
            </div>
          </section>
        )}
        {tab === "benefits" && (
          <section>
            <h3 className={H}>Benefits</h3>
            <div className="mt-2">
              <Bullets items={d.benefits} />
            </div>
          </section>
        )}
        {tab === "company" && (
          <section>
            <h3 className={H}>About {job.company}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{d.company.blurb}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-v2-muted">Industry</dt>
              <dd className="text-ink">{d.company.industry}</dd>
              <dt className="text-v2-muted">Size</dt>
              <dd className="text-ink">{d.company.size}</dd>
              <dt className="text-v2-muted">Headquarters</dt>
              <dd className="text-ink">{d.company.hq}</dd>
            </dl>
          </section>
        )}
        {tab === "reviews" && (
          <section>
            <h3 className={H}>Reviews</h3>
            {d.reviews.rating ? (
              <div className="mt-2 rounded-xl bg-paper-2 p-4">
                <div className="flex items-center gap-2 text-[14px] font-bold text-ink">
                  <StarIcon size={16} className="text-v2-amber" />
                  {d.reviews.rating}
                  <span className="font-normal text-v2-muted">{d.reviews.count}</span>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">&ldquo;{d.reviews.quote}&rdquo;</p>
              </div>
            ) : (
              <p className="mt-2 text-[13.5px] text-v2-muted">No reviews yet.</p>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
