/**
 * An organization's own domains (docs/enterprise-v2/CUSTOM-DOMAINS-BUILD.md, gap A4): the contract of `/api/orgs/{orgId}/hostnames/**` and the words the
 * Domains page uses. The API builds every DNS value and decides every state; this file only names them.
 */

export type DomainStatus = "PENDING" | "VERIFYING" | "VERIFIED" | "ACTIVE" | "SUSPENDED" | "REMOVED";

export interface Domain {
  id: number;
  hostname: string;
  kind: "SUBDOMAIN" | "CUSTOM";
  status: DomainStatus;
  primary: boolean;
  apex: boolean;
  lastCheckResult: string | null;
  lastCheckAt: string | null;
  verifiedAt: string | null;
  activatedAt: string | null;
  certState: "NONE" | "REQUESTED" | "ISSUED" | "FAILED";
  failingSince: string | null;
  /** A4b: when the edge last asked to issue the certificate, and when HTTPS was first seen live. */
  lastAskAt?: string | null;
  certIssuedAt?: string | null;
}

/** The three steps a live custom domain shows (10-domain-routing.md s5.4): DNS verified, the certificate, and live for real (certificate issued). */
export function certSteps(d: Pick<Domain, "status" | "certState">): { label: string; state: "done" | "now" | "todo" | "failed" }[] {
  const live = d.status === "ACTIVE";
  const cert = d.certState;
  return [
    { label: "DNS verified", state: live || d.status === "VERIFIED" ? "done" : "now" },
    {
      label: cert === "ISSUED" ? "Certificate issued" : cert === "FAILED" ? "Certificate failed" : cert === "REQUESTED" ? "Certificate being issued" : "Certificate on first visit",
      state: !live ? "todo" : cert === "ISSUED" ? "done" : cert === "FAILED" ? "failed" : "now",
    },
    { label: "Live", state: live && cert === "ISSUED" ? "done" : "todo" },
  ];
}

export interface DomainsOverview {
  domains: Domain[];
  maxCustom: number;
  customCount: number;
  edgeName: string;
  edgeIp: string;
  autoActivate: boolean;
}

export interface DnsRecord {
  type: "TXT" | "CNAME" | "A";
  name: string;
  value: string;
  purpose: "OWNERSHIP" | "TRAFFIC";
}

export interface DomainInstructions {
  hostname: string;
  apex: boolean;
  records: DnsRecord[];
  proxyWarning: string;
  ttlHint: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; code?: string; message: string };

export const STATUS_LABEL: Record<DomainStatus, string> = {
  PENDING: "Waiting for DNS",
  VERIFYING: "Checking",
  VERIFIED: "Verified",
  ACTIVE: "Live",
  SUSPENDED: "Suspended",
  REMOVED: "Removed",
};

/** What a check result means, in a sentence for the customer (10-domain-routing.md s4.4). */
export function checkText(code: string | null | undefined, hostname: string, edgeName: string, edgeIp: string): string | null {
  if (!code) return null;
  const [head, ...rest] = code.split(":");
  const detail = rest.join(":");
  switch (head) {
    case "OK":
      return "Both DNS records are in place.";
    case "TXT_MISSING":
      return "We can't find the ownership record yet. DNS changes can take a while: try again in a few minutes.";
    case "TXT_MISMATCH":
      return "The ownership record has a different value. Copy it again from below.";
    case "CNAME_MISSING":
      return `Point ${hostname} at ${edgeName} with a CNAME record.`;
    case "CNAME_WRONG_TARGET":
      return `${hostname} currently points at ${detail}. Change it to ${edgeName}.`;
    case "A_WRONG_IP":
      return `${hostname} points at ${detail}. It needs to point at ${edgeIp}.`;
    case "DNS_NXDOMAIN":
      return "This name doesn't exist in DNS yet.";
    case "DNS_ERROR":
      return "We couldn't reach your DNS provider. We'll keep trying.";
    case "CERT_FAILED":
      return detail === "TLS"
        ? "The certificate couldn't be issued: the secure connection was refused. Check the records are DNS-only (no proxy), then ask Kiwiply support to retry."
        : "The certificate couldn't be issued: we couldn't reach the address. Check the CNAME points at our edge, then ask Kiwiply support to retry.";
    default:
      return code;
  }
}

/** The sentence a refused call shows. */
export function errorText(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  switch (r.code) {
    case "HOSTNAME_TAKEN":
      return "That domain is already in use.";
    case "CHECK_TOO_SOON":
      return "This domain was checked a moment ago. Try again in a minute.";
    case "ORG_LIMIT_REACHED":
      return "Your organization has reached its number of domains. Remove one first.";
    case "PRIMARY_REQUIRED":
      return "This is your organization's main address. Make another address the main one first.";
    case "SUBDOMAIN_MANAGED":
      return "Kiwiply manages this address. Ask Kiwiply support to change it.";
    case "HOST_NOT_LIVE":
      return "Only a live address with its certificate can be the main one. Open it once in a browser, then try again in a few minutes.";
    default:
      break;
  }
  if (r.status === 404) return "This domain is no longer in your view.";
  return r.message || "Something went wrong. Try again.";
}

async function call<T>(url: string, init?: RequestInit): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection." };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T };
  const message = typeof body.detail === "string" ? body.detail : typeof body.message === "string" && !body.message.startsWith("error.") ? body.message : typeof body.error === "string" ? body.error : "";
  return { ok: false, status: res.status, code: typeof body.code === "string" ? body.code : undefined, message };
}

const base = (orgId: number | string) => `/api/orgs/${orgId}/hostnames`;
const post = (url: string, body?: unknown) => ({ url, init: { method: "POST", body: JSON.stringify(body ?? {}) } as RequestInit });

export const domainsApi = {
  list: (orgId: number | string) => call<DomainsOverview>(base(orgId)),
  add: (orgId: number | string, hostname: string) => {
    const p = post(base(orgId), { hostname });
    return call<Domain>(p.url, p.init);
  },
  instructions: (orgId: number | string, id: number) => call<DomainInstructions>(`${base(orgId)}/${id}/instructions`),
  verify: (orgId: number | string, id: number) => {
    const p = post(`${base(orgId)}/${id}/verify`);
    return call<Domain>(p.url, p.init);
  },
  activate: (orgId: number | string, id: number) => {
    const p = post(`${base(orgId)}/${id}/activate`);
    return call<Domain>(p.url, p.init);
  },
  suspend: (orgId: number | string, id: number, reason: string) => {
    const p = post(`${base(orgId)}/${id}/suspend`, { reason });
    return call<Domain>(p.url, p.init);
  },
  resume: (orgId: number | string, id: number) => {
    const p = post(`${base(orgId)}/${id}/resume`);
    return call<Domain>(p.url, p.init);
  },
  makePrimary: (orgId: number | string, id: number) => {
    const p = post(`${base(orgId)}/${id}/primary`);
    return call<Domain>(p.url, p.init);
  },
  remove: (orgId: number | string, id: number, confirm: string) => {
    const p = post(`${base(orgId)}/${id}/remove`, { confirm });
    return call<Domain>(p.url, p.init);
  },
};
