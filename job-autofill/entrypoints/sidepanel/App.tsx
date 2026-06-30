/**
 * Side panel root (W3.1). For now a styled placeholder that proves React + Tailwind v4 +
 * the shared @kiwiply/ui tokens render inside the extension. W3.2 replaces the body with
 * <ResumeUpload> mounted from the popup handoff + the extension's services.
 */
export function SidePanelApp() {
  return (
    <div className="min-h-screen bg-app-bg p-6 font-body text-ink">
      <header className="mb-4 flex items-center gap-2">
        <img src="/icons/logo.png" alt="Kiwiply" className="h-7 w-7" />
        <h1 className="font-display text-xl font-semibold">Kiwiply</h1>
      </header>
      <div className="rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-[var(--shadow)]">
        <p className="text-sm text-muted">
          Side panel ready — the resume review form mounts here next (W3.2).
        </p>
      </div>
    </div>
  );
}
