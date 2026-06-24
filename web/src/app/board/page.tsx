import { redirect } from "next/navigation";
import Link from "next/link";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import ApplicationBoard, { type Application } from "@/components/ApplicationBoard";

/**
 * Application board (gated). The self-populating tracker: the extension logs a DRAFT
 * as you fill (and flips it to APPLIED on a detected submission) and SAVED when you
 * bookmark a job. Fetched server-side; mutations from the board call the
 * `/api/applications/:id` proxy and `router.refresh()` re-runs this fetch.
 */
export default async function BoardPage() {
  if (!(await hasSession())) {
    redirect("/login");
  }

  let applications: Application[] = [];
  const res = await serverApiFetch("/api/profile/applications");
  if (res.ok) {
    applications = (await res.json().catch(() => [])) as Application[];
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Application board</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Every job you fill or save with the extension shows up here automatically.
          </p>
        </div>
        <nav className="flex gap-2">
          <Link
            href="/resumes"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Resumes
          </Link>
          <Link
            href="/profile"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Profile
          </Link>
          <Link
            href="/settings"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Account
          </Link>
        </nav>
      </header>

      <ApplicationBoard applications={applications} />
    </main>
  );
}
