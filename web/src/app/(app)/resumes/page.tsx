import { serverApiFetch } from "@/lib/api";
import ResumesWorkspace from "@/components/ResumesWorkspace";
import { type Resume } from "@/components/ResumeList";
import type { Application } from "@/components/ApplicationBoard";

/**
 * Resumes page. Upload + in-browser parse + review, plus the variant cards with
 * archive/restore/delete-guard. Fetched server-side; saving or archiving triggers a
 * `router.refresh()`. We also fetch applications to show "used in N applications" per
 * resume. Session gate + nav live in the `(app)` shell.
 */
export default async function ResumesPage() {
  const [resumesRes, appsRes, profileRes] = await Promise.all([
    serverApiFetch("/api/profile/resumes"),
    serverApiFetch("/api/profile/applications"),
    serverApiFetch("/api/profile"),
  ]);

  const resumes: Resume[] = resumesRes.ok ? ((await resumesRes.json().catch(() => [])) as Resume[]) : [];
  const apps: Application[] = appsRes.ok ? ((await appsRes.json().catch(() => [])) as Application[]) : [];

  // Full base profile bio — the review highlights overlapping skills and offers a
  // one-click "update base profile" from a resume's detected contact.
  let baseProfile: Record<string, unknown> = {};
  if (profileRes.ok) {
    const dto = (await profileRes.json().catch(() => null)) as { payload?: string } | null;
    if (dto?.payload) {
      try {
        const parsed = JSON.parse(dto.payload);
        if (parsed && typeof parsed === "object") baseProfile = parsed as Record<string, unknown>;
      } catch {
        // corrupt payload — treat as an empty base profile
      }
    }
  }

  // Count how many applications reference each resume (the archive guard hinges on this).
  const usage: Record<number, number> = {};
  for (const a of apps) {
    const id = a.resume?.id;
    if (typeof id === "number") usage[id] = (usage[id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-ink">
          Resumes
          {resumes.length > 0 && (
            <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-ink-soft">
              {resumes.filter((r) => !r.archived).length}
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Upload, review, and manage your resume variants. Each is parsed in your browser.
        </p>
      </header>

      <ResumesWorkspace baseProfile={baseProfile} resumes={resumes} usage={usage} />
    </div>
  );
}
