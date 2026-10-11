"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { BriefcaseIcon, GraduationCapIcon, LayersIcon, cn } from "@kiwiply/ui";
import BioEditor, { type Bio } from "@/components/BioEditor";
import { UnderlineTabs } from "../../app-v2/common";
import { HeroBand } from "@/components/app-v2/common";
import OverviewTab, { type ProfileTabKey } from "./OverviewTab";
import type { ProfileView } from "./derive";

const TABS: { id: ProfileTabKey; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal Info" },
  { id: "work", label: "Work Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "projects", label: "Projects" },
  { id: "preferences", label: "Preferences" },
];

/** Which BioEditor sections each tab shows. One editor instance stays mounted so autosave survives tab switches. */
const EDITOR_SECTIONS: Partial<Record<ProfileTabKey, string[]>> = {
  personal: ["identity", "location", "links", "work"],
  skills: ["skills"],
  preferences: ["preferences", "eeo"],
};

/**
 * My Profiles (APP-V3-SPEC section 2.4). Overview is the board; Personal Info, Skills and
 * Preferences reuse the existing bio editor sections (same autosave, shared with the extension).
 * Work Experience, Education and Projects show what the default resume holds, read-only, with a
 * "Coming soon" note for in-place editing (those live in the resume today).
 */
export default function ProfilesPage({ profile, bio }: { profile: ProfileView; bio: Bio }) {
  const [tab, setTab] = useState<ProfileTabKey>("overview");
  const editorShow = EDITOR_SECTIONS[tab] ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
      <HeroBand mascotHeight={124}
        title="My Profiles"
        subtitle="Manage your professional information and tailor it for different jobs."
        mascot="mascot-grad"
      />
      <UnderlineTabs
        tabs={TABS}
        value={tab}
        onChange={(t) => setTab(t as ProfileTabKey)}
        padded
        ariaLabel="Profile sections"
      />

      {tab === "overview" && <OverviewTab profile={profile} onTab={setTab} />}

      {/* Always mounted (hidden off its tabs) so unsaved edits are never dropped by a tab switch. */}
      <div className={cn(editorShow.length === 0 && "hidden")}>
        <BioEditor initialBio={bio} show={editorShow} />
      </div>

      {tab === "work" && (
        <ReadOnlyPanel icon={<BriefcaseIcon className="h-5 w-5" />} title="Work Experience" empty={profile.experience.length === 0}>
          {profile.experience.map((e, i) => (
            <Entry key={i} heading={[e.title, e.company].filter(Boolean).join(" · ") || "Role"} meta={[e.dates, e.location].filter(Boolean).join(" · ")} bullets={e.bullets} />
          ))}
        </ReadOnlyPanel>
      )}
      {tab === "education" && (
        <ReadOnlyPanel icon={<GraduationCapIcon className="h-5 w-5" />} title="Education" empty={profile.education.length === 0}>
          {profile.education.map((e, i) => (
            <Entry key={i} heading={e.school || "School"} meta={[e.degree, e.dates, e.gpa && `GPA ${e.gpa}`].filter(Boolean).join(" · ")} bullets={[]} />
          ))}
        </ReadOnlyPanel>
      )}
      {tab === "projects" && (
        <ReadOnlyPanel icon={<LayersIcon className="h-5 w-5" />} title="Projects" empty={profile.projects.length === 0}>
          {profile.projects.map((p, i) => (
            <Entry key={i} heading={p.name || "Project"} meta="" bullets={p.bullets} />
          ))}
        </ReadOnlyPanel>
      )}
    </div>
  );
}

function ReadOnlyPanel({ icon, title, empty, children }: { icon: ReactNode; title: string; empty: boolean; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-v2-line/70 bg-paper p-5 shadow-v2-soft">
      <div className="flex items-center gap-2 text-v2-navy">
        {icon}
        <h2 className="font-display text-[17px] font-extrabold">{title}</h2>
        <span className="ml-auto rounded-full bg-paper-2 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-v2-muted">Editing: coming soon</span>
      </div>
      {empty ? (
        <p className="mt-4 text-[13.5px] text-v2-ink-soft">
          Nothing here yet. Upload a resume and Kiwiply fills this in for you.{" "}
          <Link href="/resume-builder" className="font-semibold text-v2-blue hover:underline">Go to Resume Builder</Link>
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-v2-muted">Read from your default resume. Editing in place is on the way.</p>
          <ul className="mt-4 flex flex-col gap-4">{children}</ul>
        </>
      )}
    </section>
  );
}

function Entry({ heading, meta, bullets }: { heading: string; meta: string; bullets: string[] }) {
  return (
    <li className="border-t border-v2-line/60 pt-4 first:border-t-0 first:pt-0">
      <p className="text-[14.5px] font-bold text-v2-navy">{heading}</p>
      {meta && <p className="text-[12.5px] text-v2-muted">{meta}</p>}
      {bullets.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-v2-ink-soft">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
