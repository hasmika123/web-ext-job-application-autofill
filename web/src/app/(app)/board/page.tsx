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

  // Resume options for the board's "which resume did I send?" pickers (id + label + default flag).
  const rawResumes = resumesRes.ok
    ? ((await resumesRes.json().catch(() => [])) as Array<{ id: number; label?: string | null; defaultResume?: boolean | null }>)
    : [];
  const resumes = rawResumes.map((r) => ({ id: r.id, label: r.label || `Resume #${r.id}`, defaultResume: !!r.defaultResume }));

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

  // Pipeline-at-a-glance counts for the header (archived entries stay out of the funnel).
  const activeApps = applications.filter((a) => !a.archived);
  const stats: { label: string; count: number; dot?: string }[] = [
    { label: "Tracked", count: activeApps.length },
    { label: "Applied", count: activeApps.filter((a) => a.status === "APPLIED").length, dot: "var(--color-accent)" },
    { label: "Interviews", count: activeApps.filter((a) => a.status === "INTERVIEW").length, dot: "#1d4ed8" },
    { label: "Offers", count: activeApps.filter((a) => a.status === "OFFER").length, dot: "var(--color-accent-deep)" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Application board</h1>
          <p className="mt-1 text-sm text-muted">
            Every job you fill or save with the extension shows up here automatically.
          </p>
        </div>
        {activeApps.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {stats.map((s) => (
              <span
                key={s.label}
                className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] text-muted"
              >
                {s.dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />}
                <span className="font-bold text-ink">{s.count}</span>
                {s.label}
              </span>
            ))}
          </div>
        )}
      </header>

      <ApplicationBoard applications={applications} resumes={resumes} baseProfile={baseProfile} />
    </div>
  );
}
