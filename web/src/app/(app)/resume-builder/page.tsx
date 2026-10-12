import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import { getPlan } from "@/lib/billing";
import { getBuilderConfig } from "@/lib/resume-builder-config";
import { getCompleteness, getProfileItems } from "@/lib/profile-items-server";
import { summarizeProfile } from "@/components/app-v3/resume-builder/new-resume/model";
import type { Resume } from "@/components/ResumeList";
import type { Application } from "@/lib/applications";
import ResumeList from "@/components/app-v3/resume-builder/ResumeList";

export const metadata: Metadata = { title: "Resume Builder" };

/**
 * Resume Builder list (APP-V3-SPEC 2.7). Fetches what the existing /resumes page does (resumes,
 * applications for the per-resume usage count, the base profile for the review step, the plan)
 * so "Manage resumes" can host `ResumesWorkspace` in a side panel unchanged, plus the builder config (plan,
 * cap, templates, Quick Tips) and the profile items + meter the start chooser describes. "New Resume" opens the
 * four-source chooser (profile / upload / copy / scratch) and lands in `/resume-builder/[id]`. `?template=<id>` (the
 * template gallery's "Use this template", R3.13) opens that chooser with the template preselected.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ template?: string | string[] }> }) {
  const q = await searchParams;
  const template = Array.isArray(q.template) ? q.template[0] : q.template;
  const [resumesRes, appsRes, profileRes, plan, config, items, completeness] = await Promise.all([
    serverApiFetch("/api/profile/resumes"),
    serverApiFetch("/api/profile/applications"),
    serverApiFetch("/api/profile"),
    getPlan(),
    getBuilderConfig(),
    getProfileItems(),
    getCompleteness(),
  ]);

  const resumes: Resume[] = resumesRes.ok ? (((await resumesRes.json().catch(() => [])) as Resume[]) ?? []) : [];
  const apps: Application[] = appsRes.ok ? (((await appsRes.json().catch(() => [])) as Application[]) ?? []) : [];

  let baseProfile: Record<string, unknown> = {};
  if (profileRes.ok) {
    const dto = (await profileRes.json().catch(() => null)) as { payload?: string } | null;
    if (dto?.payload) {
      try {
        const parsed = JSON.parse(dto.payload);
        if (parsed && typeof parsed === "object") baseProfile = parsed as Record<string, unknown>;
      } catch {
        // corrupt payload - treat as an empty base profile
      }
    }
  }

  // How many applications reference each resume (the archive guard in ResumeList hinges on it).
  const usage: Record<number, number> = {};
  for (const a of apps) {
    const id = a.resume?.id;
    if (typeof id === "number") usage[id] = (usage[id] ?? 0) + 1;
  }

  // The start chooser's "Use my profile" card: counts from the profile items, the meter, and the headline a resume made from it is named after.
  const headline = typeof baseProfile.headline === "string" ? baseProfile.headline : typeof baseProfile.currentTitle === "string" ? baseProfile.currentTitle : null;
  const profile = summarizeProfile(items ?? [], completeness, headline);

  return <ResumeList resumes={resumes} usage={usage} baseProfile={baseProfile} isPro={plan.plan === "PRO"} config={config} profile={profile} initialTemplate={template ?? null} />;
}
