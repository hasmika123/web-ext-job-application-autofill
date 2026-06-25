import { serverApiFetch } from "@/lib/api";
import ResumeUpload from "@/components/ResumeUpload";
import ResumeList, { type Resume } from "@/components/ResumeList";

/**
 * Resumes page. Upload + in-browser parse + review, plus the list of saved resumes
 * with archive/restore. Fetched server-side; saving or archiving triggers a
 * `router.refresh()` that re-runs this fetch. Session gate + nav live in the `(app)` shell.
 */
export default async function ResumesPage() {
  let resumes: Resume[] = [];
  const res = await serverApiFetch("/api/profile/resumes");
  if (res.ok) {
    resumes = (await res.json().catch(() => [])) as Resume[];
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Resumes</h1>
        <p className="mt-1 text-sm text-muted">Upload, review, and manage your resumes.</p>
      </header>

      <ResumeUpload />

      <ResumeList resumes={resumes} />
    </div>
  );
}
