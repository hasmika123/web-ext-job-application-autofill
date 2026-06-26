"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Input, Field, Select } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isEmail, isUrl } from "@/lib/validate";
import { parseResume } from "@/lib/resume-parse";

/** The bio object stored as the server's opaque `payload` JSON (extension-canonical). */
export type Bio = Record<string, unknown>;

// Option lists mirror the extension's options.js exactly so both surfaces write
// identical values (the dossier "no guessing" rule — these are the real keys/values).
const YESNO = ["Yes", "No"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
const RACES = [
  "American Indian or Alaska Native", "Asian", "Black or African American",
  "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "White",
  "Two or More Races", "Prefer not to say",
];
const VETERAN = [
  "I am not a protected veteran",
  "I identify as one or more classifications of a protected veteran",
  "Prefer not to say",
];
const DISABILITY = [
  "Yes, I have a disability (or previously had one)",
  "No, I do not have a disability",
  "Prefer not to answer",
];

type FieldDef = {
  key: string;
  label: string;
  kind?: "text" | "email" | "tel" | "url" | "select";
  options?: string[];
  wide?: boolean;
  required?: boolean;
};

const SECTIONS: { id: string; title: string; fields: FieldDef[] }[] = [
  {
    id: "identity",
    title: "Identity & contact",
    fields: [
      { key: "firstName", label: "First name", required: true },
      { key: "lastName", label: "Last name", required: true },
      { key: "preferredName", label: "Preferred name" },
      { key: "email", label: "Email", kind: "email", required: true },
      { key: "phone", label: "Phone", kind: "tel" },
    ],
  },
  {
    id: "location",
    title: "Location",
    fields: [
      { key: "addressLine1", label: "Address", wide: true },
      { key: "addressLine2", label: "Address line 2", wide: true },
      { key: "city", label: "City" },
      { key: "state", label: "State / Province" },
      { key: "postalCode", label: "Postal code" },
      { key: "country", label: "Country" },
    ],
  },
  {
    id: "links",
    title: "Links",
    fields: [
      { key: "linkedin", label: "LinkedIn URL", kind: "url", wide: true },
      { key: "github", label: "GitHub URL", kind: "url", wide: true },
      { key: "website", label: "Website / Portfolio", kind: "url", wide: true },
    ],
  },
  {
    id: "work",
    title: "Work authorization",
    fields: [
      { key: "authorizedToWork", label: "Authorized to work?", kind: "select", options: YESNO },
      { key: "requireSponsorship", label: "Need sponsorship?", kind: "select", options: YESNO },
    ],
  },
];

const EEO_FIELDS: FieldDef[] = [
  { key: "gender", label: "Gender", kind: "select", options: GENDERS },
  { key: "ethnicity", label: "Hispanic / Latino?", kind: "select", options: ["Yes", "No", "Prefer not to say"] },
  { key: "race", label: "Race", kind: "select", options: RACES },
  { key: "veteranStatus", label: "Veteran status", kind: "select", options: VETERAN },
  { key: "disabilityStatus", label: "Disability status", kind: "select", options: DISABILITY },
];

const STRING_KEYS = new Set(
  [...SECTIONS.flatMap((s) => s.fields), ...EEO_FIELDS].map((f) => f.key),
);

// Fields that count toward the profile-strength meter (the activation driver).
const STRENGTH_KEYS = ["firstName", "lastName", "email", "phone", "city", "country", "linkedin", "authorizedToWork"];

const NAV = [
  { id: "identity", label: "Identity & contact" },
  { id: "location", label: "Location" },
  { id: "links", label: "Links" },
  { id: "work", label: "Work authorization" },
  { id: "eeo", label: "EEO / demographics" },
  { id: "skills", label: "Skills" },
];

/** Bio keys safely populated from a parsed resume (mirrors ParsedBio). */
const RESUME_FILL_KEYS = ["firstName", "lastName", "email", "phone", "linkedin", "github", "website", "city", "state"];

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function inputType(kind?: FieldDef["kind"]): string {
  return kind === "email" || kind === "tel" || kind === "url" ? kind : "text";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3.5 mt-1 flex items-center gap-2.5 font-display text-lg font-semibold text-ink after:h-px after:flex-1 after:bg-line after:content-['']">
      {children}
    </h2>
  );
}

/** Spinning loader for the "Saving…" state. */
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] animate-spin text-muted" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Green check for the "All changes saved" state. */
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] text-accent-deep" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function BioEditor({ initialBio }: { initialBio: Bio }) {
  const router = useRouter();

  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const key of STRING_KEYS) seed[key] = asString(initialBio[key]);
    return seed;
  });
  const [skills, setSkills] = useState<string[]>(() => {
    const s = initialBio.skills;
    return Array.isArray(s) ? s.filter((x): x is string => typeof x === "string") : [];
  });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState("identity");
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (k: string) => setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));

  // Resume → autofill (parsed in-browser; fills empty fields, keeps your entries).
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const [parseErr, setParseErr] = useState(false);

  async function onResumePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setParsing(true);
    setParseMsg(null);
    setParseErr(false);
    try {
      const { bio, structured } = await parseResume(file);
      setValues((prev) => {
        const next = { ...prev };
        for (const k of RESUME_FILL_KEYS) {
          const v = (bio as Record<string, unknown>)[k];
          if (typeof v === "string" && v.trim() && !(next[k] ?? "").trim()) next[k] = v.trim();
        }
        return next;
      });
      if (Array.isArray(structured.skills) && structured.skills.length) {
        setSkills((prev) => {
          const next = [...prev];
          for (const s of structured.skills) {
            if (s && !next.some((x) => x.toLowerCase() === s.toLowerCase())) next.push(s);
          }
          return next;
        });
      }
      setDirty(true);
      setParseMsg(`Imported details from ${file.name} — empty fields were filled and your existing entries kept. Review below.`);
    } catch (err) {
      setParseErr(true);
      setParseMsg(err instanceof Error ? err.message : "Couldn't read that resume.");
    } finally {
      setParsing(false);
    }
  }

  const setField = useCallback((key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  }, []);

  const updateSkills = useCallback((next: string[]) => {
    setSkills(next);
    setDirty(true);
  }, []);

  const commit = useCallback(
    async (vals: Record<string, string>, sk: string[]) => {
      setSaving(true);
      setError(null);
      try {
        // Merge edits over the original so unmanaged fields survive; drop empties.
        const merged: Bio = { ...initialBio };
        for (const key of STRING_KEYS) {
          const val = (vals[key] ?? "").trim();
          if (val) merged[key] = val;
          else delete merged[key];
        }
        if (sk.length) merged.skills = sk;
        else delete merged.skills;

        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ payload: JSON.stringify(merged) }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Couldn't save your profile.");
          return;
        }
        setDirty(false);
        setSavedOnce(true);
        router.refresh();
      } catch {
        setError("Something went wrong while saving.");
      } finally {
        setSaving(false);
      }
    },
    [initialBio, router],
  );

  // Autosave: debounce 1.5s after the last edit.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void commit(values, skills), 1500);
    return () => clearTimeout(t);
  }, [values, skills, dirty, commit]);

  // Scroll-spy for the section sub-nav.
  useEffect(() => {
    const els = NAV.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.5, 1] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const filled = STRENGTH_KEYS.filter((k) => (values[k] ?? "").trim()).length + (skills.length ? 1 : 0);
  const strength = Math.round((filled / (STRENGTH_KEYS.length + 1)) * 100);

  function renderField(f: FieldDef) {
    const id = `bio-${f.key}`;
    const val = values[f.key] ?? "";
    const trimmed = val.trim();
    // Validation shown after blur — advisory only, autosave is never blocked.
    let err: string | undefined;
    if (touched.has(f.key)) {
      if (f.required && !trimmed) err = `${f.label} is required`;
      else if (trimmed && f.kind === "email" && !isEmail(val)) err = "Enter a valid email address";
      else if (trimmed && f.kind === "url" && !isUrl(val)) err = "Enter a valid URL";
    }
    const label = f.required ? (
      <>
        {f.label} <span className="text-danger" aria-hidden>*</span>
      </>
    ) : (
      f.label
    );
    return (
      <Field key={f.key} label={label} htmlFor={id} error={err} className={cn("mb-0", f.wide && "sm:col-span-2")}>
        {f.kind === "select" ? (
          <Select id={id} value={val} onChange={(e) => setField(f.key, e.target.value)} onBlur={() => touch(f.key)}>
            <option value="">—</option>
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        ) : (
          <Input
            id={id}
            type={inputType(f.kind)}
            value={val}
            onChange={(e) => setField(f.key, e.target.value)}
            onBlur={() => touch(f.key)}
            aria-invalid={!!err}
            aria-required={f.required || undefined}
          />
        )}
      </Field>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[210px_1fr]">
      {/* Section sub-nav (sticky on desktop; horizontal scroll on mobile) */}
      <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible">
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            aria-current={activeId === n.id ? "true" : undefined}
            className={cn(
              "whitespace-nowrap rounded-[var(--radius)] px-3 py-2 text-[13.5px] font-medium",
              activeId === n.id ? "bg-accent-soft font-semibold text-accent-deep" : "text-ink-soft hover:bg-paper-2",
            )}
          >
            {n.label}
          </a>
        ))}
      </nav>

      <div>
        {/* Autofill from a resume — parsed in the browser, fills empty fields only */}
        <div className="mb-5 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-4 shadow-[var(--shadow)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-ink">Autofill from your resume</div>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Upload a PDF, DOCX, or TXT — parsed in your browser to fill empty fields. Your existing entries are kept.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className={cn(buttonVariants("ghost"), "flex-none gap-2 disabled:opacity-60")}
          >
            {parsing ? (
              <>
                <Spinner /> Reading…
              </>
            ) : (
              "Upload resume"
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,text/plain"
            onChange={onResumePicked}
            className="hidden"
          />
        </div>
        {parseMsg && (
          <p className={cn("mb-4 text-[12.5px]", parseErr ? "font-medium text-danger" : "text-accent-deep")} role={parseErr ? "alert" : undefined}>
            {parseMsg}
          </p>
        )}

        {/* Profile-strength meter */}
        <div className="mb-5 rounded-[var(--radius-lg)] border border-line bg-paper p-4 shadow-[var(--shadow)]">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">Profile strength</span>
            <span className="font-semibold text-accent-deep">{strength}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${strength}%` }} />
          </div>
          <p className="mt-2 text-[12.5px] text-muted">A complete profile fills more fields automatically.</p>
        </div>

        <p className="mb-4 text-[12px] text-muted">
          <span className="text-danger">*</span> Required field
        </p>

        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mb-7 scroll-mt-6">
            <SectionTitle>{section.title}</SectionTitle>
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{section.fields.map(renderField)}</div>
          </section>
        ))}

        {/* EEO / demographics — its own section with fields always visible, before Skills */}
        <section id="eeo" className="mb-7 scroll-mt-6">
          <SectionTitle>
            EEO / demographics
            <span className="font-body text-xs font-normal text-muted">— optional, used only when you choose</span>
          </SectionTitle>
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{EEO_FIELDS.map(renderField)}</div>
        </section>

        {/* Skills */}
        <section id="skills" className="mb-7 scroll-mt-6">
          <SectionTitle>
            Skills
            <span className="font-body text-xs font-normal text-muted">— editable, synced to your profile</span>
          </SectionTitle>
          <SkillsEditor skills={skills} onChange={updateSkills} />
        </section>

        {/* Sticky save bar */}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-line py-3.5 backdrop-blur-[6px]"
          style={{ background: "color-mix(in srgb, var(--app-bg) 90%, transparent)" }}
        >
          <div className="mr-auto flex items-center gap-1.5 text-[12.5px] text-muted">
            {saving ? (
              <>
                <Spinner />
                <span>Saving…</span>
              </>
            ) : dirty ? (
              <span>Unsaved changes</span>
            ) : savedOnce ? (
              <>
                <CheckIcon />
                <span className="font-medium text-accent-deep">All changes saved</span>
              </>
            ) : (
              <span>Autosaves as you type</span>
            )}
          </div>
          {error && <span role="alert" className="text-sm font-medium text-danger">{error}</span>}
          <button
            type="button"
            onClick={() => void commit(values, skills)}
            disabled={saving || (!dirty && savedOnce)}
            className={cn(buttonVariants("accent"), "disabled:opacity-50")}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillsEditor({ skills, onChange }: { skills: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...skills];
    for (const p of parts) {
      if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-line bg-paper p-2.5">
      {skills.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold text-accent-deep">
          {s}
          <button
            type="button"
            onClick={() => onChange(skills.filter((x) => x !== s))}
            className="opacity-60 hover:opacity-100"
            aria-label={`Remove ${s}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && skills.length) {
            onChange(skills.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={skills.length ? "Add a skill…" : "e.g. Python, Product strategy"}
        className="min-w-[140px] flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}
