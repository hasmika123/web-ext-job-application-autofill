import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import { parseBioPayload } from "@/lib/profile-options";
import { getOnboardingStatus } from "@/lib/onboarding/server";
import SuggestionsCard, { type Suggestion } from "@/components/SuggestionsCard";
import type { Application } from "@/lib/applications";
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
import { samples } from "@/components/app-v3/samples";
import { samplesEnabled } from "@/lib/samples";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard (app v3, spec 2.1): the authed landing page (post-login redirect target). Real where an API
 * exists (first name, applications, Pro matches, profile); where one does not yet, a real account gets an honest
 * empty state and only a demo account on a sample-enabled build gets the board's rows (`samples()`, U0.5).
 * Session gate + shell live in the `(app)` layout.
 */
export default async function Page() {
  const [accountRes, appsRes, profileRes, resumesRes, suggestionsRes, jobsData, completeness, builderConfig, onboardingStatus] = await Promise.all([
    serverApiFetch("/api/account"),
    serverApiFetch("/api/profile/applications"),
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
  const apps: Application[] = appsRes.ok ? (((await appsRes.json().catch(() => [])) as Application[]) ?? []) : [];
  const resumes: unknown[] = resumesRes.ok ? (((await resumesRes.json().catch(() => [])) as unknown[]) ?? []) : [];
  const suggestions: Suggestion[] = suggestionsRes?.ok ? ((await suggestionsRes.json().catch(() => [])) as Suggestion[]) : [];

  // 404 = no bio yet (brand-new account). Nobody is ever redirected into onboarding from here (Onboarding
  // v2): a new account simply sees the "Let's get you job-ready" card below.
  const bio = profileRes.ok ? parseBioPayload(await profileRes.json().catch(() => null)) : {};

  const real = apps.some((a) => a.status !== "SAVED" && !a.archived);
  const n = computeDashboard(apps);

  const firstName = account?.firstName || account?.login || account?.email?.split("@")[0] || "there";
  // The sample gate: real accounts never see a fake row. `showSample` = this demo account has no real applications yet.
  const sampleOn = samplesEnabled(account?.login);
  const showSample = !real && sampleOn;
  const recommended = jobsData.real
    ? jobsData.jobs.slice(0, 3).map((j) => ({ id: j.id, title: j.title, company: j.company, score: j.score, real: j.real }))
    : samples("DASH_RECOMMENDED", sampleOn);
  const sampleStatus = samples("DASH_STATUS", showSample);

  // `feature.onboarding_v2.enabled` (R1.8) switches the card; its timings and the mascot flair come from `config.onboarding`
  // (an API without the group falls back to the declared defaults).
  const onboarding = builderConfig.onboarding ?? DEFAULT_BUILDER_CONFIG.onboarding;

  return (
    <DashboardPage
      firstName={firstName}
      stats={showSample ? samples("DASH_STATS", true) : n.stats}
      activity={showSample ? (samples("DASH_ACTIVITY_PERIODS", true) ?? n.activity) : n.activity}
      status={showSample ? sampleStatus : n.status}
      total={showSample ? sampleStatus.reduce((s, x) => s + x.value, 0) : n.total}
      recent={showSample ? samples("DASH_RECENT", true) : n.recent}
      recommended={recommended}
      insights={samples("DASH_INSIGHTS", sampleOn)}
      interviews={samples("DASH_INTERVIEWS", sampleOn)}
      alerts={samples("DASH_ALERTS", sampleOn)}
      profile={computeProfile(
        profileRes.ok ? bio : null,
        resumes.length,
        sampleOn ? { pct: samples("DASH_PROFILE_PCT", true) ?? 0, checks: samples("DASH_PROFILE_CHECKS", true) } : null,
      )}
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
