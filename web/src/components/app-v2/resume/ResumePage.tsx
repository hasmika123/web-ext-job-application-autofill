"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightIcon,
  FileTextIcon,
  PencilIcon,
  SparklesIcon,
  TargetIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  Menu,
  useToast,
} from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import {
  RESUME_AI_POINTS,
  RESUME_BENEFITS,
  RESUME_SAMPLE_VERSIONS,
  RESUME_SCORE,
  RESUME_TABS,
  RESUME_TEMPLATES,
} from "../sample-data.pages";
import { CheckList, HeroArt, IconTile, KebabMenu, PageHero, SectionCard, StatusChip, UnderlineTabs } from "../local";
import ResumeDrawer from "./ResumeDrawer";
import TemplateThumb from "./TemplateThumb";

interface VersionRow {
  id: number;
  label: string;
  date: string;
  version: number;
  isDefault: boolean;
}

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "—";

/** Real resumes -> version rows: newest first, "Version N" counting up from the oldest. */
function toVersions(resumes: Resume[]): VersionRow[] {
  const live = resumes.filter((r) => !r.archived);
  const oldestFirst = [...live].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const def = live.find((r) => r.defaultResume) ?? null;
  return oldestFirst
    .map((r, i) => ({ id: r.id, label: r.label, date: fmt(r.createdAt), version: i + 1, isDefault: def ? r.id === def.id : false }))
    .reverse();
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Resume Builder (board `app-resume-builder.webp`). "My Resume" (name, updated, version) and
 * "Recent Versions" come from the REAL resumes; with none yet the board's sample file names
 * show. Templates, score and suggestions are sample. "Edit Resume" and "Create New Resume" open
 * the existing `ResumesWorkspace` in a side drawer (the real upload / review / manage flow).
 */
export default function ResumePage({
  resumes,
  usage,
  baseProfile,
  isPro,
}: {
  resumes: Resume[];
  usage: Record<number, number>;
  baseProfile: Record<string, unknown>;
  isPro: boolean;
}) {
  const toast = useToast();
  const [tab, setTab] = useState("my-resume");
  const [template, setTemplate] = useState(RESUME_TEMPLATES[0]);
  const [jd, setJd] = useState("");
  const [open, setOpen] = useState(false);

  const real = useMemo(() => toVersions(resumes), [resumes]);
  const usingSample = real.length === 0;
  const versions: VersionRow[] = usingSample ? RESUME_SAMPLE_VERSIONS : real;
  const current = versions.find((v) => v.isDefault) ?? versions[0];
  const versionCount = usingSample ? current.version : real.length;
  const soon = () => toast({ title: "Coming soon" });
  const go = (value: string) => {
    setTab(value);
    if (value !== "my-resume") scrollToId(value);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <PageHero
          title="Resume Builder"
          subtitle="Create a standout resume with AI. Get tailored suggestions, industry-specific templates, and real-time feedback."
          art={<HeroArt mascot="mascot-resume" note="Same resume. More opportunities." mascotHeight={128} />}
        />
        <div className="rounded-2xl border border-v2-line bg-[linear-gradient(160deg,#F1FBE5_0%,#EAF8F0_100%)] p-5">
          <CheckList items={RESUME_BENEFITS} large />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-v2-line bg-white pr-3 shadow-v2-card sm:pr-4">
        <UnderlineTabs ariaLabel="Resume sections" value={tab} onChange={go} className="min-w-0 flex-1 border-b-0 px-2 sm:px-4" tabs={RESUME_TABS} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="my-2 inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-v2-green px-4 text-[14px] font-bold text-white hover:brightness-95"
        >
          <span aria-hidden>+</span> Create New Resume
        </button>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section id="my-resume" className="scroll-mt-24 rounded-2xl border border-v2-line bg-white p-4 shadow-v2-card sm:p-5">
            <h2 className="text-[20px] font-extrabold tracking-tight text-v2-navy">My Resume</h2>
            <p className="mt-1 text-[13.5px] text-v2-ink-soft">Keep your resume updated and tailored for each job application.</p>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-v2-line p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <IconTile tone="bg-v2-blue-soft text-v2-blue"><FileTextIcon className="h-5 w-5" /></IconTile>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-v2-navy">{current.label}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-v2-ink-soft">
                    <span>
                      Last updated {current.date} {"·"} Version {versionCount}
                    </span>
                    {current.isDefault && <StatusChip tone="green" className="rounded-md px-2 py-0.5 text-[11.5px]">Default Resume</StatusChip>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
                >
                  <PencilIcon className="h-4 w-4" /> Edit Resume
                </button>
                <Menu
                  align="end"
                  items={[
                    { label: "Upload a new resume", onSelect: () => setOpen(true) },
                    { label: "Manage resumes", onSelect: () => setOpen(true) },
                  ]}
                  trigger={
                    <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]">
                      More Actions <ChevronDownIcon className="h-4 w-4" />
                    </span>
                  }
                />
              </div>
            </div>
          </section>

          <section id="templates" className="scroll-mt-24 rounded-2xl border border-v2-line bg-white p-4 shadow-v2-card sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-extrabold tracking-tight text-v2-navy">Choose a Template</h2>
                <p className="mt-1 text-[13.5px] text-v2-ink-soft">Professional, modern templates designed for different industries.</p>
              </div>
              <button type="button" onClick={soon} className="inline-flex flex-none items-center gap-1 text-[13px] font-semibold text-v2-blue hover:underline">
                View all templates <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
              {RESUME_TEMPLATES.map((t) => (
                <TemplateThumb key={t} name={t} selected={t === template} onSelect={() => setTemplate(t)} />
              ))}
            </div>
          </section>

          <section id="ai-suggestions" className="scroll-mt-24 rounded-2xl border border-v2-line bg-[#F4F8FF] p-4 sm:p-5">
            <div className="grid gap-5 md:grid-cols-[1fr_1.1fr] md:items-center">
              <div className="flex items-start gap-3">
                <IconTile tone="bg-v2-blue-soft text-v2-blue"><SparklesIcon className="h-6 w-6" /></IconTile>
                <div>
                  <h2 className="text-[17px] font-extrabold tracking-tight text-v2-navy">AI Resume Suggestions</h2>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-v2-ink-soft">
                    Get personalized suggestions to improve your resume and increase your chances of getting interviews.
                  </p>
                  <button
                    type="button"
                    onClick={soon}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-v2-green px-4 text-[13.5px] font-bold text-white hover:brightness-95"
                  >
                    Get AI Suggestions <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-white p-4">
                <CheckList items={RESUME_AI_POINTS} className="space-y-2.5" />
              </div>
            </div>
          </section>

          <section id="cover-letter" className="scroll-mt-24 flex flex-col gap-3 rounded-2xl border border-v2-line bg-white p-4 shadow-v2-card sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <IconTile tone="bg-v2-blue-soft text-v2-blue"><FileTextIcon className="h-6 w-6" /></IconTile>
              <div>
                <h2 className="text-[17px] font-extrabold tracking-tight text-v2-navy">Cover Letter</h2>
                <p className="text-[13.5px] text-v2-ink-soft">Create personalized cover letters for your applications with AI.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={soon}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
            >
              Create Cover Letter <ArrowRightIcon className="h-4 w-4" />
            </button>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Resume Score">
            <div className="flex flex-wrap items-center gap-5">
              <div
                role="img"
                aria-label={`Resume score ${RESUME_SCORE.total} out of 100`}
                className="relative mx-auto h-[128px] w-[128px] flex-none rounded-full sm:mx-0"
                style={{ background: `conic-gradient(var(--color-v2-green) ${RESUME_SCORE.total}%, #E8ECF4 0)` }}
              >
                <div className="absolute inset-[11px] flex flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-[34px] font-extrabold leading-none tracking-tight text-v2-navy">{RESUME_SCORE.total}</span>
                  <span className="mt-1 text-[13px] font-semibold text-v2-ink-soft">{RESUME_SCORE.verdict}</span>
                </div>
              </div>
              <ul className="min-w-[160px] flex-1 space-y-2.5">
                {RESUME_SCORE.parts.map((p) => (
                  <li key={p.label} className="flex items-center gap-2.5 text-[13.5px] text-v2-navy">
                    <CheckCircleIcon className="h-[18px] w-[18px] flex-none text-v2-green" />
                    <span className="flex-1">{p.label}</span>
                    <span className="tabular-nums text-v2-ink-soft">{p.score}/100</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 flex items-start gap-3 rounded-xl bg-[#F1F5FB] p-3 text-[13px] leading-snug text-v2-ink-soft">
              <TargetIcon className="mt-0.5 h-5 w-5 flex-none text-v2-coral" />
              {RESUME_SCORE.tip}
            </p>
          </SectionCard>

          <SectionCard title="Tailor for a Specific Job" subtitle="Optimize your resume for a job description using AI.">
            <label className="block">
              <span className="sr-only">Job description</span>
              <textarea
                value={jd}
                onChange={(e) => setJd(e.target.value.slice(0, 5000))}
                rows={4}
                placeholder="Paste job description here..."
                className="w-full resize-none rounded-xl border border-v2-line bg-white p-3 text-[13.5px] text-v2-navy outline-none placeholder:text-v2-muted focus:border-v2-blue"
              />
            </label>
            <p className="-mt-1 text-right text-[11.5px] tabular-nums text-v2-muted">{jd.length}/5000</p>
            <button
              type="button"
              onClick={soon}
              className="mt-1 inline-flex h-10 items-center gap-2 rounded-xl bg-v2-green px-4 text-[13.5px] font-bold text-white hover:brightness-95"
            >
              Tailor My Resume <ArrowRightIcon className="h-4 w-4" />
            </button>
          </SectionCard>

          <div id="version-history" className="scroll-mt-24">
            <SectionCard title="Recent Versions" action={{ label: "View all", onClick: () => setOpen(true) }}>
              <ul className="divide-y divide-v2-line/70">
                {versions.slice(0, 3).map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <IconTile tone="bg-v2-blue-soft text-v2-blue"><FileTextIcon className="h-5 w-5" /></IconTile>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-v2-navy">{v.label}</p>
                      <p className="text-[12px] text-v2-ink-soft">
                        {v.date} {"·"} Version {v.version}
                      </p>
                    </div>
                    {v.isDefault ? (
                      <StatusChip tone="green" className="rounded-lg px-3 py-1.5">Default</StatusChip>
                    ) : (
                      <KebabMenu label={`More actions for ${v.label}`} items={[{ label: "Manage resumes", onSelect: () => setOpen(true) }]} />
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </aside>
      </div>

      {open && <ResumeDrawer onClose={() => setOpen(false)} baseProfile={baseProfile} resumes={resumes} usage={usage} isPro={isPro} />}
    </div>
  );
}

