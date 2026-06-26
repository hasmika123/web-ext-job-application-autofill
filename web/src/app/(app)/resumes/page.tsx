import { serverApiFetch } from "@/lib/api";
import ResumeUpload from "@/components/ResumeUpload";
import ResumeList, { type Resume } from "@/components/ResumeList";
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

  // Base skills from the profile bio — used to highlight overlap in a resume's extracted skills.
  let baseSkills: string[] = [];
  if (profileRes.ok) {
    const dto = (await profileRes.json().catch(() => null)) as { payload?: string } | null;
    if (dto?.payload) {
      try {
        const parsed = JSON.parse(dto.payload);
        if (parsed && Array.isArray(parsed.skills)) {
          baseSkills = parsed.skills.filter((x: unknown): x is string => typeof x === "string");
        }
      } catch {
        // corrupt payload — treat as no base skills
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Resumes</h1>
        <p className="mt-1 text-sm text-muted">
          Upload, review, and manage your resume variants. Each is parsed in your browser.
        </p>
      </header>

      <ResumeUpload baseSkills={baseSkills} />

      <ResumeList resumes={resumes} usage={usage} />
    </div>
  );
}
