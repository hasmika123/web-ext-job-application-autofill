import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import type { Bio } from "@/components/BioEditor";
import type { Resume } from "@/components/ResumeList";
import ProfilesPage from "@/components/app-v3/profiles/ProfilesPage";
import { tabFromParam } from "@/components/app-v3/profiles/tabs";
import { deriveProfile } from "@/components/app-v3/profiles/derive";
import { getBioProvenance, getCompleteness, getProfileItems } from "@/lib/profile-items-server";
import { getBuilderConfig } from "@/lib/resume-builder-config";

export const metadata: Metadata = { title: "My Profiles" };

/**
 * My Profiles (app v3, spec 2.4; Resume Builder R1.2). Account name/email, the shared bio payload, the
 * profile items (the first read also seeds them from the default resume), the completeness meter, the
 * builder settings (limits) and the user's resumes are fetched server-side. GET /api/profile is 404
 * with no bio: empty editor. `?tab=` opens a tab (the meter's next action links to it).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  const [accRes, bioRes, resRes, items, completeness, config, bioProvenanceRes] = await Promise.all([
    serverApiFetch("/api/account"),
    serverApiFetch("/api/profile"),
    serverApiFetch("/api/profile/resumes"),
    getProfileItems(),
    getCompleteness(),
    getBuilderConfig(),
    getBioProvenance(), // where each saved bio value came from: the source chips (R1.6)
  ]);
  if (accRes.status === 401 || accRes.status === 403) redirect("/login");
  const account = accRes.ok ? await accRes.json().catch(() => null) : null;
  const resumes: Resume[] = resRes.ok ? (((await resRes.json().catch(() => [])) as Resume[]) ?? []) : [];

  let bio: Bio = {};
  const bioProvenance = bioProvenanceRes;
  if (bioRes.ok) {
    const dto = (await bioRes.json().catch(() => null)) as { payload?: string } | null;
    if (dto?.payload) {
      try {
        const parsed = JSON.parse(dto.payload);
        if (parsed && typeof parsed === "object") bio = parsed as Bio;
      } catch {
        // corrupt payload: start the editor empty rather than crashing
      }
    }
  }

  return (
    <ProfilesPage
      profile={deriveProfile(account, bio, resumes, items ?? [])}
      bio={bio}
      bioProvenance={bioProvenance}
      items={items ?? []}
      itemsLoaded={items !== null}
      completeness={completeness}
      config={config}
      initialTab={tabFromParam(Array.isArray(tab) ? tab[0] : tab)}
    />
  );
}
