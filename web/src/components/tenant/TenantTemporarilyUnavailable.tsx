import { buttonVariants, EmptyState } from "@kiwiply/ui";

/**
 * What a visitor of a tenant host sees while the API is slow, down or throttling us (X1.4 hardening): NOT the "this
 * workspace isn't available" 404, because nothing says the workspace is gone. Generic, no tenant data, no Kiwiply links;
 * the only action is a plain reload of the same address.
 */
export default function TenantTemporarilyUnavailable() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-10" data-tenant-temporarily-unavailable>
      <EmptyState
        mascotPose="error"
        title="Please try again in a moment"
        description="We couldn't reach this workspace just now. This is usually brief."
        action={
          // a plain anchor to the same address (a full reload), styled as the shared button
          <a href="" className={buttonVariants("primary", "md")}>
            Try again
          </a>
        }
        className="w-full"
      />
    </main>
  );
}
