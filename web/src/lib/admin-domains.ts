/** The platform admin's Domains list (CUSTOM-DOMAINS-BUILD.md A4b): every organization's addresses, the ones needing attention first. */

export interface AdminDomainRow {
  id: number;
  orgId: number;
  orgName: string;
  hostname: string;
  kind: "SUBDOMAIN" | "CUSTOM";
  status: string;
  primary: boolean;
  certState: string;
  lastCheckResult: string | null;
  lastCheckAt: string | null;
  lastAskAt: string | null;
  failingSince: string | null;
  attention: boolean;
}

export interface AdminDomainPage {
  rows: AdminDomainRow[];
  total: number;
  attention: number;
}

export interface AdminRechecked {
  row: AdminDomainRow | null;
  dns: string | null;
  certificate: string | null;
}

export const DOMAIN_STATUSES = ["PENDING", "VERIFYING", "VERIFIED", "ACTIVE", "SUSPENDED", "REMOVED"] as const;
