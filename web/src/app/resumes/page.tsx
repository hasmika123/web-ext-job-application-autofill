import { redirect } from "next/navigation";
import Link from "next/link";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import ResumeUpload from "@/components/ResumeUpload";
import ResumeList, { type Resume } from "@/components/ResumeList";

/**
 * Resumes page (gated). Upload + in-browser parse + review, plus the list of saved
 * resumes with archive/restore. The list is fetched server-side; saving or archiving
 * triggers a `router.refresh()` that re-runs this fetch. Bio editor lands next in 1.10d.
 */
export default async function ResumesPage() {
  if (!(await hasSession())) {
    redirect("/login");
  }

  let resumes: Resume[] = [];
  const res = await serverApiFetch("/api/profile/resumes");
  if (res.ok) {
    resumes = (await res.json().catch(() => [])) as Resume[];
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resumes</h1>
          <p className="mt-1 text-sm text-foreground/60">Upload, review, and manage your resumes.</p>
        </div>
        <Link
          href="/settings"
          className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
        >
          Account
        </Link>
      </header>

      <ResumeUpload />

      <ResumeList resumes={resumes} />
    </main>
  );
}
