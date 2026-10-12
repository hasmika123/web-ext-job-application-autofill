import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { getOnboardingStatus } from "@/lib/onboarding/server";
import { parseBioPayload } from "@/lib/profile-options";
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
export default async function Page({ searchParams }: { searchParams: Promise<{ path?: string | string[]; step?: string | string[]; from?: string | string[]; return?: string | string[] }> }) {
  const { path, step, from, return: returnParam } = await searchParams;
  const [bioRes, config, status, accountRes] = await Promise.all([
    serverApiFetch("/api/profile"),
    getBuilderConfig(),
    getOnboardingStatus(true),
    serverApiFetch("/api/account").catch(() => null),
  ]);
  if (bioRes.status === 401 || bioRes.status === 403) redirect("/login");
  const bio = bioRes.ok ? parseBioPayload(await bioRes.json().catch(() => null)) : {};
  const account = accountRes?.ok ? ((await accountRes.json().catch(() => null)) as { login?: string; email?: string; firstName?: string } | null) : null;
  const wanted = Array.isArray(path) ? path[0] : path;
  const wantedStep = Array.isArray(step) ? step[0] : step;
  const wantedFrom = Array.isArray(from) ? from[0] : from;
  const wantedReturn = Array.isArray(returnParam) ? returnParam[0] : returnParam;
  // Where this run came from, for the funnel: the retired /welcome, the new-resume chooser (it sends `return`), an empty-state link (`path`).
  const entry = wantedFrom === "welcome" ? "welcome" : wantedReturn ? "chooser" : wanted ? "profiles" : "direct";
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
    />
  );
}
