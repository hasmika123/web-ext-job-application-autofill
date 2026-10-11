import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { needsOnboarding, parseBioPayload } from "@/lib/profile-options";
import SuggestionsCard, { type Suggestion } from "@/components/SuggestionsCard";
import type { Application } from "@/components/ApplicationBoard";
import {
  HOME_KPIS,
  HOME_PROGRESS,
  HOME_RECENT_APPLICATIONS,
  HOME_RECOMMENDED_IDS,
  HOME_TOP_COMPANIES,
} from "@/components/app-v2/sample-data";
import { loadJobs } from "@/components/app-v2/jobs/data";
import { findJob } from "@/components/app-v2/jobs/job-utils";
import {
  ApplicationProgress,
  CareerInsights,
  HomeHero,
  KpiRow,
  LearningStrip,
  RecentApplications,
  SkillMatch,
  TopCompanies,
  UpcomingInterviews,
  type Kpi,
  type ProgressStep,
  type RecentRow,
  type TopCompany,
} from "@/components/app-v2/home/HomeSections";
import { AiPanel, RecommendedJobs, SavedJobsMini, TodaysTasks } from "@/components/app-v2/home/HomeInteractive";

export const metadata: Metadata = { title: "Home" };

/**
 * Home — the authed landing page (post-login redirect target), per design/app-v2/app-home-dashboard.webp.
 * Real where an API exists (name, applications, Pro matches); the rest renders the board's sample
 * data (components/app-v2/sample-data.ts). When the applications list is empty the sample rows render
 * so the page looks like the board (APP-V2-SPEC 1.3). Session gate + shell live in the `(app)` layout.
 */

type Account = { login?: string; email?: string; firstName?: string };
type Bio = Record<string, unknown>;

const SUBMITTED = new Set(["APPLIED", "INTERVIEW", "OFFER", "REJECTED"]);

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SAVED: "Saved",
  APPLIED: "Applied",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
};

export default async function HomePage() {
  const [accountRes, appsRes, profileRes, suggestionsRes, jobsData] = await Promise.all([
    serverApiFetch("/api/account"),
    serverApiFetch("/api/profile/applications"),
    serverApiFetch("/api/profile"),
    // Phase 10.3e: answers learned while applying, awaiting the user's decision. Best-effort: a
    // failure here just means no card, never a broken page.
    serverApiFetch("/api/profile/suggestions").catch(() => null),
    loadJobs(),
  ]);

  const account: Account | null = accountRes.ok ? await accountRes.json().catch(() => null) : null;
  const applications: Application[] = appsRes.ok ? ((await appsRes.json().catch(() => [])) as Application[]) : [];
  const suggestions: Suggestion[] = suggestionsRes?.ok
    ? ((await suggestionsRes.json().catch(() => [])) as Suggestion[])
    : [];

  // 404 = no bio yet (a brand-new account). Any other failure is NOT "no profile": it must not
  // bounce someone with a full profile into onboarding because the API hiccuped.
  const bio: Bio = profileRes.ok ? parseBioPayload(await profileRes.json().catch(() => null)) : {};
  const bioKnown = profileRes.ok || profileRes.status === 404;

  // Phase 10.3b: a new user answers the few questions a resume can't, once. Home is the post-login
  // landing page, so this catches first sign-in without touching `?next=` flows.
  if (bioKnown && needsOnboarding(bio)) redirect("/welcome");

  const active = applications.filter((a) => !a.archived);
  const hasReal = active.length > 0;

  /* KPI tiles */
  let kpis: Kpi[] = HOME_KPIS.map((k) => ({ ...k }));
  if (hasReal) {
    const applied = active.filter((a) => SUBMITTED.has(a.status)).length;
    const interviews = active.filter((a) => a.status === "INTERVIEW" || a.status === "OFFER").length;
    const offers = active.filter((a) => a.status === "OFFER").length;
    const saved = active.filter((a) => a.status === "SAVED").length;
    const rate = applied > 0 ? Math.round((interviews / applied) * 100) : 0;
    kpis = [
      { icon: "file", value: String(applied), label: "Applications", note: `${saved} saved`, tone: "violet" },
      { icon: "calendar", value: String(interviews), label: "Interviews", note: "interviews + offers", tone: "amber" },
      { icon: "offer", value: String(offers), label: "Offers", note: offers > 0 ? "decision pending" : "keep going", tone: "blue" },
      { icon: "chart", value: `${rate}%`, label: "Response Rate", note: "interviews ÷ applied", tone: "pink" },
    ];
  }

  /* Recent applications: newest first by appliedAt/createdAt. */
  let recent: RecentRow[] = HOME_RECENT_APPLICATIONS.map((r, i) => ({ ...r, id: `s${i}` }));
  if (hasReal) {
    recent = [...active]
      .sort(
        (a, b) =>
          new Date(b.appliedAt || b.createdAt || 0).getTime() - new Date(a.appliedAt || a.createdAt || 0).getTime(),
      )
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        title: a.roleTitle || "Untitled role",
        company: a.company,
        status: STATUS_LABEL[a.status] ?? a.status,
        date: "",
        iso: a.appliedAt || a.createdAt || undefined,
      }));
  }

  /* Application progress funnel */
  let steps: ProgressStep[] = HOME_PROGRESS.map((s) => ({ ...s }));
  if (hasReal) {
    const applied = active.filter((a) => SUBMITTED.has(a.status)).length;
    const counts = [
      applied,
      active.filter((a) => a.status === "APPLIED").length,
      active.filter((a) => a.status === "INTERVIEW").length,
      active.filter((a) => a.status === "OFFER").length,
    ];
    const labels = ["Applied", "In Review", "Interview", "Offer"];
    const tones = ["blue", "amber", "violet", "green"] as const;
    steps = counts.map((v, i) => ({
      label: labels[i],
      value: v,
      pct: `${applied > 0 ? Math.round((v / applied) * 100) : 0}%`,
      tone: tones[i],
    }));
  }

  /* Top companies */
  let companies: TopCompany[] = HOME_TOP_COMPANIES.map((c) => ({ ...c }));
  if (hasReal) {
    const by = new Map<string, { apps: number; interviews: number }>();
    for (const a of active) {
      if (!a.company) continue;
      const e = by.get(a.company) ?? { apps: 0, interviews: 0 };
      e.apps += 1;
      if (a.status === "INTERVIEW" || a.status === "OFFER") e.interviews += 1;
      by.set(a.company, e);
    }
    const top = [...by.entries()].sort((a, b) => b[1].apps - a[1].apps).slice(0, 5);
    const max = top[0]?.[1].apps ?? 1;
    const tones = ["blue", "amber", "violet", "coral", "green"] as const;
    if (top.length > 0) {
      companies = top.map(([name, e], i) => ({
        name,
        applications: `${e.apps} application${e.apps === 1 ? "" : "s"}`,
        interviews: `${e.interviews} interview${e.interviews === 1 ? "" : "s"}`,
        pct: Math.round((e.apps / max) * 100),
        tone: tones[i % tones.length],
      }));
    }
  }

  /* Recommended jobs: real matches (Pro) else the board's three. */
  const recommended = jobsData.real
    ? jobsData.jobs.slice(0, 3)
    : HOME_RECOMMENDED_IDS.map((id) => findJob(jobsData.jobs, id)).filter((j): j is NonNullable<typeof j> => !!j);

  const firstName = account?.firstName || account?.login || account?.email?.split("@")[0] || "there";

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-5">
          <HomeHero name={firstName} />
          <KpiRow kpis={kpis} />
          {/* Learned while applying: keep or dismiss (renders nothing when there's nothing to review). */}
          <SuggestionsCard initial={suggestions} />
          <RecentApplications rows={recent} />
          <RecommendedJobs jobs={recommended} real={jobsData.real} />
          <ApplicationProgress steps={steps} />
          <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            <TopCompanies rows={companies} />
            <SkillMatch />
          </div>
        </div>

        {/* Right rail */}
        <aside aria-label="Assistant and tasks" className="grid min-w-0 content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          <AiPanel />
          <TodaysTasks />
          <UpcomingInterviews />
          <SavedJobsMini />
          <div className="md:col-span-2 xl:col-span-1">
            <CareerInsights />
          </div>
        </aside>
      </div>

      <div className="mt-5">
        <LearningStrip />
      </div>
    </div>
  );
}
