import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { needsOnboarding, parseBioPayload } from "@/lib/profile-options";
import SuggestionsCard, { type Suggestion } from "@/components/SuggestionsCard";
import type { Application } from "@/components/ApplicationBoard";
import { loadJobs } from "@/components/app-v2/jobs/data";
import DashboardPage from "@/components/app-v3/home/DashboardPage";
import BuildProfileCard from "@/components/app-v3/profiles/setup/BuildProfileCard";
import { getBuilderConfig } from "@/lib/resume-builder-config";
import ProfileProgressCard from "@/components/app-v3/profiles/setup/ProfileProgressCard";
import { getCompleteness } from "@/lib/profile-items-server";
import { computeDashboard, computeProfile } from "@/components/app-v3/home/compute";
import {
  DASH_ACTIVITY_PERIODS,
  DASH_RECENT,
  DASH_RECOMMENDED,
  DASH_STATS,
  DASH_STATUS,
} from "@/components/app-v3/sample-data";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard (app v3, spec 2.1): the authed landing page (post-login redirect target). Real where an API
 * exists (first name, applications, Pro matches, profile), otherwise the board's SAMPLE data from
 * `app-v3/sample-data.ts`. Session gate + shell live in the `(app)` layout.
 */
export default async function Page() {
  const [accountRes, appsRes, profileRes, resumesRes, suggestionsRes, jobsData, completeness, builderConfig] = await Promise.all([
    serverApiFetch("/api/account"),
    serverApiFetch("/api/profile/applications"),
    serverApiFetch("/api/profile"),
    serverApiFetch("/api/profile/resumes"),
    // Answers learned while applying, awaiting the user's decision. Best-effort: no card on failure.
    serverApiFetch("/api/profile/suggestions").catch(() => null),
    loadJobs(),
    // The profile strength decides whether the "Build your profile" card shows (R1.4). Null on failure: no card.
    getCompleteness(),
    // The admin threshold under which that card shows (`profile.setup.promptBelowPercent`).
    getBuilderConfig(),
  ]);

  const account = accountRes.ok
    ? ((await accountRes.json().catch(() => null)) as { login?: string; email?: string; firstName?: string } | null)
    : null;
  const apps: Application[] = appsRes.ok ? (((await appsRes.json().catch(() => [])) as Application[]) ?? []) : [];
  const resumes: unknown[] = resumesRes.ok ? (((await resumesRes.json().catch(() => [])) as unknown[]) ?? []) : [];
  const suggestions: Suggestion[] = suggestionsRes?.ok ? ((await suggestionsRes.json().catch(() => [])) as Suggestion[]) : [];

  // 404 = no bio yet (brand-new account). Any other failure is NOT "no profile": never bounce
  // someone with a full profile into onboarding because the API hiccuped.
  const bio = profileRes.ok ? parseBioPayload(await profileRes.json().catch(() => null)) : {};
  const bioKnown = profileRes.ok || profileRes.status === 404;
  if (bioKnown && needsOnboarding(bio)) redirect("/welcome");

  const real = apps.some((a) => a.status !== "SAVED" && !a.archived);
  const n = computeDashboard(apps);

  const firstName = account?.firstName || account?.login || account?.email?.split("@")[0] || "there";
  const recommended = jobsData.real
    ? jobsData.jobs.slice(0, 3).map((j) => ({ id: j.id, title: j.title, company: j.company, score: j.score, real: j.real }))
    : DASH_RECOMMENDED;

  return (
    <DashboardPage
      firstName={firstName}
      stats={real ? n.stats : DASH_STATS}
      activity={real ? n.activity : DASH_ACTIVITY_PERIODS}
      status={real ? n.status : DASH_STATUS}
      total={real ? n.total : DASH_STATUS.reduce((s, x) => s + x.value, 0)}
      recent={real ? n.recent : DASH_RECENT}
      recommended={recommended}
      profile={computeProfile(profileRes.ok ? bio : null, resumes.length)}
    >
      {completeness && <BuildProfileCard score={completeness.score} promptBelow={builderConfig.profile.setupPromptBelowPercent} />}
      <ProfileProgressCard completeness={completeness} promptBelow={builderConfig.profile.setupPromptBelowPercent} />
      <SuggestionsCard initial={suggestions} />
    </DashboardPage>
  );
}
