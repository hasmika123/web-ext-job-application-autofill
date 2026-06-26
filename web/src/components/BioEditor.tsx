"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Field, Select } from "@/components/ui";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

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
};

const SECTIONS: { id: string; title: string; fields: FieldDef[] }[] = [
  {
    id: "identity",
    title: "Identity & contact",
    fields: [
      { key: "firstName", label: "First name" },
      { key: "lastName", label: "Last name" },
      { key: "preferredName", label: "Preferred name" },
      { key: "email", label: "Email", kind: "email" },
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
  { id: "skills", label: "Skills" },
  { id: "eeo", label: "EEO / demographics" },
];

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

  const status = saving ? "Saving…" : dirty ? "Unsaved changes" : savedOnce ? "All changes saved" : "Autosaves as you type";

  function renderField(f: FieldDef) {
    const id = `bio-${f.key}`;
    return (
      <Field key={f.key} label={f.label} htmlFor={id} className={cn("mb-0", f.wide && "sm:col-span-2")}>
        {f.kind === "select" ? (
          <Select id={id} value={values[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)}>
            <option value="">—</option>
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        ) : (
          <Input
            id={id}
            type={inputType(f.kind)}
            value={values[f.key] ?? ""}
            onChange={(e) => setField(f.key, e.target.value)}
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

        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mb-7 scroll-mt-6">
            <SectionTitle>{section.title}</SectionTitle>
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{section.fields.map(renderField)}</div>
          </section>
        ))}

        {/* Skills */}
        <section id="skills" className="mb-7 scroll-mt-6">
          <SectionTitle>
            Skills
            <span className="font-body text-xs font-normal text-muted">— editable, synced to your profile</span>
          </SectionTitle>
          <SkillsEditor skills={skills} onChange={updateSkills} />
        </section>

        {/* EEO (opt-in collapsible) */}
        <section id="eeo" className="mb-7 scroll-mt-6">
          <details className="rounded-[var(--radius-lg)] border border-line bg-paper px-4 open:pb-4">
            <summary className="cursor-pointer list-none py-3.5 text-sm font-semibold text-ink-soft">
              EEO / demographics
              <span className="ml-2 font-normal text-muted">— optional, used only when you choose</span>
            </summary>
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{EEO_FIELDS.map(renderField)}</div>
          </details>
        </section>

        {/* Sticky save bar */}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-line py-3.5 backdrop-blur-[6px]"
          style={{ background: "color-mix(in srgb, var(--app-bg) 90%, transparent)" }}
        >
          <span className="mr-auto text-[12.5px] text-muted">{status}</span>
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
