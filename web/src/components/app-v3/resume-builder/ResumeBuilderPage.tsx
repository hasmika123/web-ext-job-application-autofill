"use client";

import { useMemo, useState } from "react";
import { Dialog, FileTextIcon, PlusIcon, SparklesIcon, cn, useToast } from "@kiwiply/ui";
import type { Resume } from "@/components/ResumeList";
import ResumeDrawer from "@/components/app-v2/resume/ResumeDrawer";
import TemplateThumb from "@/components/app-v2/resume/TemplateThumb";
import { IconTile, SectionCard, StatusChip, UnderlineTabs } from "@/components/app-v2/common";
import { HeroBand } from "@/components/app-v2/common";
import {
  RB_AI_SUGGESTIONS,
  RB_COVER_LETTER,
  RB_DEFAULT_SECTION,
  RB_EXAMPLES,
  RB_SAMPLE_VERSIONS,
  RB_SECTIONS,
  RB_SECTION_TEXT,
  RB_TABS,
  RB_TEMPLATES,
} from "../sample-data";
import SectionEditor from "./SectionEditor";

interface VersionRow {
  id: number;
  label: string;
  date: string;
  version: number;
  isDefault: boolean;
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

/** Real resumes -> version rows: newest first, "Version N" counting up from the oldest. */
function toVersions(resumes: Resume[]): VersionRow[] {
  const live = resumes.filter((r) => !r.archived);
  const oldestFirst = [...live].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const def = live.find((r) => r.defaultResume) ?? null;
  return oldestFirst
    .map((r, i) => ({ id: r.id, label: r.label, date: fmt(r.createdAt), version: i + 1, isDefault: def ? r.id === def.id : false }))
    .reverse();
}

const LIME_BTN = "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-v2-lime px-4 text-[13.5px] font-bold text-v2-navy hover:brightness-95";
const GHOST_BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]";

/**
 * Resume Builder (APP-V3-SPEC 2.7). Left: section list. Centre: the editor card with a visual
 * formatting toolbar. Right rail: templates + AI suggestions. The "your resumes" strip above the
 * tabs is REAL (default resume, version count, recent versions) and "Manage resumes" / "Create New
 * Resume" open the existing `ResumesWorkspace` in a side panel (v2 wiring kept). The editor text
 * itself is client state: Save keeps it for this session only, since the API stores uploaded resume
 * files and parsed fields, not free-text drafts. AI buttons say "Coming soon".
 */
export default function ResumeBuilderPage({
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
  const [tab, setTab] = useState("builder");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [template, setTemplate] = useState(RB_TEMPLATES[0]);
  const [sections, setSections] = useState<string[]>(RB_SECTIONS);
  const [active, setActive] = useState(RB_DEFAULT_SECTION);
  const [texts, setTexts] = useState<Record<string, string>>(RB_SECTION_TEXT);
  const [cover, setCover] = useState(RB_COVER_LETTER);

  const real = useMemo(() => toVersions(resumes), [resumes]);
  // With no resumes yet the board's sample names show (so the page looks like the board).
  const versions: VersionRow[] = real.length === 0 ? RB_SAMPLE_VERSIONS : real;
  const current = versions.find((v) => v.isDefault) ?? versions[0];
  const soon = () => toast({ title: "Coming soon" });
  const setText = (v: string) => setTexts((p) => ({ ...p, [active]: v }));

  const addSection = () => {
    let n = 1;
    while (sections.includes(`Custom Section ${n}`)) n += 1;
    const name = `Custom Section ${n}`;
    setSections((s) => [...s, name]);
    setTexts((p) => ({ ...p, [name]: "" }));
    setActive(name);
  };

  const templatePicker = (cols: string) => (
    <div className={cn("grid gap-3", cols)}>
      {RB_TEMPLATES.map((t) => (
        // A definite width per cell keeps every thumbnail the same size (the thumb is content-sized otherwise).
        <div key={t} className="w-full max-w-[84px] [&>button]:w-full">
          <TemplateThumb name={t} selected={t === template} onSelect={() => setTemplate(t)} />
        </div>
      ))}
    </div>
  );

  /** A CSS-typeset resume page built from the section texts (board 2/3 "Templates" view). */
  const resumePreview = (
    <article
      aria-label={`${template} resume preview`}
      className={cn(
        "mx-auto w-full max-w-[560px] overflow-hidden rounded-xl border border-v2-line bg-white text-[12px] leading-snug text-v2-ink-soft shadow-v2-soft",
        template === "Classic" && "font-serif",
      )}
    >
      <header
        className={cn(
          "px-6 pb-3 pt-5",
          template === "Professional" && "bg-v2-navy text-white",
          template === "Creative" && "bg-[linear-gradient(135deg,#D9F5EE_0%,#E6DEFB_50%,#FFE3EE_100%)]",
          template === "Classic" && "text-center",
        )}
      >
        <h3 className={cn("font-display text-[22px] font-extrabold", template === "Professional" ? "text-white" : "text-v2-navy")}>Priya Sharma</h3>
        <p className={cn("text-[12px]", template === "Professional" && "text-white/80")}>Software Engineer</p>
        <p className={cn("mt-0.5 text-[11px]", template === "Professional" && "text-white/70")}>San Francisco, CA {"·"} priya@email.com {"·"} linkedin.com/in/priya</p>
      </header>
      <div className="space-y-3 px-6 pb-6 pt-3">
        {sections
          .filter((s) => s !== "Personal Info" && (texts[s] ?? "").trim() !== "")
          .map((s) => (
            <section key={s}>
              <h4 className="border-b border-v2-line pb-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-v2-navy">{s}</h4>
              <p className="mt-1 whitespace-pre-wrap">{texts[s]}</p>
            </section>
          ))}
      </div>
    </article>
  );

  const suggestions = (
    <ul className="space-y-2">
      {RB_AI_SUGGESTIONS.map((s) => (
        <li key={s.title}>
          <button
            type="button"
            onClick={soon}
            className="flex w-full items-center gap-3 rounded-xl border border-v2-line bg-white p-2.5 text-left hover:bg-[#F8FAFF]"
          >
            <IconTile tone={s.tone} className="h-9 w-9">
              <SparklesIcon className="h-4 w-4" />
            </IconTile>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold leading-tight text-v2-navy">{s.title}</span>
              <span className="block text-[12px] leading-snug text-v2-ink-soft">{s.sub}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand
        title="Resume Builder"
        subtitle="Create a professional resume that gets you interviews."
        mascot="mascot-resume"
        note="Same resume. More opportunities."
      />

      {/* REAL: default resume + recent versions; the side panel is the existing resume workspace. */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-v2-line bg-white p-3.5 shadow-v2-soft">
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <span className="flex-none">
            <IconTile tone="blue">
              <FileTextIcon className="h-5 w-5" />
            </IconTile>
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-v2-navy">{current.label}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-v2-ink-soft">
              <span>
                Last updated {current.date} {"·"} Version {current.version}
              </span>
              {current.isDefault && (
                <StatusChip tone="green" className="rounded-md px-2 py-0.5 text-[11.5px]">
                  Default Resume
                </StatusChip>
              )}
            </p>
          </div>
        </div>
        <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Recent versions">
          {versions.slice(0, 3).map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="max-w-[210px] truncate rounded-lg bg-paper-2 px-2.5 py-1.5 text-[12px] font-medium text-v2-ink-soft hover:bg-[#E8EEF8]"
              >
                {v.label} {"·"} v{v.version}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOpen(true)} className={GHOST_BTN}>
            Manage resumes
          </button>
          <button type="button" onClick={() => setOpen(true)} className={LIME_BTN}>
            <PlusIcon className="h-4 w-4" /> Create New Resume
          </button>
        </div>
      </section>

      <div className="rounded-2xl border border-v2-line bg-white shadow-v2-soft">
        <UnderlineTabs padded counts="pill" ariaLabel="Resume builder sections" value={tab} onChange={setTab} className="border-b-0 px-2 sm:px-4" tabs={RB_TABS} />
      </div>

      {tab === "builder" && (
        <div className="grid items-start gap-5 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_300px]">
          <SectionCard title="Sections" className="lg:sticky lg:top-24" bodyClassName="-mx-1">
            <ul className="flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:pb-0">
              {sections.map((s) => (
                <li key={s} className="flex-none">
                  <button
                    type="button"
                    aria-current={s === active ? "true" : undefined}
                    onClick={() => setActive(s)}
                    className={cn(
                      "w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors",
                      s === active ? "bg-v2-blue-soft font-bold text-v2-blue" : "font-medium text-v2-ink-soft hover:bg-[#F1F5FB]",
                    )}
                  >
                    {s}
                  </button>
                </li>
              ))}
              <li className="flex-none">
                <button
                  type="button"
                  onClick={addSection}
                  className="inline-flex w-full items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13.5px] font-semibold text-v2-blue hover:bg-v2-blue-soft"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Add Section
                </button>
              </li>
            </ul>
          </SectionCard>

          <section className="min-w-0 rounded-2xl border border-v2-line bg-white p-4 shadow-v2-soft sm:p-5" aria-label="Editor">
            <h2 className="font-display text-[18px] font-extrabold tracking-tight text-v2-navy">{active}</h2>
            <div className="mt-3">
              <SectionEditor
                label={active}
                value={texts[active] ?? ""}
                onChange={setText}
                footer={
                  <button type="button" onClick={soon} className={cn(LIME_BTN, "h-9 text-[13px]")}>
                    <SparklesIcon className="h-4 w-4" /> Generate with AI
                  </button>
                }
              />
            </div>

            {active === "Professional Summary" && (
              <div className="mt-4">
                <p className="text-[12.5px] font-semibold text-v2-ink-soft">Examples</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {RB_EXAMPLES.map((ex) => (
                    <li key={ex.role}>
                      <button
                        type="button"
                        onClick={() => setText(ex.text)}
                        className="rounded-full border border-v2-line bg-white px-3 py-1.5 text-[12.5px] font-medium text-v2-navy hover:bg-[#F1F5FB]"
                      >
                        {ex.role}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-v2-line/70 pt-4">
              <button type="button" onClick={() => setPreview(true)} className={GHOST_BTN}>
                Preview
              </button>
              <button type="button" onClick={soon} className={GHOST_BTN}>
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => toast({ title: "Draft saved", description: "Kept for this browser session. Saving to your account is coming soon." })}
                className={LIME_BTN}
              >
                Save
              </button>
            </div>
          </section>

          <aside className="flex min-w-0 flex-col gap-4 lg:col-span-2 xl:col-span-1">
            <SectionCard title="Templates">{templatePicker("grid-cols-3 justify-items-center sm:grid-cols-5 xl:grid-cols-3")}</SectionCard>
            <SectionCard title="AI Suggestions" icon={<SparklesIcon className="h-4 w-4 text-v2-violet" />}>
              {suggestions}
            </SectionCard>
          </aside>
        </div>
      )}

      {tab === "templates" && (
        <div className="grid items-start gap-5 md:grid-cols-[112px_minmax(0,1fr)] lg:grid-cols-[112px_minmax(0,1fr)_280px]">
          <SectionCard title="Templates" className="md:sticky md:top-24">
            {templatePicker("grid-cols-5 justify-items-center md:grid-cols-1")}
          </SectionCard>
          <section className="min-w-0 rounded-2xl border border-v2-line bg-white p-4 shadow-v2-soft sm:p-5" aria-label="Preview">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-v2-ink-soft">
                Selected: <span className="font-bold text-v2-navy">{template}</span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setTab("builder")} className={cn(GHOST_BTN, "h-9 text-[13px]")}>
                  Edit
                </button>
                <button type="button" onClick={soon} className={cn(LIME_BTN, "h-9 text-[13px]")}>
                  Download PDF
                </button>
              </div>
            </div>
            {resumePreview}
          </section>
          <aside className="min-w-0 md:col-span-2 lg:col-span-1">
            <SectionCard title="AI Suggestions" icon={<SparklesIcon className="h-4 w-4 text-v2-violet" />}>
              {suggestions}
            </SectionCard>
          </aside>
        </div>
      )}

      {tab === "ai-suggestions" && (
        <SectionCard title="AI Suggestions" subtitle="One-click improvements for the section you are editing.">
          <div className="max-w-xl">{suggestions}</div>
        </SectionCard>
      )}

      {tab === "cover-letter" && (
        <SectionCard title="Cover Letter" subtitle="Draft a letter to go with your resume.">
          <SectionEditor
            label="Cover letter"
            value={cover}
            onChange={setCover}
            footer={
              <button type="button" onClick={soon} className={cn(LIME_BTN, "h-9 text-[13px]")}>
                <SparklesIcon className="h-4 w-4" /> Generate with AI
              </button>
            }
          />
        </SectionCard>
      )}

      <Dialog
        open={preview}
        onClose={() => setPreview(false)}
        title={`Preview (${template})`}
        footer={
          <button type="button" onClick={() => setPreview(false)} className={GHOST_BTN}>
            Close
          </button>
        }
        className="max-w-[640px]"
      >
        <div className="max-h-[60vh] space-y-4 overflow-y-auto rounded-xl border border-v2-line bg-white p-5">
          {sections
            .filter((s) => (texts[s] ?? "").trim() !== "")
            .map((s) => (
              <section key={s}>
                <h3 className="border-b border-v2-line pb-1 text-[12px] font-extrabold uppercase tracking-wider text-v2-navy">{s}</h3>
                <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-v2-ink-soft">{texts[s]}</p>
              </section>
            ))}
        </div>
      </Dialog>

      {open && <ResumeDrawer onClose={() => setOpen(false)} baseProfile={baseProfile} resumes={resumes} usage={usage} isPro={isPro} />}
    </div>
  );
}
