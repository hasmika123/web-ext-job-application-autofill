"use client";

import Link from "next/link";
import { useCallback, useState, type ComponentType } from "react";
import {
  BookmarkIcon,
  BriefcaseIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  DonutChart,
  ErrorState,
  FileTextIcon,
  GearIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  Select,
  ShieldCheckIcon,
  Skeleton,
  SparklesIcon,
  TargetIcon,
  TrophyIcon,
  UserIcon,
  ZapIcon,
  cn,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CARD } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot, openHelpPanel } from "@/components/ent/shell/ShellContext";
import { EnterpriseMascot } from "@/lib/ent/mascot";
import { BASE, Card, CompanyMark, Empty, useWorkspaceData } from "./parts";
import { CertificationForm, ChipList, EDIT_LINK, TextEditor } from "./ProfileEditors";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_STATUSES,
  EMPLOYMENT_LABELS,
  EMPLOYMENT_TYPES,
  WORK_AUTHORIZATIONS,
  WORK_AUTH_LABELS,
  addCertification,
  addPref,
  addSkill,
  fetchProfile,
  initialsOf,
  monthYear,
  removeCertification,
  removePref,
  removeSkill,
  saveAvailability,
  saveCareerGoals,
  saveEmploymentTypes,
  saveSummary,
  saveWorkAuthorization,
  strengthVerdict,
  yearsRange,
  yearsText,
  type AvailabilityStatus,
  type EmploymentType,
  type ProfileResult,
  type ProfileView,
  type WorkAuthorization,
} from "@/lib/ent/consultant-ws/profile";

/**
 * My Career Profile (design/enterprise-consultant/profile.webp): one call to `GET /api/orgs/{orgId}/me-workspace/profile` draws the
 * page for the signed-in consultant's OWN data; every edit is inline, saves on its own and answers with the fresh view. Nothing here
 * is sample data. What is missing is said plainly ("Missing Details" is derived from what is actually absent); the photo spot is an
 * initials circle (we store no photos); work authorization is a status choice, never a document or visa number.
 */

type Req = { key: string; n: number } | null;

/** Opens a card's editor when the page asks for that section (a click on Missing Details or a top button). */
function useOpenOn(req: Req, key: string, open: () => void) {
  const [seen, setSeen] = useState(req?.n ?? 0);
  if (req && req.key === key && req.n !== seen) {
    setSeen(req.n);
    open();
  }
}

type Save = (fn: () => Promise<ProfileResult>, ok?: string) => Promise<string | null>;
interface CardProps {
  view: ProfileView;
  orgId: number;
  save: Save;
  req: Req;
}

const EditLink = ({ onClick, label, active }: { onClick: () => void; label: string; active?: boolean }) => (
  <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={EDIT_LINK}>
    <PencilIcon size={14} />
    {active ? "Done" : "Edit"}
  </button>
);

/* ── the top card ───────────────────────────────────────────────────────────────────── */

const DOT: Record<(typeof AVAILABILITY_LABELS)[AvailabilityStatus]["tone"], string> = {
  green: "bg-v2-green-ink",
  amber: "bg-v2-amber-ink",
  blue: "bg-accent-deep",
  slate: "bg-muted",
};

function AvailabilitySelect({ view, save, label }: { view: ProfileView; save: Save; label: string }) {
  const tone = AVAILABILITY_LABELS[view.availability.status].tone;
  return (
    <Select
      aria-label={label}
      variant="pill"
      value={view.availability.status}
      leadingIcon={<span aria-hidden className={cn("block h-2.5 w-2.5 rounded-full", DOT[tone])} />}
      options={AVAILABILITY_STATUSES.map((s) => ({ value: s, label: AVAILABILITY_LABELS[s].label }))}
      onChange={(v) => void save(() => saveAvailability(view.orgId, v as AvailabilityStatus), "Availability updated")}
    />
  );
}

const TOP_BUTTON = "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 text-[13.5px] font-semibold";

function TopCard({ view, save, jump }: { view: ProfileView; save: Save; jump: (key: string) => void }) {
  const m = view.me;
  const years = yearsText(m.yearsExperience);
  return (
    <section aria-label="Profile" data-profile-top className={cn(CARD, "flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center")}>
      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center">
        <span aria-hidden data-avatar className="grid h-[88px] w-[88px] flex-none place-items-center self-start rounded-full bg-accent-soft text-[28px] font-extrabold text-accent-deep sm:h-[120px] sm:w-[120px] sm:self-auto sm:text-[38px]">
          {initialsOf(m.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[24px] font-extrabold leading-tight text-ink sm:text-[26px]">{m.name}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 text-[14.5px] text-ink-soft">
            {m.jobTitle ? <span className="font-medium">{m.jobTitle}</span> : null}
            {m.jobTitle ? <span aria-hidden className="h-4 w-px bg-line" /> : null}
            <span>Consultant</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            {years ? (
              <p className="flex items-center gap-2.5" data-years>
                <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-accent-soft text-accent-deep">
                  <BriefcaseIcon size={19} />
                </span>
                <span className="leading-tight">
                  <span className="block text-[14px] font-bold text-ink">{years}</span>
                  <span className="block text-[12.5px] text-muted">Experience</span>
                </span>
              </p>
            ) : null}
            {m.location ? (
              <p className="flex items-center gap-2.5" data-location>
                <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-v2-coral-soft text-v2-coral-ink">
                  <MapPinIcon size={19} />
                </span>
                <span className="leading-tight">
                  <span className="block text-[14px] font-bold text-ink">{m.location}</span>
                  <span className="block text-[12.5px] text-muted">Location</span>
                </span>
              </p>
            ) : null}
            <AvailabilitySelect view={view} save={save} label="Availability" />
          </div>
        </div>
      </div>
      <div className="grid flex-none grid-cols-2 gap-2.5 lg:w-[250px] lg:grid-cols-1 lg:border-l lg:border-line lg:pl-6">
        <button type="button" onClick={() => jump("summary")} className={cn(TOP_BUTTON, "border-accent bg-accent text-on-accent hover:bg-accent-deep hover:text-paper")}>
          <PencilIcon size={15} />
          Edit Profile
        </button>
        <button type="button" onClick={() => jump("skills")} className={cn(TOP_BUTTON, "border-accent bg-paper text-accent-deep hover:bg-accent-soft")}>
          <GearIcon size={15} />
          Update Skills
        </button>
        <button type="button" onClick={() => jump("certifications")} className={cn(TOP_BUTTON, "border-accent bg-paper text-accent-deep hover:bg-accent-soft")}>
          <TrophyIcon size={15} />
          Add Certification
        </button>
        <button type="button" onClick={() => jump("roles")} className={cn(TOP_BUTTON, "border-accent bg-paper text-accent-deep hover:bg-accent-soft")}>
          <BookmarkIcon size={15} />
          Save Preferences
        </button>
      </div>
    </section>
  );
}

/* ── the cards ──────────────────────────────────────────────────────────────────────── */

function SummaryCard({ view, orgId, save, req }: CardProps) {
  const [editing, setEditing] = useState(false);
  useOpenOn(req, "summary", () => setEditing(true));
  const s = view.summary;
  return (
    <Card id="profile-summary" title="Professional Summary" icon={FileTextIcon} extra={editing ? null : <EditLink label="Edit professional summary" onClick={() => setEditing(true)} />}>
      {editing ? (
        <TextEditor idBase="summary" label="Professional summary" initial={s.text ?? ""} max={2000} rows={7} onSave={(t) => save(() => saveSummary(orgId, t), "Summary saved")} onClose={() => setEditing(false)} />
      ) : s.text ? (
        <>
          <p data-summary className="whitespace-pre-line text-[14px] leading-relaxed text-ink">
            {s.text}
          </p>
          <p className="mt-2 text-[12px] text-muted">{s.source === "RESUME" ? "Shared with your primary resume." : "Saved on your profile. It moves to your resume once you add one."}</p>
        </>
      ) : (
        <Empty>No summary yet. A short summary helps recruiters see your strengths at a glance.</Empty>
      )}
    </Card>
  );
}

function SkillsCard({ view, orgId, save, req }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  useOpenOn(req, "skills", () => setAdding(true));
  return (
    <Card id="profile-skills" title="Primary Skills" icon={GearIcon} extra={<EditLink label="Edit skills" active={editing} onClick={() => setEditing((v) => !v)} />}>
      <ChipList
        idBase="skill"
        items={view.skills.map((s) => ({ id: s.id, label: s.skill }))}
        editing={editing}
        adding={adding}
        setAdding={setAdding}
        addLabel="Add Skills"
        noun="Skill"
        placeholder="e.g. Kubernetes"
        maxLength={60}
        empty="No skills yet. Add the ones you want to be matched on."
        onAdd={(v) => save(() => addSkill(orgId, v), "Skill added")}
        onRemove={(id) => save(() => removeSkill(orgId, id), "Skill removed")}
      />
    </Card>
  );
}

function CertificationsCard({ view, orgId, save, req }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  useOpenOn(req, "certifications", () => setAdding(true));
  return (
    <Card id="profile-certifications" title="Certifications" icon={TrophyIcon} extra={<EditLink label="Edit certifications" active={editing} onClick={() => setEditing((v) => !v)} />}>
      {view.certifications.length === 0 ? (
        <p className="mb-2 text-[13px] text-muted">No certifications yet. Add the credentials you hold.</p>
      ) : (
        <ul className="divide-y divide-line">
          {view.certifications.map((c) => (
            <li key={c.id} data-certification={c.id} className="flex items-center gap-3 py-2.5">
              <CompanyMark name={c.issuer ?? c.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">{c.name}</span>
                {c.issuer ? <span className="block truncate text-[12px] text-muted">{c.issuer}</span> : null}
              </span>
              <span className="flex-none whitespace-nowrap text-[13px] text-ink-soft">{monthYear(c.issuedOn)}</span>
              {editing ? (
                <button type="button" aria-label={`Remove ${c.name}`} onClick={() => void save(() => removeCertification(orgId, c.id), "Certification removed")} className="flex-none rounded-md px-1.5 text-[12.5px] font-semibold text-v2-coral-ink hover:underline">
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <CertificationForm onSave={(n, i, m) => save(() => addCertification(orgId, n, i, m), "Certification added")} onClose={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex min-h-8 items-center gap-1 self-start text-[13.5px] font-semibold text-accent-deep hover:underline">
          <PlusIcon size={14} />
          Add Certification
        </button>
      )}
    </Card>
  );
}

function ExperienceCard({ view }: CardProps) {
  const items = view.experience.items;
  return (
    <Card
      id="profile-experience"
      title="Work Experience Highlights"
      icon={BriefcaseIcon}
      extra={
        <Link href={`${BASE}/resumes`} aria-label="Edit work experience on My Resumes" className={EDIT_LINK}>
          <PencilIcon size={14} />
          Edit
        </Link>
      }
    >
      {items.length === 0 ? (
        <Empty>No work experience on your resume yet.</Empty>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-line pl-4">
          {items.map((e) => (
            <li key={e.id} data-experience={e.id} className="relative flex flex-wrap items-start justify-between gap-x-3">
              <span aria-hidden className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent-deep" />
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-ink">{e.title}</span>
                {e.employer ? <span className="block text-[13px] text-ink-soft">{e.employer}</span> : null}
              </span>
              <span className="whitespace-nowrap text-[12.5px] text-muted">{yearsRange(e.startYear, e.endYear)}</span>
            </li>
          ))}
        </ol>
      )}
      <Link href={`${BASE}/resumes`} className="mt-3 inline-flex min-h-8 items-center gap-1 self-start text-[13.5px] font-semibold text-accent-deep hover:underline">
        <PlusIcon size={14} />
        {items.length === 0 ? "Add work experience on My Resumes" : "Add Work Experience on My Resumes"}
      </Link>
    </Card>
  );
}

function PrefListCard({ cardKey, title, icon, kind, items, orgId, save, req, addLabel, noun, placeholder, empty }: CardProps & { cardKey: string; title: string; icon: ComponentType<IconProps>; kind: "ROLE" | "LOCATION"; items: { id: number; value: string }[]; addLabel: string; noun: string; placeholder: string; empty: string }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  useOpenOn(req, cardKey, () => setAdding(true));
  return (
    <Card id={`profile-${cardKey}`} title={title} icon={icon} extra={<EditLink label={`Edit ${title.toLowerCase()}`} active={editing} onClick={() => setEditing((v) => !v)} />}>
      <ChipList
        idBase={cardKey}
        items={items.map((i) => ({ id: i.id, label: i.value }))}
        editing={editing}
        adding={adding}
        setAdding={setAdding}
        addLabel={addLabel}
        noun={noun}
        placeholder={placeholder}
        maxLength={80}
        empty={empty}
        onAdd={(v) => save(() => addPref(orgId, kind, v), `${noun} added`)}
        onRemove={(id) => save(() => removePref(orgId, id), `${noun} removed`)}
      />
    </Card>
  );
}

function WorkAuthorizationCard({ view, orgId, save, req }: CardProps) {
  const [editing, setEditing] = useState(false);
  useOpenOn(req, "authorization", () => setEditing(true));
  const a = view.workAuthorization;
  const pick = (v: WorkAuthorization | null) => void save(() => saveWorkAuthorization(orgId, v), "Work authorization saved");
  return (
    <Card id="profile-authorization" title="Work Authorization" icon={ShieldCheckIcon} className="p-3.5 sm:p-4" extra={<EditLink label="Edit work authorization" active={editing} onClick={() => setEditing((v) => !v)} />}>
      {editing ? (
        <fieldset>
          <legend className="sr-only">Work authorization</legend>
          <div className="space-y-2">
            {WORK_AUTHORIZATIONS.map((w) => (
              <label key={w} className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
                <input type="radio" name="work-authorization" checked={a === w} onChange={() => pick(w)} className="mt-0.5 h-4 w-4 flex-none accent-[var(--brand-600)]" />
                <span>
                  <span className="block font-semibold">{WORK_AUTH_LABELS[w].label}</span>
                  <span className="block text-[12px] text-muted">{WORK_AUTH_LABELS[w].note}</span>
                </span>
              </label>
            ))}
          </div>
          {a ? (
            <button type="button" onClick={() => pick(null)} className="mt-2 text-[12.5px] font-semibold text-accent-deep hover:underline">
              Clear my choice
            </button>
          ) : null}
          <p className="mt-2 text-[12px] text-muted">We only keep this choice. Never enter a visa or document number.</p>
        </fieldset>
      ) : a ? (
        <p data-work-authorization className="flex items-start gap-2.5">
          <CheckCircleIcon size={20} className="mt-0.5 flex-none text-v2-green-ink" />
          <span className="leading-snug">
            <span className="block text-[13px] font-bold text-ink">{WORK_AUTH_LABELS[a].label}</span>
            <span className="block text-[12px] text-muted">{WORK_AUTH_LABELS[a].note}</span>
          </span>
        </p>
      ) : (
        <p className="text-[13px] text-muted">Not set yet. Choose the option that applies to you.</p>
      )}
    </Card>
  );
}

function EmploymentCard({ view, orgId, save }: CardProps) {
  const chosen = view.preferences.employmentTypes;
  const toggle = (t: EmploymentType) => {
    const next = chosen.includes(t) ? chosen.filter((x) => x !== t) : EMPLOYMENT_TYPES.filter((x) => x === t || chosen.includes(x));
    void save(() => saveEmploymentTypes(orgId, [...next]), "Employment preferences saved");
  };
  return (
    <Card id="profile-employment" title="Employment Type Preferences" icon={BriefcaseIcon} className="p-3.5 sm:p-4">
      <fieldset>
        <legend className="sr-only">Employment types you are open to</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {EMPLOYMENT_TYPES.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={chosen.includes(t)} onChange={() => toggle(t)} className="h-4 w-4 flex-none rounded accent-[var(--brand-600)]" />
              {EMPLOYMENT_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

function AvailabilityCard({ view, save }: CardProps) {
  const a = view.availability;
  const l = AVAILABILITY_LABELS[a.status];
  return (
    <Card id="profile-availability" title="Current Availability" icon={ClockIcon} className="p-3.5 sm:p-4">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-v2-green-soft text-v2-green-ink">
          <CalendarCheckIcon size={20} />
        </span>
        <div className="min-w-0 leading-snug">
          <p data-availability className="text-[13.5px] font-bold text-v2-green-ink">
            {l.label}
          </p>
          <p className="text-[12px] text-muted">{l.detail}</p>
          {a.status === "NOTICE" && a.availableFrom ? <p className="text-[12px] text-muted">Available from {monthYear(a.availableFrom)}</p> : null}
          {a.since ? <p className="text-[12px] text-muted">Set {monthYear(a.since)}</p> : null}
        </div>
      </div>
      <div className="mt-3">
        <AvailabilitySelect view={view} save={save} label="Change current availability" />
      </div>
    </Card>
  );
}

function CareerGoalsCard({ view, orgId, save, req }: CardProps) {
  const [editing, setEditing] = useState(false);
  useOpenOn(req, "goals", () => setEditing(true));
  return (
    <Card id="profile-goals" title="Career Goals" icon={TargetIcon} className="p-3.5 sm:p-4" extra={editing ? null : <EditLink label="Edit career goals" onClick={() => setEditing(true)} />}>
      {editing ? (
        <TextEditor idBase="goals" label="Career goals" initial={view.careerGoals ?? ""} max={1000} rows={5} onSave={(t) => save(() => saveCareerGoals(orgId, t), "Career goals saved")} onClose={() => setEditing(false)} />
      ) : view.careerGoals ? (
        <p data-career-goals className="whitespace-pre-line text-[13px] leading-snug text-ink">
          {view.careerGoals}
        </p>
      ) : (
        <p className="text-[13px] text-muted">Not set yet. Tell us what you want next.</p>
      )}
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function StrengthCard({ view }: { view: ProfileView }) {
  const pct = view.strength.percent;
  return (
    <Card
      id="profile-strength"
      title="Profile Strength"
      icon={BriefcaseIcon}
      extra={
        <button type="button" onClick={() => jumpTo("profile-missing")} className="flex-none text-[13px] font-semibold text-accent-deep hover:underline">
          View Details
        </button>
      }
    >
      <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-1 xl:justify-items-center 2xl:grid-cols-[auto_minmax(0,1fr)]">
        <div className="mx-auto">
          <DonutChart
            label={`Profile strength ${pct}%`}
            size={132}
            legend={false}
            total={pct}
            totalSuffix="%"
            slices={[
              { key: "done", label: "Complete", value: pct, color: "var(--color-v2-green-ink)" },
              { key: "left", label: "Remaining", value: 100 - pct, color: "transparent" },
            ]}
          />
        </div>
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold text-ink">{strengthVerdict(pct)}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">Add a few more details to stand out to recruiters and get more relevant opportunities.</p>
        </div>
      </div>
    </Card>
  );
}

function BeeTips({ first }: { first: string }) {
  return (
    <section aria-label="Help" data-home-card="help" className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-paper">
      <div className="flex justify-center bg-accent-soft pt-3">
        <EnterpriseMascot pose="greet" size="lg" />
      </div>
      <div className="p-4 sm:p-5">
        <h2 className="text-[17px] font-extrabold leading-tight text-ink">Your career companion, here to help!</h2>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">A complete profile helps you get discovered by the right opportunities, {first}. I can suggest improvements to make your profile stronger.</p>
        <button type="button" onClick={openHelpPanel} className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--brand-border,var(--color-line))] bg-accent-soft px-3 text-left text-[14px] font-semibold text-accent-deep hover:bg-accent-soft/70">
          <SparklesIcon size={17} className="flex-none" />
          <span className="min-w-0 flex-1 truncate">Get Profile Tips</span>
          <ChevronRightIcon size={16} className="flex-none" />
        </button>
      </div>
    </section>
  );
}

const MISSING_ICON: Record<string, ComponentType<IconProps>> = {
  summary: FileTextIcon,
  skills: GearIcon,
  certifications: TrophyIcon,
  experience: BriefcaseIcon,
  roles: BriefcaseIcon,
  locations: MapPinIcon,
  employment: BriefcaseIcon,
  authorization: ShieldCheckIcon,
  goals: TargetIcon,
};

function MissingCard({ view, jump }: { view: ProfileView; jump: (key: string) => void }) {
  const n = view.strength.missing.length;
  return (
    <Card id="profile-missing" title="Missing Details" icon={UserIcon} extra={<span className={cn("flex-none text-[13px] font-bold", n > 0 ? "text-v2-coral-ink" : "text-v2-green-ink")}>{n > 0 ? `${n} item${n === 1 ? "" : "s"}` : "All set"}</span>}>
      {n === 0 ? (
        <Empty>Nothing missing. Your profile is complete.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {view.strength.missing.map((m) => {
            const Icon = MISSING_ICON[m.key] ?? UserIcon;
            const inner = (
              <>
                <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-v2-coral-soft text-v2-coral-ink">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{m.label}</span>
                <ChevronRightIcon size={16} className="flex-none text-muted" />
              </>
            );
            const cls = "flex min-h-11 w-full items-center gap-3 py-1.5 text-left hover:bg-paper-2/50";
            return (
              <li key={m.key} data-missing={m.key}>
                {m.key === "experience" ? (
                  <Link href={`${BASE}/resumes`} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" onClick={() => jump(m.section)} className={cls}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function QuickActions({ jump }: { jump: (key: string) => void }) {
  const items: { key: string; label: string; hint: string; icon: ComponentType<IconProps>; section: string }[] = [
    { key: "edit", label: "Edit Profile", hint: "Update your personal info", icon: PencilIcon, section: "summary" },
    { key: "skills", label: "Update Skills", hint: "Manage your skill set", icon: GearIcon, section: "skills" },
    { key: "cert", label: "Add Certification", hint: "Showcase your credentials", icon: TrophyIcon, section: "certifications" },
    { key: "prefs", label: "Save Preferences", hint: "Set your career preferences", icon: BookmarkIcon, section: "roles" },
  ];
  return (
    <Card id="profile-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-2 gap-2.5">
        {items.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.key}>
              <button type="button" data-quick={q.key} onClick={() => jump(q.section)} className="flex h-full min-h-[68px] w-full flex-col gap-1 rounded-xl border border-line bg-paper p-2.5 text-left hover:bg-paper-2/60">
                <span className="flex items-center gap-1.5 text-[13px] font-bold leading-tight text-ink">
                  <Icon size={16} className="flex-none text-accent-deep" />
                  {q.label}
                </span>
                <span className="text-[11.5px] leading-snug text-muted">{q.hint}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

export interface ProfilePageProps {
  orgId: number;
  firstName: string;
}

const firstOf = (name: string): string => name.trim().split(/\s+/)[0] || "there";

export default function ConsultantProfilePage({ orgId, firstName: first }: ProfilePageProps) {
  const { view, status, reload, setView } = useWorkspaceData(useCallback(() => fetchProfile(orgId).then((r) => (r.kind === "OK" ? { kind: "OK" as const, view: r.view } : r.kind === "DENIED" ? { kind: "DENIED" as const } : { kind: "FAILED" as const })), [orgId]));
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [req, setReq] = useState<Req>(null);
  const loading = status === "loading";

  const save: Save = useCallback(
    async (fn, ok = "Saved") => {
      const r = await fn();
      if (r.kind === "OK") {
        setView(r.view);
        setNote({ text: ok, bad: false });
        return null;
      }
      if (r.kind === "INVALID") {
        setNote(null);
        return r.message;
      }
      const msg = r.kind === "DENIED" ? "This isn't available for your account." : "Couldn't save. Nothing changed. Please try again.";
      setNote({ text: msg, bad: true });
      return msg;
    },
    [setView],
  );

  const jump = useCallback((key: string) => {
    jumpTo(`profile-${key}`);
    setReq((r) => ({ key, n: (r?.n ?? 0) + 1 }));
    if (key === "roles") setNote({ text: "Preferences save as you change them.", bad: false });
  }, []);

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  const cardProps = view ? { view, orgId, save, req } : null;

  return (
    <div data-consultant-profile data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="My Career Profile" subtitle="Manage your professional profile, showcase your skills and experience, and help us find the best opportunities for you." />
      <ClaimsMascot />
      <ClaimsHelpCard />
      <p role="status" aria-live="polite" data-save-note className={cn("min-h-5 text-[13px] font-medium", note?.bad ? "text-v2-coral-ink" : "text-v2-green-ink")}>
        {note?.text ?? ""}
      </p>

      {status === "failed" ? (
        <ErrorState what="your career profile" description="Your profile didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className="rounded-[var(--radius-lg)] border border-line bg-paper" />
      ) : loading || !view || !cardProps ? (
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2" aria-busy="true">
          <Skeleton className="h-40 w-full lg:col-span-2" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.42fr)]">
          <div className="grid min-w-0 content-start gap-4 sm:gap-5">
            <TopCard view={view} save={save} jump={jump} />
            <div className="grid min-w-0 gap-4 sm:gap-5 md:grid-cols-2">
              <SummaryCard {...cardProps} />
              <SkillsCard {...cardProps} />
              <CertificationsCard {...cardProps} />
              <ExperienceCard {...cardProps} />
              <PrefListCard {...cardProps} cardKey="roles" title="Preferred Roles" icon={BriefcaseIcon} kind="ROLE" items={view.preferences.roles} addLabel="Add Role" noun="Role" placeholder="e.g. Backend Developer" empty="No preferred roles yet." />
              <PrefListCard {...cardProps} cardKey="locations" title="Preferred Locations" icon={MapPinIcon} kind="LOCATION" items={view.preferences.locations} addLabel="Add Location" noun="Location" placeholder="e.g. Austin, TX or Remote" empty="No preferred locations yet." />
            </div>
            <div className="grid min-w-0 gap-4 sm:gap-5 sm:grid-cols-2 2xl:grid-cols-4">
              <WorkAuthorizationCard {...cardProps} />
              <EmploymentCard {...cardProps} />
              <AvailabilityCard {...cardProps} />
              <CareerGoalsCard {...cardProps} />
            </div>
          </div>
          <div className="grid min-w-0 content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-1">
            <StrengthCard view={view} />
            <BeeTips first={firstOf(first)} />
            <MissingCard view={view} jump={jump} />
            <QuickActions jump={jump} />
          </div>
        </div>
      )}
    </div>
  );
}

