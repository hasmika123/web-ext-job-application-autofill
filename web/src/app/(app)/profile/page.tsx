import { serverApiFetch } from "@/lib/api";
import BioEditor, { type Bio } from "@/components/BioEditor";

/**
 * Profile / bio editor. The bio is one JSON `payload` stored server-side and shared
 * with the extension; we fetch it here and hand the parsed object to the editor, which
 * merges edits back so fields it doesn't manage (e.g. EEO answers set in the extension)
 * survive. Session gate + nav live in the `(app)` shell.
 */
export default async function ProfilePage() {
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Your profile</h1>
        <p className="mt-1 text-sm text-muted">
          Your details for autofill. Shared with the browser extension.
        </p>
      </header>

      <BioEditor initialBio={bio} />
    </div>
  );
}
