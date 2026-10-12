import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import { parseBioPayload } from "@/lib/profile-options";
import { getBuilderConfig } from "@/lib/resume-builder-config";
import ProfileSetup from "@/components/app-v3/profiles/setup/ProfileSetup";

export const metadata: Metadata = { title: "Build your profile" };

/**
 * Profile setup (Resume Builder R1.4): build the Common Profile from a resume by confirming cards.
 * The page only loads the profile's flat bio (a new account has none: GET /api/profile is 404, an
 * empty bio) and the builder limits; the wizard itself is the client component. `?path=upload|paste|fresh`
 * opens straight on that input (links from empty states and the new-resume chooser use it); `?step=prefs`
 * (where the retired `/welcome` lands, R1.7) opens on the application questions.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ path?: string | string[]; step?: string | string[] }> }) {
  const { path, step } = await searchParams;
  const [bioRes, config] = await Promise.all([serverApiFetch("/api/profile"), getBuilderConfig()]);
  if (bioRes.status === 401 || bioRes.status === 403) redirect("/login");
  const bio = bioRes.ok ? parseBioPayload(await bioRes.json().catch(() => null)) : {};
  const wanted = Array.isArray(path) ? path[0] : path;
  const wantedStep = Array.isArray(step) ? step[0] : step;
  return (
    <ProfileSetup
      bio={bio}
      config={config}
      initialPath={wanted === "upload" || wanted === "paste" || wanted === "fresh" ? wanted : null}
      initialStep={wantedStep === "prefs" ? "prefs" : null}
    />
  );
}
