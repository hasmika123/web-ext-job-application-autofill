"use client";

import { useCallback, useMemo, useState } from "react";
import { BriefcaseIcon, GraduationCapIcon, LayersIcon, ListIcon, TrophyIcon, cn } from "@kiwiply/ui";
import BioEditor, { type Bio } from "@/components/BioEditor";
import { UnderlineTabs } from "../../app-v2/common";
import { HeroBand } from "@/components/app-v2/common";
import { fetchCompleteness, type Completeness, type ProfileItem } from "@/lib/profile-items";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config";
import OverviewTab from "./OverviewTab";
import { PROFILE_TABS, tabFromHref, type ProfileTabKey } from "./tabs";
import SectionTab from "./SectionTab";
import SkillsChips from "./SkillsChips";
import { buildTiles, type ProfileView } from "./derive";
import type { DraftLimits } from "./itemSchema";
import { useProfileItems } from "./useProfileItems";

/** Which BioEditor sections each tab shows. One editor instance stays mounted so autosave survives tab switches. */
const EDITOR_SECTIONS: Partial<Record<ProfileTabKey, string[]>> = {
  personal: ["identity", "location", "links", "work"],
  skills: ["skills"],
  preferences: ["preferences", "eeo"],
};

/**
 * My Profiles (APP-V3-SPEC section 2.4, Resume Builder R1.2). Overview is the board with the API's
 * completeness meter; Personal Info and Preferences keep the bio editor (same autosave, shared with the
 * extension). Work Experience, Education, Projects and More (certifications, languages, awards, other)
 * are editable lists of profile items; Skills are chips in named groups, with the bio editor's "Base
 * skills" (what the extension autofills) kept underneath. `?tab=` opens a tab (the meter's next action
 * links to it).
 */
export default function ProfilesPage({
  profile,
  bio,
  bioProvenance,
  items: initialItems,
  itemsLoaded,
  completeness: initialCompleteness,
  config,
  initialTab,
}: {
  profile: ProfileView;
  bio: Bio;
  /** `bio.meta_json.provenance` from GET /api/profile: the source chips on the bio fields (R1.6). */
  bioProvenance?: Record<string, string>;
  items: ProfileItem[];
  /** False when the items could not be loaded: the lists say so and Add is off. */
  itemsLoaded: boolean;
  completeness: Completeness | null;
  config: ResumeBuilderConfig;
  initialTab: ProfileTabKey;
}) {
  const [tab, setTabState] = useState<ProfileTabKey>(initialTab);
  const [completeness, setCompleteness] = useState<Completeness | null>(initialCompleteness);

  const refreshMeter = useCallback(() => {
    fetchCompleteness()
      .then(setCompleteness)
      .catch(() => undefined); // keep the last meter; the next write or tab visit tries again
  }, []);

  const api = useProfileItems(initialItems, refreshMeter);

  const setTab = (next: ProfileTabKey) => {
    setTabState(next);
    if (next === "overview" || next === "personal" || next === "preferences" || next === "skills") refreshMeter(); // bio edits move the meter too
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  const editorShow = EDITOR_SECTIONS[tab] ?? [];
  const limits: DraftLimits = { bullets: config.limits.bullets, bulletChars: config.limits.bulletChars };
  const maxItems = config.profile.maxItemsPerUser;
  const atCap = api.count >= maxItems;
  const loadFailed = !itemsLoaded;

  const tiles = useMemo(() => buildTiles(completeness, api.items), [completeness, api.items]);
  const nextAction = completeness?.nextAction ? { label: completeness.nextAction.label, tab: tabFromHref(completeness.nextAction.href) } : null;

  const shared = { api, limits, atCap, maxItems, loadFailed };

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
      <HeroBand mascotHeight={124}
        title="My Profiles"
        subtitle="Manage your professional information and tailor it for different jobs."
        mascot="mascot-grad"
      />
      <UnderlineTabs
        tabs={PROFILE_TABS}
        value={tab}
        onChange={(t) => setTab(t as ProfileTabKey)}
        padded
        ariaLabel="Profile sections"
      />

      {tab === "overview" && (
        <OverviewTab profile={profile} tiles={tiles} percent={completeness?.score ?? null} nextAction={nextAction} onTab={setTab} />
      )}

      {tab === "work" && (
        <SectionTab
          {...shared}
          section="EXPERIENCE"
          title="Work Experience"
          icon={<BriefcaseIcon className="h-5 w-5" />}
          empty="Nothing here yet. Add a role, or upload a resume and Kiwiply fills this in for you."
        />
      )}
      {tab === "education" && (
        <SectionTab
          {...shared}
          section="EDUCATION"
          title="Education"
          icon={<GraduationCapIcon className="h-5 w-5" />}
          empty="Nothing here yet. Add your schooling, or upload a resume and Kiwiply fills this in for you."
        />
      )}
      {tab === "projects" && (
        <SectionTab
          {...shared}
          section="PROJECT"
          title="Projects"
          icon={<LayersIcon className="h-5 w-5" />}
          empty="Nothing here yet. Add a project, or upload a resume and Kiwiply fills this in for you."
        />
      )}
      {tab === "skills" && <SkillsChips api={api} atCap={atCap} loadFailed={loadFailed} />}

      {tab === "more" && (
        <div className="flex flex-col gap-4">
          <SectionTab {...shared} hideHeading section="CERTIFICATION" title="Certifications" icon={<TrophyIcon className="h-4 w-4" />} empty="No certifications yet." />
          <SectionTab {...shared} hideHeading section="LANGUAGE" title="Languages" icon={<GraduationCapIcon className="h-4 w-4" />} empty="No languages yet." />
          <SectionTab {...shared} hideHeading section="ACHIEVEMENT" title="Awards" icon={<TrophyIcon className="h-4 w-4" />} empty="No awards yet." />
          <SectionTab {...shared} hideHeading section="CUSTOM" title="Other" icon={<ListIcon className="h-4 w-4" />} empty="Volunteering, publications or anything else worth a line." />
        </div>
      )}

      {/* Always mounted (hidden off its tabs) so unsaved edits are never dropped by a tab switch. */}
      <div className={cn(editorShow.length === 0 && "hidden")}>
        {tab === "skills" && (
          <div className="mb-2 mt-1">
            <h3 className="text-[14px] font-bold text-v2-navy">Base skills for autofill</h3>
            <p className="text-[12.5px] text-v2-muted">The short list the extension uses on application forms. Your resume skills above are separate.</p>
          </div>
        )}
        <BioEditor initialBio={bio} show={editorShow} provenance={bioProvenance} summaryMax={config.limits.summaryChars} />
      </div>
    </div>
  );
}
