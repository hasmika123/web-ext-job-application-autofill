"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { StructuredResume, ResumeExperience, ResumeEducation, ResumeProject, ParsedBio } from "./parser-core-types";
import Input from "./primitives/Input";
import { buttonVariants } from "./primitives/Button";
import { cn } from "./primitives/cn";
import { LIMITS } from "./primitives/limits";

type BaseProfile = Record<string, unknown>;

// Contact fields the review can edit + push to the base profile.
const CONTACT_FIELDS: { key: keyof ParsedBio; label: string; wide?: boolean }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", wide: true },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "linkedin", label: "LinkedIn", wide: true },
  { key: "github", label: "GitHub", wide: true },
  { key: "website", label: "Website", wide: true },
];

function labelFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || "Resume";
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Move the item at `from` to `to`, returning a new array (no-op if out of bounds). */
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const compactInput =
  "w-full rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent";

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  maxLength = LIMITS.text,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <input type={type} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} className={compactInput} />
    </label>
  );
}

/**
 * Collapsible review section. The whole header is a toggle (chevron + title); the body and the
 * section `action` (e.g. "Add role") only show when open. `open`/`onToggle` are lifted to the
 * parent so an "Expand all / Collapse all" control can drive every section at once. Sections
 * start MINIMIZED (parent seeds them closed) so the review reads as a scannable outline the
 * user expands as needed.
 */
function SectionCard({
  title,
  action,
  open,
  onToggle,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-3 p-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-muted">
            <Chevron open={open} />
          </span>
          <h3 className="truncate text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
        </button>
        {open && action}
      </div>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("h-[18px] w-[18px] transition-transform", open && "rotate-180")}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-soft transition-colors hover:border-accent hover:text-accent-deep">
      + {label}
    </button>
  );
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-md px-1.5 text-muted transition-colors hover:bg-paper-2 hover:text-danger">
      ✕
    </button>
  );
}

/**
 * Drag-to-reorder for a vertical list, native HTML5 DnD (no dep — same approach as the
 * board). Dragging is armed only while the grip handle is held, so the cards' inputs and
 * textareas keep normal click/text-selection behavior; the whole row is the drag image.
 *
 * `rowProps(i)` spreads onto each row element, `handleProps(i)` onto its <DragGrip>, and
 * `state(i)` returns { over, dragging } for styling the drop target / source.
 */
function useReorder<T>(items: T[], onReorder: (next: T[]) => void) {
  const [drag, setDrag] = useState<number | null>(null); // index being dragged
  const [over, setOver] = useState<number | null>(null); // index hovered as drop target
  const [armed, setArmed] = useState<number | null>(null); // grip held → row is draggable
  const reset = () => { setDrag(null); setOver(null); setArmed(null); };
  const rowProps = (i: number) => ({
    draggable: armed === i,
    onDragStart: (e: DragEvent<HTMLElement>) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* some browsers */ } },
    onDragEnd: reset,
    onDragOver: (e: DragEvent<HTMLElement>) => { if (drag === null) return; e.preventDefault(); if (over !== i) setOver(i); },
    onDrop: (e: DragEvent<HTMLElement>) => { e.preventDefault(); if (drag !== null && drag !== i) onReorder(moveItem(items, drag, i)); reset(); },
  });
  const handleProps = (i: number) => ({
    onPointerDown: () => setArmed(i),
    onPointerUp: () => setArmed((a) => (a === i ? null : a)),
  });
  const state = (i: number) => ({ over: drag !== null && over === i && drag !== i, dragging: drag === i });
  return { rowProps, handleProps, state };
}

/** Six-dot grip; press and drag it to reorder the row it sits in. */
function DragGrip(props: { onPointerDown: () => void; onPointerUp: () => void }) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      title="Drag to reorder"
      className="grid h-6 w-6 cursor-grab touch-none place-items-center rounded-md text-muted transition-colors hover:bg-paper hover:text-ink active:cursor-grabbing"
      {...props}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
        <circle cx="3" cy="2.5" r="1.1" /><circle cx="9" cy="2.5" r="1.1" />
        <circle cx="3" cy="6" r="1.1" /><circle cx="9" cy="6" r="1.1" />
        <circle cx="3" cy="9.5" r="1.1" /><circle cx="9" cy="9.5" r="1.1" />
      </svg>
    </button>
  );
}

type RowDnd = {
  rowProps: React.HTMLAttributes<HTMLElement> & { draggable: boolean };
  handleProps: { onPointerDown: () => void; onPointerUp: () => void };
  state: { over: boolean; dragging: boolean };
};
// Tailwind classes applied to a draggable row to show drop-target / dragging feedback.
const dndRowCls = (s: { over: boolean; dragging: boolean }) =>
  cn(s.over && "ring-2 ring-accent", s.dragging && "opacity-50");

function SkillChips({ skills, baseSet, onChange }: { skills: string[]; baseSet: Set<string>; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...skills];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-line bg-paper p-2.5">
      {skills.map((sk, i) => {
        const isBase = baseSet.has(sk.toLowerCase());
        return (
          <span
            key={i}
            className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold", isBase ? "bg-brown-soft text-brown-deep" : "bg-accent-soft text-accent-deep")}
            title={isBase ? "Already one of your base skills" : "New in this resume — not in your base skills"}
          >
            {sk}
            <button type="button" onClick={() => onChange(skills.filter((x) => x !== sk))} className="opacity-60 hover:opacity-100" aria-label={`Remove ${sk}`}>×</button>
          </span>
        );
      })}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && skills.length) onChange(skills.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        placeholder={skills.length ? "Add a skill…" : "e.g. Python, SQL"}
        className="min-w-[140px] flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}

function SkillLegend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brown" aria-hidden /> In your base skills</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden /> New in this resume</span>
    </div>
  );
}

// Resume dates → a consistent YYYY-MM the <input type="month"> picker accepts. Best-effort
// coercion of the free-text the parser produced (e.g. "Jan 2020", "2020", "01/2020").
const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03", apr: "04", april: "04",
  may: "05", jun: "06", june: "06", jul: "07", july: "07", aug: "08", august: "08", sep: "09", sept: "09",
  september: "09", oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12",
};
function toMonthValue(raw: string): string {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) return `${m[2]}-${MONTHS[m[1]]}`;
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01`;
  return "";
}
/** Normalize parsed data up front: dates → YYYY-MM (so the month pickers populate) and
 *  degrees → a dropdown option when one fits (so they don't default to "Other"). */
function normalizeStruct(struct: StructuredResume): StructuredResume {
  return {
    ...struct,
    experience: struct.experience.map((e) => ({ ...e, startDate: toMonthValue(e.startDate), endDate: toMonthValue(e.endDate) })),
    education: struct.education.map((e) => ({
      ...e,
      startDate: toMonthValue(e.startDate),
      endDate: toMonthValue(e.endDate),
      degree: matchDegree(e.degree) || e.degree,
    })),
  };
}

const DEGREE_OPTIONS = [
  "High School Diploma",
  "Associate's Degree",
  "Bachelor's Degree",
  "Bachelor of Arts (BA)",
  "Bachelor of Science (BS)",
  "Bachelor of Engineering (BEng)",
  "Master's Degree",
  "Master of Arts (MA)",
  "Master of Science (MS)",
  "Master of Business Administration (MBA)",
  "Doctor of Philosophy (PhD)",
  "Juris Doctor (JD)",
  "Doctor of Medicine (MD)",
  "Certificate",
  "Diploma",
];

/**
 * Map a parsed degree string to a dropdown option (so "Master", "BS", "Bachelor of
 * Science", "MBA"… land on a real option instead of "Other"). Specific forms win over
 * the generic level; abbreviations are matched as whole tokens. Returns "" if nothing fits.
 */
function matchDegree(raw: string): string {
  const s = (raw || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const has = (re: RegExp) => re.test(s);
  if (has(/\bmba\b/) || has(/master of business/)) return "Master of Business Administration (MBA)";
  if (has(/master of science\b/) || has(/\bm ?sc?\b/)) return "Master of Science (MS)";
  if (has(/master of arts\b/) || has(/\bma\b/)) return "Master of Arts (MA)";
  if (has(/\bmasters?\b/) || has(/master'?s/)) return "Master's Degree";
  if (has(/bachelor of engineering\b/) || has(/\bb ?eng\b/) || has(/\bbe\b/)) return "Bachelor of Engineering (BEng)";
  if (has(/bachelor of science\b/) || has(/\bb ?sc?\b/)) return "Bachelor of Science (BS)";
  if (has(/bachelor of arts\b/) || has(/\bba\b/) || has(/\bab\b/)) return "Bachelor of Arts (BA)";
  if (has(/\bbachelors?\b/) || has(/bachelor'?s/) || has(/baccalaureate/)) return "Bachelor's Degree";
  if (has(/\bphd\b/) || has(/\bph d\b/) || has(/doctor of philosophy/) || has(/\bdoctorate\b/) || has(/doctoral/) || has(/\bdphil\b/)) return "Doctor of Philosophy (PhD)";
  if (has(/juris doctor/) || has(/\bjd\b/)) return "Juris Doctor (JD)";
  if (has(/doctor of medicine/) || has(/\bmd\b/)) return "Doctor of Medicine (MD)";
  if (has(/\bassociates?\b/) || has(/associate'?s/) || has(/\baa\b/) || has(/\bas\b/) || has(/\baas\b/)) return "Associate's Degree";
  if (has(/high ?school/) || has(/\bged\b/) || has(/secondary school/)) return "High School Diploma";
  if (has(/certificat/) || has(/\bcert\b/)) return "Certificate";
  if (has(/diploma/)) return "Diploma";
  return "";
}

function DegreeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = DEGREE_OPTIONS.includes(value);
  const [other, setOther] = useState(value.trim() !== "" && !known);
  const selectVal = other ? "__other__" : known ? value : "";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Degree</span>
      <select
        value={selectVal}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") setOther(true);
          else {
            setOther(false);
            onChange(v);
          }
        }}
        className={compactInput}
      >
        <option value="">—</option>
        {DEGREE_OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {other && (
        <input
          type="text"
          value={value}
          placeholder="Enter degree"
          onChange={(e) => onChange(e.target.value)}
          className={cn(compactInput, "mt-1")}
        />
      )}
    </label>
  );
}

function GpaField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const num = parseFloat(value);
  const invalid = value.trim() !== "" && (!Number.isFinite(num) || num < 0 || num >= 5);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">GPA</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        max="4.99"
        step="0.01"
        value={value}
        placeholder="e.g. 3.75"
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          // Hard restriction to 0.00–4.99 on blur.
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) {
            if (n < 0) onChange("0.00");
            else if (n >= 5) onChange("4.99");
          }
        }}
        className={cn(compactInput, invalid && "border-danger")}
      />
      {invalid && <span className="text-[11.5px] font-medium text-danger">GPA must be between 0.00 and 4.99</span>}
    </label>
  );
}

// One editable bullet per row — drag the grip to reorder, ✕ to remove, "Add" to append.
function BulletList({ label, bullets, onChange }: { label: string; bullets: string[]; onChange: (next: string[]) => void }) {
  const set = (i: number, v: string) => onChange(bullets.map((b, idx) => (idx === i ? v : b)));
  const add = () => onChange([...bullets, ""]);
  const remove = (i: number) => onChange(bullets.filter((_, idx) => idx !== i));
  const { rowProps, handleProps, state } = useReorder(bullets, onChange);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
        <AddBtn onClick={add} label="Add" />
      </div>
      {bullets.length === 0 ? (
        <p className="text-[12.5px] text-muted">No highlights yet — add one.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {bullets.map((b, i) => (
            <li key={i} {...rowProps(i)} className={cn("flex items-start gap-1.5 rounded-md", dndRowCls(state(i)))}>
              <div className="pt-1.5">
                <DragGrip {...handleProps(i)} />
              </div>
              <textarea
                value={b}
                rows={2}
                maxLength={LIMITS.bullet}
                onChange={(e) => set(i, e.target.value)}
                placeholder="Led a team of 5; shipped X, improving Y by Z%…"
                className={cn(compactInput, "flex-1 resize-y leading-relaxed")}
              />
              <div className="pt-1.5">
                <RemoveBtn onClick={() => remove(i)} label="Remove bullet" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExperienceEditor({
  index,
  exp,
  onPatch,
  onRemove,
  dnd,
}: {
  index: number;
  exp: ResumeExperience;
  onPatch: (p: Partial<ResumeExperience>) => void;
  onRemove: () => void;
  dnd: RowDnd;
}) {
  return (
    <div {...dnd.rowProps} className={cn("rounded-[var(--radius)] border border-line bg-paper-2 p-4", dndRowCls(dnd.state))}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Experience {index + 1}</span>
        <div className="flex items-center gap-1">
          <DragGrip {...dnd.handleProps} />
          <RemoveBtn onClick={onRemove} label="Remove this role" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="Title" value={exp.title} onChange={(v) => onPatch({ title: v })} />
        <LabeledInput label="Company" value={exp.company} onChange={(v) => onPatch({ company: v })} />
        <LabeledInput label="Location" value={exp.location} onChange={(v) => onPatch({ location: v })} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Start" type="month" value={exp.startDate} onChange={(v) => onPatch({ startDate: v })} />
          <LabeledInput label="End" type="month" value={exp.endDate} onChange={(v) => onPatch({ endDate: v })} />
        </div>
      </div>
      <label className="mt-3 flex w-fit items-center gap-2 text-[12.5px] text-ink-soft">
        <input type="checkbox" checked={exp.current} onChange={(e) => onPatch({ current: e.target.checked })} className="accent-[var(--color-accent)]" /> Current role
      </label>
      <div className="mt-3">
        <BulletList label="Highlights" bullets={exp.bullets} onChange={(next) => onPatch({ bullets: next })} />
      </div>
    </div>
  );
}

function ProjectEditor({
  index,
  proj,
  onPatch,
  onRemove,
  dnd,
}: {
  index: number;
  proj: ResumeProject;
  onPatch: (p: Partial<ResumeProject>) => void;
  onRemove: () => void;
  dnd: RowDnd;
}) {
  return (
    <div {...dnd.rowProps} className={cn("rounded-[var(--radius)] border border-line bg-paper-2 p-4", dndRowCls(dnd.state))}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Project {index + 1}</span>
        <div className="flex items-center gap-1">
          <DragGrip {...dnd.handleProps} />
          <RemoveBtn onClick={onRemove} label="Remove this project" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <LabeledInput label="Name" value={proj.name} onChange={(v) => onPatch({ name: v })} />
        <BulletList label="Details" bullets={proj.bullets} onChange={(next) => onPatch({ bullets: next })} />
      </div>
    </div>
  );
}

function EducationEditor({ index, edu, onPatch, onRemove, dnd }: { index: number; edu: ResumeEducation; onPatch: (p: Partial<ResumeEducation>) => void; onRemove: () => void; dnd: RowDnd }) {
  return (
    <div {...dnd.rowProps} className={cn("rounded-[var(--radius)] border border-line bg-paper-2 p-4", dndRowCls(dnd.state))}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Education {index + 1}</span>
        <div className="flex items-center gap-1">
          <DragGrip {...dnd.handleProps} />
          <RemoveBtn onClick={onRemove} label="Remove this education" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="School" value={edu.school} onChange={(v) => onPatch({ school: v })} />
        <DegreeSelect value={edu.degree} onChange={(v) => onPatch({ degree: v })} />
        <LabeledInput label="Field of study" value={edu.field} onChange={(v) => onPatch({ field: v })} />
        <LabeledInput label="Location" value={edu.location} onChange={(v) => onPatch({ location: v })} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Start" type="month" value={edu.startDate} onChange={(v) => onPatch({ startDate: v })} />
          <LabeledInput label="End" type="month" value={edu.endDate} onChange={(v) => onPatch({ endDate: v })} />
        </div>
        <GpaField value={edu.gpa} onChange={(v) => onPatch({ gpa: v })} />
      </div>
    </div>
  );
}

/** An existing saved resume reopened for editing (label + parsed structure; the stored
 *  file is untouched). The parent remounts ResumeUpload with a fresh key per edit so this
 *  seeds the initial state — no setState-in-effect. */
export type EditTarget = { id: number; label: string; structured: StructuredResume };

/**
 * Persistence + side effects are INJECTED so the same form works on web (Next route
 * handlers) and in the extension (TrackingProvider seam). The component owns all UX/flow;
 * services only do I/O. Web wiring lives in `useResumeUploadServices()`. (W1.2 — portability.)
 */
export type SaveInput =
  | { mode: "create"; file: File; label: string; parsedJson: string }
  | { mode: "edit"; id: number; label: string; parsedJson: string };
export type SaveResult =
  | { ok: true; id: number; label: string; warning?: string }
  | { ok: false; error: string };
export type ResumeToast = { variant?: "success" | "error"; title: string; description?: string };

export type ResumeUploadServices = {
  /** Parse a dropped/seeded resume file into structure + contact (web: pdf.js/mammoth via
   *  resume-parse; extension: its own parser.js). Keeps the heavy parser out of the package. */
  parseFile: (file: File) => Promise<{ structured: StructuredResume; bio: ParsedBio }>;
  /** Create (upload) or edit (update) the resume; returns the saved id+label or an error. */
  onSave: (input: SaveInput) => Promise<SaveResult>;
  /** Optional: persist edited contact fields to the base profile. When omitted, the
   *  "Detected contact" panel is hidden (e.g. the extension has no in-app base profile). */
  onUpdateProfile?: (merged: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  /** Optional: mark the just-created resume as the user's default/base resume. When provided,
   *  a "Set as my default resume" checkbox is shown on CREATE; on save it's called with the new id.
   *  Omit it (e.g. the extension) to hide the checkbox entirely. */
  onSetDefault?: (id: number) => Promise<void> | void;
  /** Optional analytics hook (coarse event name only). */
  track?: (event: string) => void;
  /** Optional toast surface. */
  toast?: (t: ResumeToast) => void;
  /** Optional: called after a page-mode save to refresh server data (web: router.refresh). */
  onRefresh?: () => void;
};

export default function ResumeUpload({
  baseProfile = {},
  editTarget = null,
  initialFile = null,
  embedded = false,
  sectionsDefaultOpen = false,
  existingLabels = [],
  saveLabel,
  savedToast,
  backLabel,
  aiParse,
  onSaved,
  onClose,
  parseFile,
  onSave,
  onUpdateProfile,
  onSetDefault,
  track,
  toast,
  onRefresh,
}: {
  baseProfile?: BaseProfile;
  editTarget?: EditTarget | null;
  /** Embedded use (e.g. the Add-application dialog): seed the review from this file on mount. */
  initialFile?: File | null;
  /** Embedded mode: hide the drop-zone (seeded via initialFile) and report back via onSaved/onClose. */
  embedded?: boolean;
  /** Default state of the collapsible review sections. `false` (minimized) is the compact default
   *  used in the narrow extension drawer; the web app passes `true` so sections start expanded.
   *  The per-section chevrons + Expand/Collapse-all still work either way. */
  sectionsDefaultOpen?: boolean;
  /** Labels of the user's existing resumes. On CREATE, a case-insensitive name match triggers a
   *  one-time "save anyway?" confirmation (warn, never block). Empty ⇒ no dup check. */
  existingLabels?: string[];
  /** Override the primary (create) button copy — e.g. the extension's attach mode reads
   *  "Fill page & attach" instead of the default "Save to my account". */
  saveLabel?: string;
  /** Override the create-success toast copy (mode-aware), e.g. attach vs save. */
  savedToast?: ResumeToast;
  /** When set, the review header shows a left-aligned "‹ {backLabel}" button (calling onClose)
   *  instead of the corner ✕ — used when this view opens ON TOP of a host surface it returns to
   *  (e.g. the extension drawer's home). Web leaves it unset → the ✕ shows as before. */
  backLabel?: string;
  /** Optional AI-parsing opt-in rendered under the drop-zone (page mode). The HOST owns the
   *  choice (e.g. persisted in localStorage) and its `parseFile` impl honors it — this is
   *  just the visible consent control. Omit it (e.g. the extension, whose consent lives in
   *  Options) to hide the checkbox and keep the parsed-in-your-browser copy. */
  aiParse?: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string };
  /** Called after a successful CREATE with the new resume's id + label. */
  onSaved?: (resume: { id: number; label: string }) => void;
  /** Embedded mode: asked to close (review dismissed or save finished). */
  onClose?: () => void;
} & ResumeUploadServices) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  // null = creating from a freshly-parsed file; a number = editing that saved resume.
  const [editId, setEditId] = useState<number | null>(editTarget?.id ?? null);
  const [label, setLabel] = useState(editTarget?.label ?? "");
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false); // "Set as my default resume" (create only)
  // Duplicate-name confirmation (create only): first Save on a name that already exists arms this
  // warning; a second Save proceeds. Reset whenever the label changes.
  const [dupConfirm, setDupConfirm] = useState(false);
  const existingLabelSet = new Set(existingLabels.map((l) => l.trim().toLowerCase()));

  // Review mode is active when `struct` is set (the full-page editor). When editing, it's
  // seeded from the saved resume's parsed structure.
  const [struct, setStruct] = useState<StructuredResume | null>(editTarget ? normalizeStruct(editTarget.structured) : null);
  const [bio, setBio] = useState<ParsedBio>({});
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const editing = editId != null;

  // Collapsible review sections — all MINIMIZED by default (empty map ⇒ every section closed),
  // with an "Expand all / Collapse all" control. Lifted here so one control drives them all.
  const SECTION_IDS = ["contact", "summary", "skills", "experience", "projects", "education"] as const;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // A section follows `sectionsDefaultOpen` until the user explicitly toggles it (or uses
  // Expand/Collapse-all), at which point its own entry in the map wins.
  const isOpen = (id: string) => openSections[id] ?? sectionsDefaultOpen;
  const toggleSection = (id: string) => setOpenSections((m) => ({ ...m, [id]: !m[id] }));
  const setAllSections = (open: boolean) => setOpenSections(Object.fromEntries(SECTION_IDS.map((id) => [id, open])));

  const baseSkills = Array.isArray(baseProfile.skills)
    ? (baseProfile.skills as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const baseSet = new Set(baseSkills.map((s) => s.toLowerCase()));

  async function handleFile(picked: File) {
    setFile(picked);
    setEditId(null); // a freshly-dropped file is always a new resume, never an edit
    setLabel(labelFromName(picked.name));
    setParsing(true);
    setError(null);
    setSaveError(null);
    try {
      const parsed = await parseFile(picked);
      setBio(parsed.bio);
      setStruct(normalizeStruct(parsed.structured));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setParsing(false);
    }
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) void handleFile(picked);
    e.target.value = ""; // allow re-picking the same file
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const picked = e.dataTransfer.files?.[0];
    if (picked) void handleFile(picked);
  }

  function closeReview() {
    setStruct(null);
    setBio({});
    setFile(null);
    setEditId(null);
    setSaveError(null);
    setDupConfirm(false);
  }

  // Embedded: closing tears down the review AND tells the parent to unmount us.
  function handleClose() {
    closeReview();
    onClose?.();
  }

  // Embedded use: parse the handed-in file once on mount (skips the drop-zone step).
  const seededRef = useRef(false);
  useEffect(() => {
    if (initialFile && !seededRef.current) {
      seededRef.current = true;
      void handleFile(initialFile);
    }
  }, [initialFile]);

  // Esc closes the full-page review (and, when embedded, the host overlay).
  useEffect(() => {
    if (!struct && !(embedded && parsing)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [struct, embedded, parsing]);

  async function handleSave() {
    if (!struct) return;
    if (!editing && !file) return; // creating needs the dropped file
    // Duplicate-name guard (create only): warn once, then let a second Save proceed.
    if (!editing && file) {
      const finalLabel = (label.trim() || labelFromName(file.name)).toLowerCase();
      if (!dupConfirm && existingLabelSet.has(finalLabel)) {
        setDupConfirm(true);
        return;
      }
    }
    setSaving(true);
    setSaveError(null);
    try {
      // Drop blank bullet lines (the one-per-line boxes keep them while editing).
      const clean: StructuredResume = {
        ...struct,
        experience: struct.experience.map((e) => ({ ...e, bullets: e.bullets.map((b) => b.trim()).filter(Boolean) })),
        projects: struct.projects.map((p) => ({ ...p, bullets: p.bullets.map((b) => b.trim()).filter(Boolean) })),
      };
      const parsedJson = JSON.stringify(clean);

      if (editing) {
        // Editing a saved resume: update label + parsed structure only (file unchanged).
        if (editId == null) return; // narrowing for TS
        const result = await onSave({ mode: "edit", id: editId, label: label.trim() || "Resume", parsedJson });
        if (!result.ok) {
          setSaveError(result.error);
          return;
        }
        track?.("resume_edited");
        toast?.({ variant: "success", title: "Changes saved", description: "Your resume was updated." });
        closeReview();
        onRefresh?.();
        return;
      }

      if (!file) return; // narrowing for TS — guaranteed by the guard above
      const result = await onSave({ mode: "create", file, label: label.trim() || labelFromName(file.name), parsedJson });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      track?.("resume_saved");
      if (result.warning) {
        // Saved, but something partial (e.g. the PDF upload failed) — surface it instead of the
        // plain success so the user knows to follow up.
        toast?.({ variant: "error", title: "Resume added — with a warning", description: result.warning });
      } else {
        toast?.(savedToast ?? { variant: "success", title: `Saved “${result.label}”`, description: "Added to your account." });
      }
      // Opt-in: promote the just-created resume to the user's default (best-effort; it's saved regardless).
      if (setAsDefault && onSetDefault) {
        try {
          await onSetDefault(result.id);
        } catch {
          /* the resume was created; the default flag is a follow-up nicety */
        }
      }
      onSaved?.({ id: result.id, label: result.label });
      if (embedded) {
        // The host (e.g. Add-application dialog) owns the surrounding state; just close.
        handleClose();
      } else {
        closeReview();
        onRefresh?.();
      }
    } catch {
      setSaveError("Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  // "Update base profile" — enabled only when a detected contact value differs from the base.
  const baseDiffers = CONTACT_FIELDS.some((f) => {
    const detected = asStr(bio[f.key]).trim();
    return detected !== "" && detected !== asStr(baseProfile[f.key as string]).trim();
  });

  async function onUpdateBaseProfile() {
    if (!onUpdateProfile) return;
    setUpdatingProfile(true);
    try {
      const merged: BaseProfile = { ...baseProfile };
      for (const f of CONTACT_FIELDS) {
        const v = asStr(bio[f.key]).trim();
        if (v) merged[f.key as string] = v;
      }
      const result = await onUpdateProfile(merged);
      if (result.ok) {
        toast?.({ variant: "success", title: "Base profile updated", description: "Your profile now matches this contact info." });
        onRefresh?.();
      } else {
        toast?.({ variant: "error", title: result.error ?? "Couldn't update your profile." });
      }
    } catch {
      toast?.({ variant: "error", title: "Something went wrong updating your profile." });
    } finally {
      setUpdatingProfile(false);
    }
  }

  // Struct edit helpers.
  const setBioField = (k: keyof ParsedBio, v: string) => setBio((b) => ({ ...b, [k]: v }));
  const patchStruct = (p: Partial<StructuredResume>) => setStruct((s) => (s ? { ...s, ...p } : s));
  const patchExp = (i: number, p: Partial<ResumeExperience>) =>
    setStruct((s) => (s ? { ...s, experience: s.experience.map((e, idx) => (idx === i ? { ...e, ...p } : e)) } : s));
  const addExp = () =>
    setStruct((s) => (s ? { ...s, experience: [...s.experience, { company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [] }] } : s));
  const removeExp = (i: number) => setStruct((s) => (s ? { ...s, experience: s.experience.filter((_, idx) => idx !== i) } : s));
  const patchProj = (i: number, p: Partial<ResumeProject>) =>
    setStruct((s) => (s ? { ...s, projects: s.projects.map((e, idx) => (idx === i ? { ...e, ...p } : e)) } : s));
  const addProj = () => setStruct((s) => (s ? { ...s, projects: [...s.projects, { name: "", bullets: [] }] } : s));
  const removeProj = (i: number) => setStruct((s) => (s ? { ...s, projects: s.projects.filter((_, idx) => idx !== i) } : s));
  const patchEdu = (i: number, p: Partial<ResumeEducation>) =>
    setStruct((s) => (s ? { ...s, education: s.education.map((e, idx) => (idx === i ? { ...e, ...p } : e)) } : s));
  const addEdu = () =>
    setStruct((s) => (s ? { ...s, education: [...s.education, { school: "", degree: "", field: "", startDate: "", endDate: "", gpa: "", location: "" }] } : s));
  const removeEdu = (i: number) => setStruct((s) => (s ? { ...s, education: s.education.filter((_, idx) => idx !== i) } : s));

  // Drag-to-reorder for each section's entries (the empty-array fallbacks keep hook order
  // stable while `struct` is null; the setters no-op then anyway).
  const expReorder = useReorder(struct?.experience ?? [], (n) => patchStruct({ experience: n }));
  const projReorder = useReorder(struct?.projects ?? [], (n) => patchStruct({ projects: n }));
  const eduReorder = useReorder(struct?.education ?? [], (n) => patchStruct({ education: n }));
  const dndFor = (r: ReturnType<typeof useReorder>, i: number): RowDnd => ({ rowProps: r.rowProps(i), handleProps: r.handleProps(i), state: r.state(i) });

  const SaveBtn = (
    <button onClick={handleSave} disabled={saving} className={cn(buttonVariants("accent"), "whitespace-nowrap disabled:opacity-50")}>
      {saving ? "Saving…" : editing ? "Save changes" : dupConfirm ? "Save anyway" : (saveLabel ?? "Save to my account")}
    </button>
  );

  return (
    <>
      {/* Embedded (Add-application): no drop-zone — the file is seeded via initialFile. While it
          parses, show a light overlay; on parse error, let the user back out. */}
      {embedded && !struct && (
        <div role="dialog" aria-modal="true" aria-label="Reading resume" className="fixed inset-0 z-[150] grid place-items-center bg-[rgba(35,40,38,.45)] p-6">
          <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-line bg-paper p-6 text-center shadow-[var(--shadow-lg)]">
            {error ? (
              <>
                <p role="alert" className="text-sm font-medium text-danger">{error}</p>
                <button type="button" onClick={handleClose} className={cn(buttonVariants("ghost"), "mt-4")}>Close</button>
              </>
            ) : (
              <p className="text-sm text-muted">Reading your resume…</p>
            )}
          </div>
        </div>
      )}

      {/* Drop-zone (the page; the review opens as a full-page overlay on top) — page use only */}
      {!embedded && (
      <div className="flex flex-col gap-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-accent bg-accent-soft" : "border-line bg-paper hover:bg-paper-2",
          )}
        >
          <div className="text-3xl">📄</div>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">Drop a resume here</h3>
          <p className="mt-1 text-[13.5px] text-muted">
            or <span className="font-semibold text-accent-deep">browse</span> — PDF, DOCX, or TXT.
            {!aiParse?.checked && " Parsed right here in your browser."}
          </p>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain" onChange={onInput} className="hidden" />
        </div>
        {aiParse && (
          <label className="flex w-fit cursor-pointer items-start gap-2 text-[13px] text-ink-soft">
            <input
              type="checkbox"
              checked={aiParse.checked}
              onChange={(e) => aiParse.onChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
            />
            <span>
              {aiParse.label}
              {aiParse.description && <span className="block text-[12px] font-normal text-muted">{aiParse.description}</span>}
            </span>
          </label>
        )}
        {parsing && <p className="text-sm text-muted">Reading your resume…</p>}
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      )}

      {/* Full-page editable review */}
      {struct && (
        <div role="dialog" aria-modal="true" aria-label="Review resume" className="fixed inset-0 z-[150] overflow-y-auto bg-app-bg">
          <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
            <div className="mb-6">
              {backLabel && (
                <button
                  onClick={handleClose}
                  className="mb-3 -ml-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden>
                    <path d="M12.5 5L7.5 10l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {backLabel}
                </button>
              )}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-ink">{editing ? "Edit resume" : "Review & edit resume"}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {editing
                      ? "Edit the parsed details and save — your stored file stays the same."
                      : aiParse?.checked
                        ? "Edit anything before saving — parsed with AI; nothing is saved to your account until you save."
                        : "Edit anything before saving — parsed in your browser, nothing leaves until you save."}
                  </p>
                </div>
                {!backLabel && (
                  <button
                    onClick={handleClose}
                    aria-label="Close review"
                    title="Close (Esc)"
                    className="grid h-10 w-10 flex-none place-items-center rounded-full border border-line bg-paper text-lg text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-5 pb-6">
              {/* Resume name + Save (input & button share a row → aligned) */}
              <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
                <label htmlFor="resume-label" className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">Resume name</label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <Input
                    id="resume-label"
                    value={label}
                    maxLength={LIMITS.resumeLabel}
                    onChange={(e) => {
                      setLabel(e.target.value);
                      if (dupConfirm) setDupConfirm(false); // a rename clears the duplicate warning
                    }}
                    className="flex-1"
                  />
                  {SaveBtn}
                </div>
                {!editing && onSetDefault && (
                  <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-[13px] text-ink-soft">
                    <input
                      type="checkbox"
                      checked={setAsDefault}
                      onChange={(e) => setSetAsDefault(e.target.checked)}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
                    Set as my default resume
                  </label>
                )}
                {dupConfirm && !saveError && (
                  <p role="alert" className="mt-2 text-sm font-medium text-brown-deep">
                    You already have a resume named “{label.trim() || "Resume"}”. Save anyway, or rename it above.
                  </p>
                )}
                {saveError && (
                  <p role="alert" className="mt-2 text-sm font-medium text-danger">
                    {saveError}
                  </p>
                )}
              </div>

              {/* Expand all / Collapse all — drives every review section below at once. */}
              <div className="-mb-1 flex items-center justify-end gap-2 text-[12px] font-semibold text-ink-soft">
                <button type="button" onClick={() => setAllSections(true)} className="rounded-full px-2 py-1 transition-colors hover:bg-paper-2 hover:text-ink">Expand all</button>
                <span aria-hidden className="text-muted">·</span>
                <button type="button" onClick={() => setAllSections(false)} className="rounded-full px-2 py-1 transition-colors hover:bg-paper-2 hover:text-ink">Collapse all</button>
              </div>

              {/* Detected contact — collapsible, with a one-click base-profile update.
                  Only for a freshly-parsed file; a saved resume has no stored contact. Hidden
                  when no base-profile service is wired (e.g. the extension has no in-app bio). */}
              {!editing && onUpdateProfile && (
              <SectionCard
                title="Detected contact"
                open={isOpen("contact")}
                onToggle={() => toggleSection("contact")}
                action={
                  <button
                    type="button"
                    onClick={onUpdateBaseProfile}
                    disabled={!baseDiffers || updatingProfile}
                    title={baseDiffers ? "Update your base profile with this contact info" : "Your base profile already matches this contact"}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                      baseDiffers && !updatingProfile
                        ? "border-accent bg-accent-soft text-accent-deep hover:bg-[color-mix(in_srgb,var(--color-accent)_22%,var(--color-paper))]"
                        : "cursor-not-allowed border-line text-muted opacity-60",
                    )}
                  >
                    {updatingProfile ? "Updating…" : "Update base profile"}
                  </button>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {CONTACT_FIELDS.map((f) => (
                    <div key={f.key} className={cn(f.wide && "sm:col-span-2")}>
                      <LabeledInput label={f.label} value={asStr(bio[f.key])} onChange={(v) => setBioField(f.key, v)} />
                    </div>
                  ))}
                </div>
              </SectionCard>
              )}

              {/* Summary */}
              <SectionCard title="Summary" open={isOpen("summary")} onToggle={() => toggleSection("summary")}>
                <textarea value={struct.summary} rows={4} maxLength={LIMITS.summary} onChange={(e) => patchStruct({ summary: e.target.value })} placeholder="No summary detected — add one if you like." className={cn(compactInput, "resize-y")} />
              </SectionCard>

              {/* Skills (editable + base-overlap coloring) */}
              <SectionCard title={`Skills (${struct.skills.length})`} open={isOpen("skills")} onToggle={() => toggleSection("skills")}>
                <SkillChips skills={struct.skills} baseSet={baseSet} onChange={(next) => patchStruct({ skills: next })} />
                <SkillLegend />
              </SectionCard>

              {/* Experience — full entries with editable bullets */}
              <SectionCard title={`Experience (${struct.experience.length})`} open={isOpen("experience")} onToggle={() => toggleSection("experience")} action={<AddBtn onClick={addExp} label="Add role" />}>
                <div className="flex flex-col gap-4">
                  {struct.experience.map((exp, i) => (
                    <ExperienceEditor
                      key={i}
                      index={i}
                      exp={exp}
                      onPatch={(p) => patchExp(i, p)}
                      onRemove={() => removeExp(i)}
                      dnd={dndFor(expReorder, i)}
                    />
                  ))}
                  {struct.experience.length === 0 && <p className="text-[13px] text-muted">No experience detected — add a role.</p>}
                </div>
              </SectionCard>

              {/* Projects */}
              <SectionCard title={`Projects (${struct.projects.length})`} open={isOpen("projects")} onToggle={() => toggleSection("projects")} action={<AddBtn onClick={addProj} label="Add project" />}>
                <div className="flex flex-col gap-4">
                  {struct.projects.map((proj, i) => (
                    <ProjectEditor
                      key={i}
                      index={i}
                      proj={proj}
                      onPatch={(p) => patchProj(i, p)}
                      onRemove={() => removeProj(i)}
                      dnd={dndFor(projReorder, i)}
                    />
                  ))}
                  {struct.projects.length === 0 && <p className="text-[13px] text-muted">No projects detected — add one.</p>}
                </div>
              </SectionCard>

              {/* Education */}
              <SectionCard title={`Education (${struct.education.length})`} open={isOpen("education")} onToggle={() => toggleSection("education")} action={<AddBtn onClick={addEdu} label="Add education" />}>
                <div className="flex flex-col gap-4">
                  {struct.education.map((edu, i) => (
                    <EducationEditor
                      key={i}
                      index={i}
                      edu={edu}
                      onPatch={(p) => patchEdu(i, p)}
                      onRemove={() => removeEdu(i)}
                      dnd={dndFor(eduReorder, i)}
                    />
                  ))}
                  {struct.education.length === 0 && <p className="text-[13px] text-muted">No education detected — add one.</p>}
                </div>
              </SectionCard>

              <div className="flex justify-end gap-3">
                <button onClick={handleClose} className={buttonVariants("ghost")}>Cancel</button>
                {SaveBtn}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
