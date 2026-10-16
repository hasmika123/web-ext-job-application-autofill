import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TenantLogo from "@/components/ent/login/TenantLogo";
import PolicyLinks from "@/components/ent/policy/PolicyLinks";
import PolicyMarkdown from "@/components/ent/policy/PolicyMarkdown";
import TenantTemporarilyUnavailable from "@/components/tenant/TenantTemporarilyUnavailable";
import { getTenant } from "@/lib/tenant";
import { getTenantPolicy, getTenantPolicyLinks } from "@/lib/tenant-policies";

/**
 * A public policy page of a tenant host (docs/enterprise-v2/62): `acme.kiwiply.com/privacy`, `/terms`, `/acceptable-use`, `/support` and
 * `/policies/{slug}` all render through here. Everything on the page is the organization's: its published logo and colours (the tenant
 * layout's theme provider), its name, and its policy text (the approved version, else the neutral template). No Kiwiply logo, name or link.
 * A kind the host does not offer is the tenant 404; a slow API is "try again", never "this page doesn't exist".
 */
export async function policyMetadata(kind: string): Promise<Metadata> {
  const t = await getTenant();
  if (t.kind !== "TENANT") return { title: { absolute: "Not available" }, robots: { index: false, follow: false } };
  const r = await getTenantPolicy(kind);
  const title = r.kind === "OK" ? r.policy.title : "Policy";
  return { title: { absolute: `${title} · ${t.tenant.displayName}` }, robots: { index: false, follow: false } };
}

export default async function TenantPolicyPage({ kind }: { kind: string }) {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null; // the tenant layout already answered the unknown / unavailable host
  const r = await getTenantPolicy(kind);
  if (r.kind === "UNAVAILABLE") return <TenantTemporarilyUnavailable />;
  if (r.kind === "NOT_FOUND") notFound();
  const { policy } = r;
  const links = await getTenantPolicyLinks();
  const updated = policy.publishedAt ? new Date(policy.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : null;
  return (
    <div className="min-h-dvh bg-paper-2 text-ink" data-tenant-policy-page data-policy-kind={policy.kind}>
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" aria-label={`${policy.orgName} home`} className="inline-flex min-h-11 items-center">
            <TenantLogo name={t.tenant.displayName} logoUrl={t.tenant.branding?.logoUrl} size="bar" />
          </a>
          <a href="/login" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-accent-deep hover:underline">
            Sign in
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <article className="rounded-2xl border border-line bg-paper px-5 py-7 shadow-[var(--shadow)] sm:px-9 sm:py-10">
          <PolicyMarkdown markdown={policy.body} />
          {updated ? <p className="mt-8 border-t border-line pt-4 text-[13px] text-muted">Last updated {updated}.</p> : null}
        </article>
        <PolicyLinks links={links} className="mt-8" />
        <p className="mt-3 text-center text-[12.5px] text-muted">{policy.orgName}</p>
      </main>
    </div>
  );
}
