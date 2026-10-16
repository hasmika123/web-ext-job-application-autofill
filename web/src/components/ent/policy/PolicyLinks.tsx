import { cn } from "@kiwiply/ui";

/** A policy page link (kind, label, same-host path). The shape of `GET /api/public/tenant/policies`. */
export interface PolicyLinkItem {
  kind: string;
  title: string;
  path: string;
}

/** The four default kinds (the default of the admin setting `enterprise.policies.kinds`), used when a page was not given the host's list. */
export const DEFAULT_LINKS: readonly PolicyLinkItem[] = [
  { kind: "PRIVACY", title: "Privacy Policy", path: "/privacy" },
  { kind: "TERMS", title: "Terms of Use", path: "/terms" },
  { kind: "ACCEPTABLE_USE", title: "Acceptable Use Policy", path: "/acceptable-use" },
  { kind: "SUPPORT_CONTACT", title: "Support and contact", path: "/support" },
];

/**
 * The organization's own policy pages as a row of links (docs/enterprise-v2/62). Every target is a path on THIS host (the proxy serves
 * `/privacy`, `/terms`, ... on a tenant host from the organization's published policy or the neutral template), so a visitor of a tenant
 * never leaves it for the Kiwiply site. A plain anchor: works in a server and a client component alike.
 */
export default function PolicyLinks({ links = DEFAULT_LINKS, className, tone = "default" }: { links?: readonly PolicyLinkItem[]; className?: string; tone?: "default" | "plain" }) {
  const safe = links.filter((l) => l.path.startsWith("/") && !l.path.startsWith("//"));
  if (safe.length === 0) return null;
  return (
    <nav aria-label="Policies" className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px]", className)} data-policy-links>
      {safe.map((l) => (
        <a key={l.kind} href={l.path} className={cn("min-h-[24px] underline-offset-2 hover:underline", tone === "default" ? "font-medium text-accent-deep" : "text-inherit")}>
          {l.title}
        </a>
      ))}
    </nav>
  );
}
