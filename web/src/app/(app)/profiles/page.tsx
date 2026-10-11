import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import type { Bio } from "@/components/BioEditor";
import type { Resume } from "@/components/ResumeList";
import ProfilesPage from "@/components/app-v3/profiles/ProfilesPage";
import { deriveProfile } from "@/components/app-v3/profiles/derive";

export const metadata: Metadata = { title: "My Profiles" };

/**
 * My Profiles (app v3, spec 2.4). Account name/email, the shared bio payload and the user's resumes
 * are fetched server-side; `deriveProfile` builds the view and the page falls back to the board's
 * sample text wherever the user has nothing yet. GET /api/profile is 404 with no bio: empty editor.
 */
export default async function Page() {
  const [accRes, bioRes, resRes] = await Promise.all([
    serverApiFetch("/api/account"),
    serverApiFetch("/api/profile"),
    serverApiFetch("/api/profile/resumes"),
  ]);
  if (accRes.status === 401 || accRes.status === 403) redirect("/login");
  const account = accRes.ok ? await accRes.json().catch(() => null) : null;
  const resumes: Resume[] = resRes.ok ? (((await resRes.json().catch(() => [])) as Resume[]) ?? []) : [];

  let bio: Bio = {};
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

  return <ProfilesPage profile={deriveProfile(account, bio, resumes)} bio={bio} />;
}
