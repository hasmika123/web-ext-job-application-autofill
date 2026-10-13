"use client";

import { useEffect, useRef, useState } from "react";
import { ChipInput, Field, Input, Select, Textarea } from "@kiwiply/ui";
import { EMPLOYMENT_LABEL, EXPERIENCE_LABEL, WORK_MODE_LABEL, type Contact, type JobDetail, type PatchBody } from "@/lib/ent/jobs";
import type { SaveResult } from "./useJobDetail";

export const SKILLS_AUTOSAVE_MS = 700; // config-literal-ok: how long skill chips rest before they are saved (UI timing)

const opts = (labels: Record<string, string>, none: string) => [{ value: "", label: none }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))];

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * The drawer's edit form: every control saves by itself (a select the moment it changes, a text box when it loses focus or Enter is
 * pressed, the skill chips after a short rest). There is no Save button. The line under the title says what the last save did, in words.
 * Drafts live here and are never overwritten by the server's answer while a person types; they are reset only when another job opens.
 */
export default function EditForm({ detail, contacts, save }: { detail: JobDetail; contacts: Contact[]; save: (b: PatchBody) => Promise<SaveResult> }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [title, setTitle] = useState(detail.title);
  const [location, setLocation] = useState(detail.location ?? "");
  const [duration, setDuration] = useState(detail.durationLabel ?? "");
  const [rateMin, setRateMin] = useState(detail.rate?.min?.toString() ?? "");
  const [rateMax, setRateMax] = useState(detail.rate?.max?.toString() ?? "");
  const [rateUnit, setRateUnit] = useState(detail.rate?.unit ?? "");
  const [positions, setPositions] = useState(String(detail.positions));
  const [filled, setFilled] = useState(String(detail.filled));
  const [description, setDescription] = useState(detail.description ?? "");
  const [skills, setSkills] = useState(detail.skills);
  const skillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(detail);
  useEffect(() => {
    saved.current = detail;
  }, [detail]);
  useEffect(() => () => void (skillTimer.current && clearTimeout(skillTimer.current)), []);

  async function commit(body: PatchBody, revert?: () => void) {
    setStatus({ kind: "saving" });
    const r = await save(body);
    if (r.ok) setStatus({ kind: "saved" });
    else {
      setStatus({ kind: "error", message: r.error });
      revert?.();
    }
  }

  const textCommit = (field: "title" | "location" | "durationLabel" | "description", value: string, current: string | null, revert: () => void) => {
    const next = value.trim();
    if (next === (current ?? "")) return;
    if (field === "title" && next.length < 2) {
      setStatus({ kind: "error", message: "A title needs at least 2 characters." });
      revert();
      return;
    }
    void commit({ [field]: field === "title" ? next : next === "" ? null : next } as PatchBody, revert);
  };

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  function commitRate(nextMin = rateMin, nextMax = rateMax, nextUnit = rateUnit) {
    const toNum = (s: string) => (s.trim() === "" ? null : Number(s));
    const min = toNum(nextMin);
    const max = toNum(nextMax);
    const cur = detail.rate;
    if (min === (cur?.min ?? null) && max === (cur?.max ?? null) && (nextUnit || null) === (cur?.unit ?? null)) return;
    if ((min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max < 0))) {
      setStatus({ kind: "error", message: "Compensation is a whole number, such as 120." });
      return;
    }
    if (min !== null && max !== null && min > max) {
      setStatus({ kind: "error", message: "The top of the range can't be below the bottom." });
      return;
    }
    if ((min !== null || max !== null) && !nextUnit) {
      setStatus({ kind: "error", message: "Choose per hour or per year." });
      return;
    }
    void commit({ rateMin: min, rateMax: max, rateUnit: (nextUnit || null) as "HOUR" | "YEAR" | null });
  }

  function commitCount(field: "positions" | "filled", value: string, revert: () => void) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < (field === "positions" ? 1 : 0) || n > 500) {
      setStatus({ kind: "error", message: field === "positions" ? "Positions is a whole number from 1 to 500." : "Filled is a whole number, no more than the positions." });
      revert();
      return;
    }
    if (n === detail[field]) return;
    void commit({ [field]: n } as PatchBody, revert);
  }

  return (
    <div className="space-y-3.5" data-edit-form>
      <p aria-live="polite" data-save-status className={`min-h-5 text-[12.5px] ${status.kind === "error" ? "text-danger-text" : "text-muted"}`}>
        {status.kind === "saving" && "Saving..."}
        {status.kind === "saved" && "Saved"}
        {status.kind === "error" && status.message}
        {status.kind === "idle" && "Changes save by themselves."}
      </p>
      <Field label="Job title">
        <Input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} onBlur={() => textCommit("title", title, detail.title, () => setTitle(detail.title))} onKeyDown={onEnter} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Location">
          <Input value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} onBlur={() => textCommit("location", location, detail.location, () => setLocation(detail.location ?? ""))} onKeyDown={onEnter} />
        </Field>
        <Field label="Work mode">
          <Select value={detail.workMode ?? ""} onChange={(v) => void commit({ workMode: (v || null) as JobDetail["workMode"] })} options={opts(WORK_MODE_LABEL, "Not set")} />
        </Field>
        <Field label="Job type">
          <Select value={detail.employment ?? ""} onChange={(v) => void commit({ employment: (v || null) as JobDetail["employment"] })} options={opts(EMPLOYMENT_LABEL, "Not set")} />
        </Field>
        <Field label="Experience level">
          <Select value={detail.experienceLevel ?? ""} onChange={(v) => void commit({ experienceLevel: (v || null) as JobDetail["experienceLevel"] })} options={opts(EXPERIENCE_LABEL, "Not set")} />
        </Field>
        <Field label="Duration">
          <Input value={duration} maxLength={40} placeholder="6 months" onChange={(e) => setDuration(e.target.value)} onBlur={() => textCommit("durationLabel", duration, detail.durationLabel, () => setDuration(detail.durationLabel ?? ""))} onKeyDown={onEnter} />
        </Field>
        <Field label="Client contact">
          <Select
            value={detail.contact ? String(detail.contact.id) : ""}
            onChange={(v) => void commit({ contactId: v ? Number(v) : null })}
            options={[{ value: "", label: "No contact" }, ...contacts.map((c) => ({ value: String(c.id), label: c.name }))]}
          />
        </Field>
      </div>
      <fieldset className="grid grid-cols-[1fr_1fr_1fr] gap-3">
        <legend className="mb-1 text-[12.5px] font-semibold text-ink">Compensation (whole dollars)</legend>
        <Input aria-label="Minimum" inputMode="numeric" placeholder="Min" value={rateMin} onChange={(e) => setRateMin(e.target.value)} onBlur={() => commitRate()} onKeyDown={onEnter} />
        <Input aria-label="Maximum" inputMode="numeric" placeholder="Max" value={rateMax} onChange={(e) => setRateMax(e.target.value)} onBlur={() => commitRate()} onKeyDown={onEnter} />
        <Select
          aria-label="Per"
          value={rateUnit}
          onChange={(v) => {
            setRateUnit(v as "HOUR" | "YEAR" | "");
            commitRate(rateMin, rateMax, v);
          }}
          options={[{ value: "", label: "Per" }, { value: "HOUR", label: "per hour" }, { value: "YEAR", label: "per year" }]}
        />
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Positions">
          <Input inputMode="numeric" value={positions} onChange={(e) => setPositions(e.target.value)} onBlur={() => commitCount("positions", positions, () => setPositions(String(detail.positions)))} onKeyDown={onEnter} />
        </Field>
        <Field label="Filled">
          <Input inputMode="numeric" value={filled} onChange={(e) => setFilled(e.target.value)} onBlur={() => commitCount("filled", filled, () => setFilled(String(detail.filled)))} onKeyDown={onEnter} />
        </Field>
      </div>
      <ChipInput
        label="Skills"
        value={skills}
        maxChips={15}
        maxChipLength={60}
        placeholder="Add a skill and press Enter"
        onChange={(next) => {
          setSkills(next);
          if (skillTimer.current) clearTimeout(skillTimer.current);
          skillTimer.current = setTimeout(() => void commit({ skills: next }, () => setSkills(saved.current.skills)), SKILLS_AUTOSAVE_MS);
        }}
      />
      <Field label="Description" hint="Never put identity numbers, bank details or birth dates here: we don't store them.">
        <Textarea
          rows={6}
          value={description}
          maxLength={4000}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => textCommit("description", description, detail.description, () => setDescription(detail.description ?? ""))}
        />
      </Field>
    </div>
  );
}
