import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import { parseBioPayload } from "@/lib/profile-options";
import { getOnboardingStatus } from "@/lib/onboarding/server";
import SuggestionsCard, { type Suggestion } from "@/components/SuggestionsCard";
import { SUBMITTED_STATUSES, asListPage, statusCsv } from "@/lib/applications";
import { loadJobs } from "@/components/app-v2/jobs/data";
import DashboardPage from "@/components/app-v3/home/DashboardPage";
import FinishProfileCard from "@/components/app-v3/profiles/setup/FinishProfileCard";
import { Mascot } from "@/components/marketing/media";
import { getBuilderConfig } from "@/lib/resume-builder-config";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import { onboardingSettings } from "@/lib/onboarding-card";
import ProfileProgressCard from "@/components/app-v3/profiles/setup/ProfileProgressCard";
import { getCompleteness } from "@/lib/profile-items-server";
import { computeDashboard, computeProfile } from "@/components/app-v3/home/compute";

export const metadata: Metadata = { title: "Dashboard" };

/** How many recent applications the card lists. */
const RECENT_COUNT = 5;

/**
 * Dashboard (app v3, spec 2.1, U3.1): the authed landing page (post-login redirect target). Every number is the
 * account's own: the tiles and the status donut come from the applications list summary (list v2), the recent list
 * from its newest submitted rows, activity and upcoming interviews from their feeds (read in the browser, in the
 * viewer's time zone). Where a source does not exist yet (job alerts) the card is an honest empty state; there is
 * no sample data on this page at all. Session gate + shell live in the `(app)` layout.
 */
export default async function Page() {
  const [accountRes, appsRes, profileRes, resumesRes, suggestionsRes, jobsData, completeness, builderConfig, onboardingStatus] = await Promise.all([
    serverApiFetch("/api/account"),
    // List v2: one page of the newest submitted applications, and `summary` = the counts behind the tiles and the donut.
    serverApiFetch(`/api/profile/applications?size=${RECENT_COUNT}&sort=updatedAt,desc&status=${statusCsv(SUBMITTED_STATUSES)}`),
    serverApiFetch("/api/profile"),
    serverApiFetch("/api/profile/resumes"),
    // Answers learned while applying, awaiting the user's decision. Best-effort: no card on failure.
    serverApiFetch("/api/profile/suggestions").catch(() => null),
    loadJobs(),
    // The profile strength meter card (R1.4). Null on failure: no card.
    getCompleteness(),
    // The admin threshold under which that card shows (`profile.setup.promptBelowPercent`) and the onboarding tunables.
    getBuilderConfig(),
    // Where setup stands and whether the "Finish your profile" card shows (R1.9: the server evaluates `card.show` /
    // `card.state`; "n of total done" comes from its draft). Null on failure: no card, it never nags on a hiccup.
    getOnboardingStatus(),
  ]);

  const account = accountRes.ok
    ? ((await accountRes.json().catch(() => null)) as { login?: string; email?: string; firstName?: string } | null)
    : null;
  // `asListPage` also reads a failed or legacy answer as an empty page: the page then shows zeros, never someone else's numbers.
  const apps = asListPage(appsRes.ok ? await appsRes.json().catch(() => null) : null);
  const resumes: unknown[] = resumesRes.ok ? (((await resumesRes.json().catch(() => [])) as unknown[]) ?? []) : [];
  const suggestions: Suggestion[] = suggestionsRes?.ok ? ((await suggestionsRes.json().catch(() => [])) as Suggestion[]) : [];

  // 404 = no bio yet (brand-new account). Nobody is ever redirected into onboarding from here (Onboarding
  // v2): a new account simply sees the "Let's get you job-ready" card below.
  const bio = profileRes.ok ? parseBioPayload(await profileRes.json().catch(() => null)) : {};

  const n = computeDashboard(apps.summary, apps.items);

  const firstName = account?.firstName || account?.login || account?.email?.split("@")[0] || "there";
  // Matches exist for Pro accounts; everyone else sees the empty state that says how to get them.
  const recommended = jobsData.real
    ? jobsData.jobs.slice(0, 3).map((j) => ({ id: j.id, title: j.title, company: j.company, score: j.score, real: j.real }))
    : [];

  // `feature.onboarding_v2.enabled` (R1.8) switches the card; its timings and the mascot flair come from `config.onboarding`
  // (an API without the group falls back to the declared defaults).
  const onboarding = builderConfig.onboarding ?? DEFAULT_BUILDER_CONFIG.onboarding;

  return (
    <DashboardPage
      firstName={firstName}
      stats={n.stats}
      status={n.status}
      total={n.total}
      recent={n.recent}
      recommended={recommended}
      profile={computeProfile(profileRes.ok ? bio : null, resumes.length)}
    >
      {onboarding.enabled && (
      <FinishProfileCard
        login={account?.login ?? account?.email ?? "me"}
        status={onboardingStatus}
        settings={onboardingSettings(builderConfig)}
        mascotWave={onboarding.mascot ? <Mascot pose="wave" className="h-24 w-24 sm:h-32 sm:w-32" /> : undefined}
        mascotLaptop={onboarding.mascot ? <Mascot pose="laptop" className="h-24 w-24 sm:h-32 sm:w-32" /> : undefined}
      />
      )}
      <ProfileProgressCard completeness={completeness} promptBelow={builderConfig.profile.setupPromptBelowPercent} />
      <SuggestionsCard initial={suggestions} />
    </DashboardPage>
  );
}
