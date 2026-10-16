import type { Metadata } from "next";
import JoinInvite from "@/components/ent/join/JoinInvite";
import TenantLogo from "@/components/ent/login/TenantLogo";
import { serverApiFetch } from "@/lib/api";
import { getTenantSession } from "@/lib/ent/tenant-session";
import { parsePreview } from "@/lib/ent/join";
import PolicyLinks from "@/components/ent/policy/PolicyLinks";
import { getTenant } from "@/lib/tenant";
import { getTenantPolicyLinks } from "@/lib/tenant-policies";

/**
 * `acme.localhost/join/t/{token}` (rewritten here by `proxy.ts`; `/join` is a public tenant path). The preview is public (the link is
 * the credential); anything that is not a live link answers one generic message. Never indexed (the tenant headers say so). S9, O4:
 * accepting an invitation to a SEPARATE organization creates that organization's own account with a password chosen on this page.
 */
export const metadata: Metadata = { title: "Join", robots: { index: false, follow: false } };

export default async function TenantJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the layout already answered
  const { token } = await params;
  const name = t.tenant.displayName;
  const logoUrl = t.tenant.branding?.logoUrl;

  let message: string | null = null;
  let preview = null;
  try {
    const res = await serverApiFetch(`/api/join/${encodeURIComponent(token)}`);
    if (res.ok) preview = parsePreview(await res.json().catch(() => null));
    if (!preview) {
      const code = res.ok ? undefined : ((await res.json().catch(() => ({}))) as { code?: string }).code;
      message =
        res.status === 429
          ? "Too many attempts. Wait a moment and open the link again."
          : code === "INVITE_EXPIRED" || res.status === 409
            ? "This invitation has expired. Ask the person who invited you to send a new one."
            : res.status >= 500
              ? "Something went wrong on our side. Try again in a moment."
              : "This invitation link is not valid.";
    }
  } catch {
    message = "Couldn't reach the server. Try again in a moment.";
  }

  if (!preview) {
    return (
      <main className="tenant-sky grid min-h-dvh place-items-center px-4 py-10 text-[var(--brand-900)]" data-tenant-join-unavailable>
        <div className="tenant-card w-full max-w-[520px] rounded-[24px] bg-white px-6 py-9 text-center sm:px-10">
          <div className="mb-6 flex justify-center">
            <TenantLogo name={name} logoUrl={logoUrl} />
          </div>
          <h1 className="font-body text-[28px] font-extrabold leading-tight tracking-tight">Invitation</h1>
          <p role="status" className="mx-auto mt-3 max-w-[36ch] text-[16px] leading-snug text-v2-ink-soft">
            {message}
          </p>
          <a href="/login" className="mt-6 inline-flex min-h-[44px] items-center justify-center font-semibold text-accent-deep hover:underline">
            Go to sign in
          </a>
          <PolicyLinks links={await getTenantPolicyLinks()} tone="plain" className="mt-6" />
        </div>
      </main>
    );
  }

  const session = preview.createsAccount ? null : await getTenantSession();
  return <JoinInvite token={token} name={name} logoUrl={logoUrl} preview={preview} signedIn={session?.kind === "OK"} />;
}
