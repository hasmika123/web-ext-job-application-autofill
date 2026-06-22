import { redirect } from "next/navigation";
import Link from "next/link";
import { hasSession } from "@/lib/auth";
import ResumeUpload from "@/components/ResumeUpload";

/**
 * Resumes page (gated). Upload + in-browser parse + review. Saving to the account,
 * the resume list, and archive land in the following 1.10d commits.
 */
export default async function ResumesPage() {
  if (!(await hasSession())) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resumes</h1>
          <p className="mt-1 text-sm text-foreground/60">Upload and review a resume.</p>
        </div>
        <Link
          href="/settings"
          className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
        >
          Account
        </Link>
      </header>

      <ResumeUpload />
    </main>
  );
}
