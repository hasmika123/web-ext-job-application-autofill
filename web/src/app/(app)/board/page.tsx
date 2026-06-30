import { serverApiFetch } from "@/lib/api";
import ApplicationBoard, { type Application } from "@/components/ApplicationBoard";

/**
 * Application board. The self-populating tracker: the extension logs a DRAFT as you
 * fill (and flips it to APPLIED on a detected submission) and SAVED when you bookmark
 * a job. Fetched server-side; mutations call the `/api/applications/:id` proxy and
 * `router.refresh()` re-runs this fetch. Session gate + nav live in the `(app)` shell.
 */
export default async function BoardPage() {
  const [appsRes, resumesRes, profileRes] = await Promise.all([
    serverApiFetch("/api/profile/applications"),
    serverApiFetch("/api/profile/resumes"),
    serverApiFetch("/api/profile"),
  ]);

  const applications: Application[] = appsRes.ok ? ((await appsRes.json().catch(() => [])) as Application[]) : [];

  // Resume options for the board's "which resume did I send?" pickers (id + label only).
  const rawResumes = resumesRes.ok ? ((await resumesRes.json().catch(() => [])) as Array<{ id: number; label?: string | null }>) : [];
  const resumes = rawResumes.map((r) => ({ id: r.id, label: r.label || `Resume #${r.id}` }));

  // Base profile bio — lets the on-the-fly resume review offer "update base profile" correctly.
  let baseProfile: Record<string, unknown> = {};
  if (profileRes.ok) {
    const dto = (await profileRes.json().catch(() => null)) as { payload?: string } | null;
    if (dto?.payload) {
      try {
        const parsed = JSON.parse(dto.payload);
        if (parsed && typeof parsed === "object") baseProfile = parsed as Record<string, unknown>;
      } catch {
        // corrupt payload — treat as empty base profile
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Application board</h1>
        <p className="mt-1 text-sm text-muted">
          Every job you fill or save with the extension shows up here automatically.
        </p>
      </header>

      <ApplicationBoard applications={applications} resumes={resumes} baseProfile={baseProfile} />
    </div>
  );
}
