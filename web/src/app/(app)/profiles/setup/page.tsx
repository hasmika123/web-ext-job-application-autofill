import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { entryFrom } from "@/lib/onboarding/events";
import { safeReturn } from "@/lib/onboarding/return";
import { getOnboardingStatus } from "@/lib/onboarding/server";
import { parseBioPayload } from "@/lib/profile-options";
import { loadJobs } from "@/components/app-v2/jobs/data";
import { getBuilderConfig } from "@/lib/resume-builder-config";
import ProfileSetup from "@/components/app-v3/profiles/setup/ProfileSetup";

export const metadata: Metadata = { title: "Set up your profile" };

/**
 * Profile setup (Resume Builder R1.4): build the Common Profile from a resume by confirming cards.
 * The page loads the profile's flat bio (a new account has none: GET /api/profile is 404, an empty bio), the builder
 * limits, and the onboarding status with its saved draft (Onboarding v2 R1.9: `GET /api/profile/onboarding?include=state`,
 * null when the API could not say, in which case the flow opens from its local copy); the wizard itself is the client
 * component. `?path=upload|paste|fresh` opens straight on that input (links from empty states and the new-resume chooser
 * use it); `?step=prefs` (where the retired `/welcome` lands, R1.7) opens on the application questions. Both only start a
 * NEW run: a saved draft is picked up instead.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ path?: string | string[]; step?: string | string[]; from?: string | string[]; return?: string | string[]; entry?: string | string[]; utm_source?: string | string[] }> }) {
  const { path, step, from, return: returnParam, entry: entryParam, utm_source: utm } = await searchParams;
  const [bioRes, config, status, accountRes, jobs] = await Promise.all([
    serverApiFetch("/api/profile"),
    getBuilderConfig(),
    getOnboardingStatus(true),
    serverApiFetch("/api/account").catch(() => null),
    // The payoff's "Find jobs" line counts only the person's own daily matches, never the sample rows.
    loadJobs().catch(() => null),
  ]);
  if (bioRes.status === 401 || bioRes.status === 403) redirect("/login");
  const bio = bioRes.ok ? parseBioPayload(await bioRes.json().catch(() => null)) : {};
  const account = accountRes?.ok ? ((await accountRes.json().catch(() => null)) as { login?: string; email?: string; firstName?: string } | null) : null;
  const wanted = Array.isArray(path) ? path[0] : path;
  const wantedStep = Array.isArray(step) ? step[0] : step;
  const wantedFrom = Array.isArray(from) ? from[0] : from;
  const wantedReturn = Array.isArray(returnParam) ? returnParam[0] : returnParam;
  // Where this run came from, for the funnel (DESIGN 12): an explicit `?entry=` marker (the dashboard card sends `card`, the My Profiles
  // empty states `profiles`), the retired /welcome, the new-resume chooser (it sends `return`), the extension (`utm_source=ext`).
  const wantedEntry = Array.isArray(entryParam) ? entryParam[0] : entryParam;
  const wantedUtm = Array.isArray(utm) ? utm[0] : utm;
  const entry = entryFrom({ entry: wantedEntry, from: wantedFrom, returnTo: wantedReturn, path: wanted, utm: wantedUtm });
  return (
    <ProfileSetup
      bio={bio}
      config={config}
      initialPath={wanted === "upload" || wanted === "paste" || wanted === "fresh" ? wanted : null}
      initialStep={wantedStep === "prefs" ? "prefs" : null}
      server={status}
      login={account?.login ?? account?.email ?? "me"}
      firstName={(typeof bio.firstName === "string" && bio.firstName) || account?.firstName || ""}
      entry={entry}
      returnTo={safeReturn(wantedReturn)}
      jobsCount={jobs?.real && jobs.jobs.length >= 1 ? jobs.jobs.length : null}
    />
  );
}
