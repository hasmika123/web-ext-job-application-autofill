import { EmptyState } from "@kiwiply/ui";

/**
 * The page a visitor of an unserved host sees (X1.4): honest, generic, and deliberately bare. It says nothing about
 * which workspace was asked for or whether one exists, carries no Kiwiply marketing links and sets no cookies.
 * Rendered by `(tenant)/not-found.tsx` (HTTP 404, `noindex`).
 */
export default function TenantUnavailable() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-10" data-tenant-unavailable>
      <EmptyState
        mascotPose="empty"
        title="This workspace isn't available"
        description="Check the address you were given, or ask the person who invited you for a fresh link."
        className="w-full"
      />
    </main>
  );
}
