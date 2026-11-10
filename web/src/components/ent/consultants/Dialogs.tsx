"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the dialogs reset their fields when they open (the pattern of the other admin pages) */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, ChipInput, Field, Input, Select, SheetFrame } from "@kiwiply/ui";
import { matchScoreText } from "@/lib/ent/jobs";
import {
  AVAILABILITY_OPTIONS,
  LICENSE_OPTIONS,
  WORK_MODE_OPTIONS,
  type Availability,
  type ConsultantDetail,
  type CreateBody,
  type GroupRef,
  type JobOption,
  type LinkableMember,
  type LicenseStatus,
  type MarketerOption,
  type PatchBody,
} from "@/lib/ent/consultants";

export type Outcome = { ok: true } | { ok: false; error: string };

/** The shared frame of every dialog: a sheet with a form, an inline error, Cancel and one primary button. */
export function Frame({
  id,
  open,
  onClose,
  title,
  hint,
  applyLabel,
  canApply,
  onApply,
  children,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string;
  applyLabel: string;
  canApply: boolean;
  onApply: () => Promise<Outcome>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  async function go() {
    setBusy(true);
    setError(null);
    const out = await onApply();
    setBusy(false);
    if (out.ok) onClose();
    else setError(out.error);
  }
  return (
    <SheetFrame id={id} open={open} onClose={onClose} title={title}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canApply && !busy) void go();
        }}
      >
        {hint && <p className="text-[13.5px] text-ink-soft">{hint}</p>}
        {children}
        {error && (
          <p role="alert" data-dialog-error className="text-[12.5px] leading-snug text-danger-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canApply || busy}>
            {busy ? "Working…" : applyLabel}
          </Button>
        </div>
      </form>
    </SheetFrame>
  );
}

const NONE = "__none";

/* ── Add Consultant ─────────────────────────────────────────────────────────────── */

export function AddConsultantDialog({ open, onClose, departments, linkable = [], onCreate }: { open: boolean; onClose: () => void; departments: GroupRef[]; linkable?: LinkableMember[]; onCreate: (body: CreateBody) => Promise<Outcome> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [years, setYears] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [dept, setDept] = useState(NONE);
  const [person, setPerson] = useState(NONE);
  useEffect(() => {
    if (open) {
      setPerson(NONE);
      setName("");
      setEmail("");
      setTitle("");
      setYears("");
      setLocation("");
      setMode("");
      setSkills([]);
      setDept(NONE);
    }
  }, [open]);
  const yearsNum = years.trim() === "" ? undefined : Number(years);
  const yearsOk = yearsNum === undefined || (Number.isInteger(yearsNum) && yearsNum >= 0 && yearsNum <= 60);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canApply = name.trim().length >= 2 && emailOk && yearsOk;
  return (
    <Frame
      id="ent-consultant-add"
      open={open}
      onClose={onClose}
      title="Add consultant"
      hint="They start as Available with a pending license. You can change everything from their drawer."
      applyLabel="Add consultant"
      canApply={canApply}
      onApply={() =>
        onCreate({
          displayName: name.trim(),
          email: email.trim(),
          jobTitle: title.trim() || undefined,
          yearsExperience: yearsNum,
          locationLabel: location.trim() || undefined,
          workMode: mode || undefined,
          skills: skills.length > 0 ? skills : undefined,
          departmentGroupId: dept === NONE ? undefined : Number(dept),
          memberId: person === NONE ? undefined : Number(person),
        })
      }
    >
      {linkable.length > 0 && (
        <Field label="Existing person" hint="Pick someone who already has the Consultant role so their sign-in opens the consultant workspace. Leave it empty to add a record only; a person with the same email is linked for you.">
          <Select
            aria-label="Existing person"
            value={person}
            onChange={(v) => {
              setPerson(v);
              const m = linkable.find((x) => String(x.memberId) === v);
              if (m) {
                setName(m.name);
                if (m.email) setEmail(m.email);
              }
            }}
            options={[{ value: NONE, label: "Not a member yet" }, ...linkable.map((m) => ({ value: String(m.memberId), label: m.email ? `${m.name} (${m.email})` : m.name }))]}
          />
        </Field>
      )}
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" autoFocus />
      </Field>
      <Field label="Work email" hint={email.trim() !== "" && !emailOk ? "Enter a valid email address." : undefined}>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Job title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Years of experience" hint={!yearsOk ? "A whole number from 0 to 60." : undefined}>
          <Input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/[^\d]/g, ""))} maxLength={2} />
        </Field>
        <Field label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="City, State" />
        </Field>
        <Field label="Work mode">
          <Select aria-label="Work mode" value={mode} onChange={setMode} options={[{ value: "", label: "Not set" }, ...WORK_MODE_OPTIONS]} />
        </Field>
      </div>
      <Field label="Skills" hint="The first two become the chips in the directory.">
        <ChipInput value={skills} onChange={setSkills} label="Skills" placeholder="Add a skill and press Enter" maxChips={12} />
      </Field>
      {departments.length > 0 && (
        <Field label="Department">
          <Select aria-label="Department" value={dept} onChange={setDept} options={[{ value: NONE, label: "No department" }, ...departments.map((g) => ({ value: String(g.id), label: g.name }))]} />
        </Field>
      )}
    </Frame>
  );
}

/* ── Assign Marketer (single and bulk) ──────────────────────────────────────────── */

export function MarketerDialog({ open, onClose, subject, marketers, currentId, onApply }: { open: boolean; onClose: () => void; subject: string; marketers: MarketerOption[]; currentId?: number | null; onApply: (marketerMemberId: number) => Promise<Outcome> }) {
  const [pick, setPick] = useState("");
  useEffect(() => {
    if (open) setPick(currentId ? String(currentId) : "");
  }, [open, currentId]);
  const active = marketers.filter((m) => m.status === "ACTIVE");
  return (
    <Frame
      id="ent-consultant-marketer"
      open={open}
      onClose={onClose}
      title="Assign marketer"
      hint={`Choose who markets ${subject}. The workload shows how full each marketer is today.`}
      applyLabel="Assign"
      canApply={pick !== "" && Number(pick) !== currentId}
      onApply={() => onApply(Number(pick))}
    >
      {active.length === 0 ? (
        <p className="rounded-lg bg-paper-2 p-3 text-[13px] text-ink-soft">No marketers have capacity set up yet.</p>
      ) : (
        <Select
          aria-label="Marketer"
          value={pick}
          onChange={setPick}
          placeholder="Choose a marketer"
          options={active.map((m) => ({ value: String(m.memberId), label: `${m.name} · ${m.workload} / ${m.capacity}` }))}
        />
      )}
    </Frame>
  );
}

/* ── Manage License ─────────────────────────────────────────────────────────────── */

export function LicenseDialog({ open, onClose, detail, onApply }: { open: boolean; onClose: () => void; detail: ConsultantDetail | null; onApply: (body: PatchBody) => Promise<Outcome> }) {
  const [status, setStatus] = useState<LicenseStatus>("ACTIVE");
  const [until, setUntil] = useState("");
  useEffect(() => {
    if (open && detail) {
      setStatus(detail.consultant.license);
      setUntil(detail.consultant.licenseValidUntil ?? "");
    }
  }, [open, detail]);
  const changed = !!detail && (status !== detail.consultant.license || until !== (detail.consultant.licenseValidUntil ?? ""));
  return (
    <Frame
      id="ent-consultant-license"
      open={open}
      onClose={onClose}
      title="Manage license"
      hint="This records the license status. Billing for licenses lives on the Consultant Licenses page."
      applyLabel="Save"
      canApply={changed}
      onApply={() => onApply({ licenseStatus: status, licenseValidUntil: until === "" ? null : until })}
    >
      <Field label="License status">
        <Select aria-label="License status" value={status} onChange={(v) => setStatus(v as LicenseStatus)} options={LICENSE_OPTIONS} />
      </Field>
      <Field label="Valid until">
        <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
      </Field>
    </Frame>
  );
}

/* ── Add to Department ──────────────────────────────────────────────────────────── */

export function DepartmentDialog({ open, onClose, detail, departments, onApply }: { open: boolean; onClose: () => void; detail: ConsultantDetail | null; departments: GroupRef[]; onApply: (departmentGroupId: number | null) => Promise<Outcome> }) {
  const [pick, setPick] = useState(NONE);
  useEffect(() => {
    if (open && detail) setPick(detail.department ? String(detail.department.id) : NONE);
  }, [open, detail]);
  const current = detail?.department ? String(detail.department.id) : NONE;
  return (
    <Frame
      id="ent-consultant-department"
      open={open}
      onClose={onClose}
      title="Add to Department"
      hint="Consultants belong to one department. Teams are for employees, so this lists departments only."
      applyLabel="Save"
      canApply={pick !== current}
      onApply={() => onApply(pick === NONE ? null : Number(pick))}
    >
      <Select aria-label="Department" value={pick} onChange={setPick} options={[{ value: NONE, label: "No department" }, ...departments.map((g) => ({ value: String(g.id), label: g.name }))]} />
    </Frame>
  );
}

/* ── Link a sign-in ─────────────────────────────────────────────────────────────── */

export function LinkMemberDialog({ open, onClose, subject, linkable, loading, onApply }: { open: boolean; onClose: () => void; subject: string; linkable: LinkableMember[]; loading: boolean; onApply: (memberId: number) => Promise<Outcome> }) {
  const [pick, setPick] = useState("");
  useEffect(() => {
    if (open) setPick("");
  }, [open]);
  return (
    <Frame
      id="ent-consultant-link"
      open={open}
      onClose={onClose}
      title="Link a sign-in"
      hint={`Choose the person who is ${subject}. Their sign-in then opens the consultant workspace, and their marketer can prepare resumes for them.`}
      applyLabel="Link"
      canApply={pick !== ""}
      onApply={() => onApply(Number(pick))}
    >
      {loading ? (
        <p className="text-[13px] text-muted">Loading people…</p>
      ) : linkable.length === 0 ? (
        <p className="text-[13px] text-muted">Everyone who holds the Consultant role is already linked. Invite the person from Invitations with the Consultant role first.</p>
      ) : (
        <Select aria-label="Person" value={pick} onChange={setPick} options={[{ value: "", label: "Choose a person" }, ...linkable.map((m) => ({ value: String(m.memberId), label: m.email ? `${m.name} (${m.email})` : m.name }))]} />
      )}
    </Frame>
  );
}

/* ── Create Job Application ─────────────────────────────────────────────────────── */

export function ApplicationDialog({ open, onClose, subject, jobs, loading, onApply }: { open: boolean; onClose: () => void; subject: string; jobs: JobOption[]; loading: boolean; onApply: (requirementId: number) => Promise<Outcome> }) {
  const [pick, setPick] = useState("");
  useEffect(() => {
    if (open) setPick("");
  }, [open]);
  return (
    <Frame
      id="ent-consultant-application"
      open={open}
      onClose={onClose}
      title="Create job application"
      hint={`Start an application for ${subject}. It begins as Assigned; nothing is submitted for them.`}
      applyLabel="Create application"
      canApply={pick !== ""}
      onApply={() => onApply(Number(pick))}
    >
      {loading ? (
        <p role="status" className="text-[13px] text-ink-soft">
          Loading open jobs…
        </p>
      ) : jobs.length === 0 ? (
        <p className="rounded-lg bg-paper-2 p-3 text-[13px] text-ink-soft" data-no-jobs>
          There are no open jobs without an application for this consultant.
        </p>
      ) : (
        <Select
          aria-label="Job"
          value={pick}
          onChange={setPick}
          placeholder="Choose an open job"
          options={jobs.map((j) => ({ value: String(j.id), label: `${j.title} · ${j.clientName}${j.score !== null ? ` · ${matchScoreText(j.score)}` : ""}` }))}
        />
      )}
    </Frame>
  );
}

/* ── bulk: availability ─────────────────────────────────────────────────────────── */

export function BulkAvailabilityDialog({ open, onClose, count, onApply }: { open: boolean; onClose: () => void; count: number; onApply: (availability: Availability) => Promise<Outcome> }) {
  const [pick, setPick] = useState<Availability>("AVAILABLE");
  useEffect(() => {
    if (open) setPick("AVAILABLE");
  }, [open]);
  return (
    <Frame
      id="ent-consultant-bulk-availability"
      open={open}
      onClose={onClose}
      title="Set availability"
      hint={`Applies to ${count} ${count === 1 ? "consultant" : "consultants"}. Anyone already set that way is skipped.`}
      applyLabel="Apply"
      canApply
      onApply={() => onApply(pick)}
    >
      <Select aria-label="Availability" value={pick} onChange={(v) => setPick(v as Availability)} options={AVAILABILITY_OPTIONS} />
    </Frame>
  );
}
