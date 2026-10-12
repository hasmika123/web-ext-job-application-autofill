import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import { getPlan } from "@/lib/billing";
import type { Resume } from "@/components/ResumeList";
import type { Application } from "@/components/ApplicationBoard";
import ResumeList from "@/components/app-v3/resume-builder/ResumeList";

export const metadata: Metadata = { title: "Resume Builder" };

/**
 * Resume Builder list (APP-V3-SPEC 2.7). Fetches what the existing /resumes page does (resumes,
 * applications for the per-resume usage count, the base profile for the review step, the plan)
 * so "Manage resumes" can host `ResumesWorkspace` in a side panel unchanged. "New resume" creates
 * a built resume and opens `/resume-builder/[id]`.
 */
export default async function Page() {
  const [resumesRes, appsRes, profileRes, plan] = await Promise.all([
    serverApiFetch("/api/profile/resumes"),
    serverApiFetch("/api/profile/applications"),
    serverApiFetch("/api/profile"),
    getPlan(),
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

  return <ResumeList resumes={resumes} usage={usage} baseProfile={baseProfile} isPro={plan.plan === "PRO"} />;
}
