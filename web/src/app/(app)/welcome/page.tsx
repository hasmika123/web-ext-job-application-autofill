import { serverApiFetch } from "@/lib/api";
import Onboarding from "@/components/onboarding/Onboarding";
import { parseBioPayload } from "@/lib/profile-options";

/**
 * /welcome — the short onboarding step (Phase 10.3b, Tier A of the self-building profile).
 * The dashboard sends a new user here once; after that it's reachable from the dashboard's
 * setup checklist. It never redirects away, so it's safe to revisit.
 */
export default async function WelcomePage() {
  const [profileRes, resumesRes] = await Promise.all([
    serverApiFetch("/api/profile"),
    serverApiFetch("/api/profile/resumes"),
  ]);
  // 404 = no bio yet, which is the normal case for a brand-new account.
  const bio = profileRes.ok ? parseBioPayload(await profileRes.json().catch(() => null)) : {};
  const resumes = resumesRes.ok ? ((await resumesRes.json().catch(() => [])) as unknown[]) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[.08em] text-muted">Welcome</div>
        <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">A few quick questions</h1>
        <p className="mt-1 text-sm text-muted">
          Only what your resume can&apos;t tell us. Six questions, all optional; Kiwiply learns the rest as you apply.
        </p>
      </header>
      <Onboarding initialBio={bio} hasResume={resumes.length > 0} />
    </div>
  );
}
