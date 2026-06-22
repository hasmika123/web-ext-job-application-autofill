import { redirect } from "next/navigation";
import Link from "next/link";
import { hasSession } from "@/lib/auth";
import { serverApiFetch } from "@/lib/api";
import BioEditor, { type Bio } from "@/components/BioEditor";

/**
 * Profile / bio editor (gated). The bio is one JSON `payload` stored server-side and
 * shared with the extension; we fetch it here and hand the parsed object to the editor,
 * which merges edits back so fields it doesn't manage (e.g. EEO answers set in the
 * extension) survive. Completes the 1.10d web management surface.
 */
export default async function ProfilePage() {
  if (!(await hasSession())) {
    redirect("/login");
  }

  // GET /api/profile is 404 when no bio exists yet — that's just an empty editor.
  let bio: Bio = {};
  const res = await serverApiFetch("/api/profile");
  if (res.ok) {
    const dto = (await res.json().catch(() => null)) as { payload?: string } | null;
    if (dto?.payload) {
      try {
        const parsed = JSON.parse(dto.payload);
        if (parsed && typeof parsed === "object") bio = parsed as Bio;
      } catch {
        // corrupt payload — start the editor empty rather than crashing the page
      }
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-foreground/60">
            Your details for autofill. Shared with the browser extension.
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
            href="/settings"
            className="rounded-full border border-foreground/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground/5"
          >
            Account
          </Link>
        </nav>
      </header>

      <BioEditor initialBio={bio} />
    </main>
  );
}
