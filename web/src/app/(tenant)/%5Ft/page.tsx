import { getTenant } from "@/lib/tenant";

/** Skeleton landing for a tenant host. X2.6 replaces this with login-first routing (members to their workspace). */
export default async function TenantHome() {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the layout already answered 404
  const title = t.tenant.branding?.welcomeTitle || `Welcome to ${t.tenant.displayName}`;
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {t.tenant.branding?.welcomeMessage ? <p className="mt-2 text-muted">{t.tenant.branding.welcomeMessage}</p> : null}
    </main>
  );
}
