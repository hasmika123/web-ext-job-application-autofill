"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  BriefcaseIcon,
  CheckCircleIcon,
  FileTextIcon,
  GraduationCapIcon,
  LayersIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  SlidersIcon,
  SparklesIcon,
  StarIcon,
  UploadIcon,
  UserIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import { BrandTile, InitialsAvatar, Progress, SectionCard, StatusChip, TONE, type Tone } from "../../app-v2/common";
import { V3_PROFILE_FALLBACK, V3_RESUME_VERSION_SAMPLES } from "../sample-data";
import type { CompletenessTile, ProfileView } from "./derive";
import type { ProfileTabKey } from "./tabs";


const TILE_ICON: Record<CompletenessTile["key"], { icon: ReactNode; tone: Tone; tab: ProfileTabKey }> = {
  personal: { icon: <UserIcon className="h-5 w-5" />, tone: "blue", tab: "personal" },
  work: { icon: <BriefcaseIcon className="h-5 w-5" />, tone: "green", tab: "work" },
  education: { icon: <GraduationCapIcon className="h-5 w-5" />, tone: "violet", tab: "education" },
  skills: { icon: <SparklesIcon className="h-5 w-5" />, tone: "amber", tab: "skills" },
  projects: { icon: <LayersIcon className="h-5 w-5" />, tone: "teal", tab: "projects" },
  preferences: { icon: <SlidersIcon className="h-5 w-5" />, tone: "pink", tab: "preferences" },
};

/**
 * My Profiles > Overview (APP-V3-SPEC section 2.4). Real: name, email, location, completeness,
 * skills, About, resume versions and the LinkedIn / GitHub / Portfolio links, and (R1.2) the meter and
 * its tiles, which are the API's profile completeness - `percent` is `null` when the API could not be
 * reached. Sample (board text): the job title / location / About / skills when the user has none yet.
 * "Targets" replaces the board's "Multiple Profiles" row: the built resumes, one per role aimed at
 * (DESIGN v1 2.6 - there are no profile variants).
 */
export default function OverviewTab({
  profile,
  tiles,
  percent,
  nextAction,
  onTab,
}: {
  profile: ProfileView;
  tiles: CompletenessTile[];
  percent: number | null;
  nextAction: { label: string; tab: ProfileTabKey } | null;
  onTab: (t: ProfileTabKey) => void;
}) {
  const toast = useToast();
  const comingSoon = (what: string) => toast({ title: "Coming soon", description: `${what} is on the way.` });

  const title = profile.title || V3_PROFILE_FALLBACK.title;
  const location = profile.location || V3_PROFILE_FALLBACK.location;
  const about = profile.about || V3_PROFILE_FALLBACK.about;
  const skills = profile.skills.length > 0 ? profile.skills : V3_PROFILE_FALLBACK.skills;
  const versions = profile.versions.length > 0 ? profile.versions : V3_RESUME_VERSION_SAMPLES;

  const linked: { name: string; url: string }[] = [
    { name: "LinkedIn", url: profile.links.linkedin },
    { name: "GitHub", url: profile.links.github },
    { name: "Portfolio", url: profile.links.website },
  ];

  const quick: { label: string; icon: ReactNode; onClick?: () => void; href?: string }[] = [
    { label: "Update Resume", icon: <UploadIcon className="h-5 w-5" />, href: "/resume-builder" },
    { label: "Add Experience", icon: <BriefcaseIcon className="h-5 w-5" />, onClick: () => onTab("work") },
    { label: "Add Skills", icon: <SparklesIcon className="h-5 w-5" />, onClick: () => onTab("skills") },
    { label: "Edit Preferences", icon: <SlidersIcon className="h-5 w-5" />, onClick: () => onTab("preferences") },
  ];
  const quickCls =
    "flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[#F1F6FF] px-2 py-4 text-center text-[12.5px] font-semibold leading-tight text-v2-navy transition-colors hover:bg-[#E6EFFF]";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* Identity card */}
        <section className="rounded-2xl border border-v2-line/70 bg-paper p-5 shadow-v2-soft">
          <div className="flex items-center gap-4">
            <InitialsAvatar name={profile.name} size={72} tone="blue" />
            <div className="min-w-0">
              <h2 className="truncate font-display text-[20px] font-extrabold leading-tight tracking-normal text-v2-navy">{profile.name}</h2>
              <p className="text-[14px] text-v2-ink-soft">{title}</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-[13.5px] text-v2-ink-soft">
            <li className="flex items-center gap-2">
              <MapPinIcon className="h-4 w-4 flex-none text-v2-muted" /> {location}
            </li>
            {profile.email && (
              <li className="flex items-center gap-2">
                <MailIcon className="h-4 w-4 flex-none text-v2-muted" /> <span className="min-w-0 truncate">{profile.email}</span>
              </li>
            )}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusChip tone="green" dot>
              Open to opportunities
            </StatusChip>
          </div>
          <button
            type="button"
            onClick={() => onTab("personal")}
            className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-v2-line bg-white text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
          >
            <PencilIcon className="h-4 w-4" /> Edit Profile
          </button>
        </section>

        {/* Completeness */}
        <SectionCard
          title="Profile completeness"
          headerExtra={<span className="font-display text-[22px] font-extrabold text-v2-green-ink">{percent === null ? "—" : `${percent}%`}</span>}
        >
          <Progress value={percent ?? 0} tone="green" label="Profile completeness" className="h-2" />
          {nextAction && (
            <p className="mt-3 text-[13px] text-v2-ink-soft">
              Next:{" "}
              <button type="button" onClick={() => onTab(nextAction.tab)} className="font-semibold text-v2-blue hover:underline max-sm:min-h-11 max-sm:py-2">
                {nextAction.label}
              </button>
            </p>
          )}
          <ul className="mt-4 grid grid-cols-2 gap-2.5 min-[1280px]:grid-cols-3">
            {tiles.map((t) => {
              const meta = TILE_ICON[t.key];
              const done = t.status === "done";
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => onTab(meta.tab)}
                    className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:brightness-95", TONE[meta.tone].soft)}
                  >
                    <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg bg-paper", TONE[meta.tone].ink)}>{meta.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold leading-tight text-v2-navy">{t.label}</span>
                      <span
                        className={cn(
                          "mt-0.5 flex items-center gap-1 text-[12px] font-semibold",
                          done ? "text-v2-green-ink" : t.status === "partial" ? "text-v2-amber-ink" : "text-v2-muted",
                        )}
                      >
                        {done && <CheckCircleIcon className="h-3.5 w-3.5" />}
                        {t.detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
        {/* Public profile preview */}
        <SectionCard title="Public Profile Preview">
          <div className="rounded-xl border border-v2-line/70 p-4">
            <div className="flex items-center gap-3">
              <InitialsAvatar name={profile.name} size={48} tone="blue" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-v2-navy">{profile.name}</p>
                <p className="text-[13px] text-v2-ink-soft">{title}</p>
              </div>
            </div>
            <h3 className="mt-4 text-[13px] font-bold tracking-normal text-v2-navy">About</h3>
            <p className="mt-1 line-clamp-4 text-[13.5px] leading-relaxed text-v2-ink-soft">{about}</p>
            <h3 className="mt-4 text-[13px] font-bold tracking-normal text-v2-navy">Skills</h3>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {skills.slice(0, 8).map((s) => (
                <li key={s} className="rounded-md bg-v2-blue-soft px-2 py-0.5 text-[12px] font-medium text-v2-blue">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => comingSoon("Public profiles")}
            className="mt-3 inline-flex h-10 items-center rounded-xl border border-v2-line bg-white px-4 text-[13.5px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
          >
            View Full Profile
          </button>
        </SectionCard>

        {/* Resume versions */}
        <SectionCard title="Resume Versions" action={{ label: "Manage", href: "/resume-builder" }}>
          <ul className="divide-y divide-v2-line/60">
            {versions.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-v2-blue-soft text-v2-blue">
                  <FileTextIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-v2-navy">
                    {r.label}
                    {r.isDefault && <span className="ml-1.5 text-[12px] font-medium text-v2-ink-soft">(Default)</span>}
                  </p>
                  <p className="text-[12px] text-v2-muted">Updated {r.date}</p>
                </div>
                {r.isDefault && <StarIcon className="h-4 w-4 flex-none text-v2-amber" aria-label="Default resume" />}
              </li>
            ))}
          </ul>
        </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* Job preferences (board 1): real bio answers, the board's text while unset */}
          <SectionCard title="Job Preferences">
            <ul className="space-y-2 text-[13.5px] text-v2-ink-soft">
              <li><span className="text-v2-muted">Work: </span>{profile.prefs.workPreference || "Full-time, Remote, Hybrid"}</li>
              <li><span className="text-v2-muted">Salary: </span>{profile.prefs.desiredSalary || "$120K - $180K"}</li>
              <li><span className="text-v2-muted">Relocation: </span>{profile.prefs.relocate || "Open to relocate"}</li>
            </ul>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-[#F1F6FF] px-3 py-2.5">
              <span className="text-[13px] font-semibold text-v2-navy">Profile visibility: Visible to employers</span>
              <button type="button" onClick={() => comingSoon("Profile visibility")} className="text-[12.5px] font-semibold text-v2-blue hover:underline">Change</button>
            </div>
            <button type="button" onClick={() => onTab("preferences")} className="mt-3 text-[13px] font-semibold text-v2-blue hover:underline">Edit preferences</button>
          </SectionCard>

          {/* Targets: the built resumes, one per role aimed at (replaces the board's "Multiple Profiles") */}
          <SectionCard title="Targets" subtitle="One resume per kind of role you're going for.">
            <ul className="flex flex-wrap items-center gap-2">
              {profile.built.map((r) => (
                <li key={r.id} className="min-w-0 max-w-full">
                  <Link
                    href={`/resume-builder/${r.id}`}
                    className="inline-flex max-w-full items-center rounded-xl border border-v2-line bg-white px-3.5 py-2 text-[13.5px] font-semibold text-v2-navy hover:bg-v2-blue-soft max-sm:min-h-11"
                  >
                    <span className="truncate">{r.label}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/resume-builder"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-v2-blue/50 px-3.5 py-2 text-[13.5px] font-semibold text-v2-blue hover:bg-v2-blue-soft max-sm:min-h-11"
                >
                  <PlusIcon className="h-4 w-4" /> New resume
                </Link>
              </li>
            </ul>
          </SectionCard>

          {/* Quick actions */}
          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {quick.map((q) =>
                q.href ? (
                  <Link key={q.label} href={q.href} className={quickCls}>
                    <span className="text-v2-blue">{q.icon}</span>
                    {q.label}
                  </Link>
                ) : (
                  <button key={q.label} type="button" onClick={q.onClick} className={quickCls}>
                    <span className="text-v2-blue">{q.icon}</span>
                    {q.label}
                  </button>
                ),
              )}
            </div>
          </SectionCard>

        {/* Linked profiles */}
        <SectionCard title="Linked Profiles">
          <ul className="divide-y divide-v2-line/60">
            {linked.map((l) => (
              <li key={l.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <BrandTile name={l.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-v2-navy">{l.name}</p>
                  <p className="truncate text-[12px] text-v2-muted">{l.url || "Not connected"}</p>
                </div>
                {l.url ? (
                  <StatusChip tone="green" dot>
                    Connected
                  </StatusChip>
                ) : (
                  <button
                    type="button"
                    onClick={() => comingSoon(`Connecting ${l.name}`)}
                    className="inline-flex h-9 items-center rounded-lg border border-v2-line bg-white px-3.5 text-[13px] font-semibold text-v2-navy hover:bg-[#F1F5FB]"
                  >
                    Connect
                  </button>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
        </div>
      </div>
    </div>
  );
}
