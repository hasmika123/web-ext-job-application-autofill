import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChartIcon,
  DollarIcon,
  FileTextIcon,
  GlobeIcon,
  LightbulbIcon,
  LinkIcon,
  MapPinIcon,
  SendIcon,
  SparklesIcon,
  StarDoodle,
  UserIcon,
  UsersIcon,
  VerifiedIcon,
  cn,
} from "@kiwiply/ui";
import { CompanyTile, ProgressRing, SectionCard, TONE, type Tone } from "@/components/app-v2/common";
import type { SampleJob } from "@/components/app-v2/sample-data";
import { JobTag, SaveButton } from "./JobBits";
import DetailTabs from "./DetailTabs";
import { detailFor, scoreTone } from "./job-utils";

/**
 * Job detail page (board `app-job-detail.webp`): header card with Apply Now, section tabs, description,
 * responsibilities / qualifications / additional information on the left; match score, AI insights,
 * About company and Similar Jobs on the right. Google's copy is the board's verbatim; every other job
 * gets the same structure generated from its own fields (`detailFor`).
 */

function Card({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 rounded-2xl border border-v2-line/70 bg-paper p-5 shadow-v2-soft", className)}>
      {children}
    </section>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-[17px] font-bold! leading-tight! tracking-normal! text-ink">{children}</h2>;
}

function CheckList({ items, soft }: { items: string[]; soft?: boolean }) {
  return (
    <ul className="mt-3.5 space-y-3">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-3 text-[13.5px] leading-snug text-ink-soft">
          <span
            aria-hidden
            className={cn(
              "mt-px grid h-[20px] w-[20px] flex-none place-items-center rounded-full",
              soft ? "bg-v2-blue-soft text-v2-blue" : "bg-v2-green text-white",
            )}
          >
            <CheckIcon size={12} />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function Fact({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-xl bg-paper px-2.5 py-2.5">
      <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-v2-blue-soft text-v2-blue">{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block break-words text-[12.5px] font-semibold text-ink">{value}</span>
        <span className="block text-[11.5px] text-v2-muted">{label}</span>
      </span>
    </li>
  );
}

function Info({ icon, label, value, link }: { icon: ReactNode; label: string; value: string; link?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex-none text-v2-blue">{icon}</span>
      <div className="min-w-0 leading-tight">
        <div className="text-[13px] font-semibold text-ink">{label}</div>
        <div className={cn("mt-0.5 break-words text-[12.5px]", link ? "text-v2-blue-ink underline-offset-2" : "text-v2-muted")}>{value}</div>
      </div>
    </div>
  );
}

export default function JobDetailView({
  job,
  prev,
  next,
  similar,
}: {
  job: SampleJob;
  prev: SampleJob | null;
  next: SampleJob | null;
  similar: SampleJob[];
}) {
  const d = detailFor(job);
  const place = [job.location, job.mode ? (job.id === "google-swe-intern" ? "Remote (Hybrid)" : job.mode) : null].filter(Boolean).join(" · ");
  const applyHref = `/ai-apply?job=${job.id}`;
  const insightTone: Record<string, Tone> = { green: "green", amber: "amber", blue: "blue" };
  const insightIcon = [<ChartIcon key="c" size={18} />, <LightbulbIcon key="l" size={18} />, <FileTextIcon key="f" size={18} />];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-[13.5px]">
        <Link href="/jobs" className="inline-flex items-center gap-2 font-medium text-v2-blue-ink hover:underline">
          <ArrowLeftIcon size={15} />
          Back to Search Results
        </Link>
        <div className="flex items-center gap-4 text-ink-soft">
          {prev ? (
            <Link href={`/jobs/${prev.id}`} className="inline-flex items-center gap-1 hover:text-ink">
              <ChevronLeftIcon size={15} />
              Previous
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 opacity-40">
              <ChevronLeftIcon size={15} />
              Previous
            </span>
          )}
          <span aria-hidden className="h-4 w-px bg-v2-line" />
          {next ? (
            <Link href={`/jobs/${next.id}`} className="inline-flex items-center gap-1 hover:text-ink">
              Next
              <ChevronRightIcon size={15} />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 opacity-40">
              Next
              <ChevronRightIcon size={15} />
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Main column ─────────────────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <CompanyTile name={job.company} size={96} className="rounded-2xl border border-v2-line/70" />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-[26px] font-extrabold leading-[1.08] text-ink sm:text-[30px]">{job.title}</h1>
                <div className="mt-1 flex items-center gap-1.5 text-[17px] font-bold text-ink">
                  {job.company}
                  {d.verified && <VerifiedIcon size={18} className="text-v2-blue" />}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[14px] text-ink-soft">
                  <MapPinIcon size={15} className="text-v2-muted" />
                  {place || "Location not listed"}
                </div>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {job.tags.map((t) => (
                    <li key={t}>
                      <JobTag className="px-3 py-1.5 text-[12.5px]">{t}</JobTag>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-none flex-col items-start gap-3 sm:items-end">
                <div className="flex items-center gap-2.5">
                  <SaveButton job={job} size={19} className="h-11 w-11 rounded-xl border border-v2-line" />
                  <Link
                    href={applyHref}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-v2-lime px-6 text-[14.5px] font-bold text-v2-navy transition-[filter] hover:brightness-95"
                  >
                    <SendIcon size={16} />
                    Apply Now
                  </Link>
                </div>
                <div className="text-[13px] leading-snug text-ink-soft sm:text-right">
                  <div>{d.postedDetail}</div>
                  <div>{d.applications}</div>
                </div>
              </div>
            </div>
          </Card>

          <DetailTabs />

          <Card id="overview" className="relative overflow-hidden bg-[linear-gradient(105deg,#FFFFFF_0%,#F4FBEA_60%,#E9F6E4_100%)]">
            <div className="grid items-center gap-3 md:grid-cols-[1fr_300px]">
              <div className="min-w-0">
                <h2 className="font-display text-[21px] font-extrabold! leading-tight! tracking-normal! text-ink">Job Description</h2>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{d.description}</p>
              </div>
              <div className="relative hidden min-h-[130px] items-end justify-end md:flex">
                <StarDoodle aria-hidden className="absolute right-1 top-0 h-6 w-6 text-v2-amber" />
                <p
                  aria-hidden
                  className="absolute left-0 top-0 z-10 -rotate-6 bg-v2-sticky px-3 py-2 font-[family-name:var(--font-hand)] text-[17px] leading-[1.05] text-v2-sticky-ink shadow-v2-soft"
                >
                  {d.stickyNote}
                </p>
                <Image src="/v2/app/mascot-wave-laptop.png" alt="" unoptimized width={145} height={142} className="relative h-auto w-[150px] object-contain" />
              </div>
            </div>
            <ul className="mt-5 grid gap-2 rounded-2xl border border-v2-line/70 bg-paper p-2 sm:grid-cols-2 lg:grid-cols-5">
              <Fact icon={<BriefcaseIcon size={16} />} value={job.tags[0] ?? "Role"} label="Job Type" />
              <Fact icon={<MapPinIcon size={16} />} value={job.location || "Not listed"} label="Location" />
              <Fact icon={<GlobeIcon size={16} />} value={job.id === "google-swe-intern" ? "Remote (Hybrid)" : (job.mode ?? "Not listed")} label="Work Mode" />
              <Fact icon={<CalendarIcon size={16} />} value={d.duration} label="Duration" />
              <Fact icon={<DollarIcon size={16} />} value={d.monthly} label="Monthly (Est.)" />
            </ul>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card id="responsibilities">
              <H>Key Responsibilities</H>
              <CheckList items={d.responsibilities} />
            </Card>
            <Card id="requirements">
              <H>Required Qualifications</H>
              <CheckList items={d.required} />
            </Card>
            <Card id="benefits">
              <H>Preferred Qualifications</H>
              <CheckList items={d.preferred} soft />
            </Card>
            <Card id="company">
              <H>Additional Information</H>
              <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-4">
                <Info icon={<CalendarIcon size={18} />} label="Application Deadline" value={d.additional.deadline} />
                <Info icon={<UserIcon size={18} />} label="Work Authorization" value={d.additional.auth} />
                <Info icon={<GlobeIcon size={18} />} label="Visa Sponsorship" value={d.additional.visa} />
                <Info icon={<SendIcon size={18} />} label="Relocation Support" value={d.additional.relocation} />
                <Info icon={<BriefcaseIcon size={18} />} label="Job Function" value={d.additional.fn} />
                <Info icon={<UsersIcon size={18} />} label="Company Size" value={d.additional.size} />
                <Info icon={<BuildingIcon size={18} />} label="Industry" value={d.additional.industry} />
                <Info icon={<LinkIcon size={18} />} label="Website" value={d.additional.website || "Not listed"} link />
              </div>
            </Card>
          </div>
        </div>

        {/* ── Right rail ──────────────────────────────────────────────────────────────── */}
        <aside aria-label="Match and company" className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Your Match Score">
            <div className="flex items-center gap-4">
              <div className="flex flex-none flex-col items-center text-center">
                <ProgressRing value={d.match.value} tone={scoreTone(d.match.value)} size={112} thickness={11} label={`${d.match.value} percent match`}>
                  <span className="font-display text-[28px] font-extrabold text-ink">{d.match.value}%</span>
                </ProgressRing>
              </div>
              <ul className="min-w-0 flex-1 space-y-2.5">
                {d.match.checks.map((c) => (
                  <li key={c} className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <CheckCircleIcon size={17} className="flex-none text-v2-green" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 text-center">
              <div className="font-display text-[17px] font-extrabold text-v2-green-ink">{d.match.headline}</div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-v2-muted">{d.match.blurb}</p>
            </div>
          </SectionCard>

          <section id="insights" className="scroll-mt-24 rounded-2xl border border-v2-line/70 bg-paper p-5 shadow-v2-soft">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold! leading-tight! tracking-normal! text-ink">
                <SparklesIcon size={18} className="text-v2-blue" />
                AI-Powered Insights
              </h2>
              <Link href="/ai-tools" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-v2-blue-ink hover:underline">
                View More
                <ArrowRightIcon size={13} />
              </Link>
            </div>
            <ul className="space-y-2.5">
              {d.insights.map((i, n) => {
                const t = TONE[insightTone[i.tone] ?? "blue"];
                return (
                  <li key={i.title} className="flex items-center gap-3 rounded-xl bg-v2-blue-soft/40 p-2.5">
                    <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", t.soft, t.ink)}>{insightIcon[n]}</span>
                    <div className="min-w-0 leading-snug">
                      <div className="text-[13px] font-bold text-ink">{i.title}</div>
                      <div className="text-[12px] text-v2-muted">{i.body}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <SectionCard title={`About ${d.about.name}`} action={{ label: "View Company", href: "/companies" }}>
            <div className="flex items-start gap-3">
              <CompanyTile name={job.company} size={52} className="border border-v2-line/70" />
              <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-soft">{d.about.blurb}</p>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_120px] items-end gap-3">
              <ul className="space-y-2 text-[12.5px] text-ink-soft">
                <li className="flex items-center gap-2">
                  <BriefcaseIcon size={15} className="text-v2-blue" />
                  {d.about.industry}
                </li>
                <li className="flex items-center gap-2">
                  <UsersIcon size={15} className="text-v2-blue" />
                  {d.about.size}
                </li>
                <li className="flex items-center gap-2">
                  <MapPinIcon size={15} className="text-v2-blue" />
                  {d.about.hq}
                </li>
                <li className="flex min-w-0 items-center gap-2">
                  <LinkIcon size={15} className="flex-none text-v2-blue" />
                  <span className="truncate text-v2-blue-ink">{d.about.site || "Not listed"}</span>
                </li>
              </ul>
              {/* The board shows a building photo; we have no photo rights, so a tinted panel stands in. */}
              <div
                aria-hidden
                className="grid h-[92px] place-items-center rounded-xl bg-[linear-gradient(135deg,#DDEBFF_0%,#E9F6E4_100%)] text-v2-blue/60"
              >
                <BuildingIcon size={34} />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Similar Jobs" action={{ label: "View all", href: "/jobs" }}>
            <ul className="space-y-3.5">
              {similar.map((s) => (
                <li key={s.id} className="flex items-start gap-3">
                  <CompanyTile name={s.company} size={46} className="border border-v2-line/70" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/jobs/${s.id}`} className="block truncate text-[13.5px] font-bold text-ink hover:underline">
                      {s.title}
                    </Link>
                    <div className="flex items-center gap-1 truncate text-[12px] text-v2-muted">
                      {s.company}
                      {!s.real && <VerifiedIcon size={12} className="flex-none text-v2-blue" />}
                    </div>
                    <div className="truncate text-[12px] text-v2-muted">{[s.location, s.mode].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.tags.slice(0, 2).map((t) => (
                        <JobTag key={t} className="text-[11px]">
                          {t}
                        </JobTag>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1.5">
                    <span className="rounded-full bg-v2-green-soft px-2 py-1 text-[11.5px] font-bold text-v2-green-ink">{s.score}% Match</span>
                    <SaveButton job={s} size={17} className="h-8 w-8" />
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
