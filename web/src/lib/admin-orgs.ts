/**
 * Wire types and small helpers of the platform-admin Organizations pages (X1.11). The shapes mirror
 * `AdminOrgDTOs` in the API. Nothing here is sample data: every value comes from `/api/admin/orgs`.
 */

export interface OrgRow {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  subdomain: string | null;
  subdomainEnabled: boolean;
  enterpriseOn: boolean;
  host: string | null;
  hostnamesActive: number;
  memberCount: number;
  createdAt: string;
}

export interface OrgSummary {
  orgs: number;
  enterpriseOn: number;
  hostnamesActive: number;
  pending: number;
}

export interface OrgHostname {
  id: number;
  hostname: string;
  kind: string;
  status: string;
  primary: boolean;
  certState: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
}

export interface OrgAuditRow {
  id: number;
  action: string;
  actorLogin: string;
  risk: string;
  details: string | null;
  createdAt: string;
}

export interface OrgEnterprise {
  on: boolean;
  allowListed: boolean;
  denied: boolean;
  masterOn: boolean;
}

export interface OrgModule {
  key: string;
  label: string;
  /** On for this organization now (the master switch and the module's own allow list). */
  on: boolean;
  allowListed: boolean;
}

export interface OrgDetail {
  id: number;
  name: string;
  displayName: string | null;
  slug: string;
  type: string;
  status: string;
  sizeBand: string | null;
  country: string | null;
  subdomain: string | null;
  subdomainEnabled: boolean;
  configVersion: number;
  createdAt: string;
  memberCount: number;
  pendingInvites: number;
  baseDomain: string | null;
  enterprise: OrgEnterprise;
  modules: OrgModule[];
  hostnames: OrgHostname[];
  audit: OrgAuditRow[];
}

export interface LabelCheck {
  label: string;
  valid: boolean;
  reserved: boolean;
  taken: boolean;
  suggestion: string | null;
  host: string | null;
}

/** The one-time answer of Create organization / Reset owner password. `tempPassword` is shown once and never read again. */
export interface OwnerCredentials {
  ownerEmail: string;
  ownerAccount?: "CREATED" | "EXISTING";
  tempPassword: string | null;
  tempPasswordExpiresAt: string | null;
}

export interface CreatedOrg extends OwnerCredentials {
  id: number;
  slug: string;
  host: string;
}

/** Organization types the platform admin can create (COACH is reserved and never offered). */
export const ORG_TYPES: { value: string; label: string }[] = [
  { value: "COMPANY", label: "Company" },
  { value: "CONSULTANCY", label: "Consultancy" },
  { value: "STAFFING", label: "Staffing firm" },
  { value: "PROFESSIONAL_SERVICES", label: "Professional services" },
  { value: "SCHOOL", label: "School" },
  { value: "BOOTCAMP", label: "Bootcamp" },
  { value: "OUTPLACEMENT", label: "Outplacement" },
];

export const ORG_STATUSES = ["DRAFT", "PENDING_SETUP_FEE", "ACTIVE", "PAST_DUE", "SUSPENDED", "CLOSED"];

const TITLE: Record<string, string> = { PENDING_SETUP_FEE: "Pending setup fee", PAST_DUE: "Past due" };

/** "STAFFING" -> "Staffing", "PENDING_SETUP_FEE" -> "Pending setup fee". */
export function humanize(value: string): string {
  if (TITLE[value]) return TITLE[value];
  const s = value.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function typeLabel(value: string): string {
  return ORG_TYPES.find((t) => t.value === value)?.label ?? humanize(value);
}

const ACTIONS: Record<string, string> = {
  ADMIN_ORG_CREATE: "Organization created",
  ADMIN_SUBDOMAIN_PROVISION: "Subdomain provisioned",
  ADMIN_ENTERPRISE_ON: "Enterprise switched on",
  ADMIN_ENTERPRISE_OFF: "Enterprise switched off",
  ADMIN_MODULE_ON: "Module switched on",
  ADMIN_MODULE_OFF: "Module switched off",
  ADMIN_HOSTNAME_SUSPEND: "Hostname suspended",
  ADMIN_HOSTNAME_RESUME: "Hostname resumed",
  ADMIN_OWNER_PASSWORD_RESET: "Owner password reset",
  ORG_CREATE: "Organization created",
  ORG_SUBDOMAIN_SET: "Subdomain set",
};

export function actionLabel(action: string): string {
  return ACTIONS[action] ?? humanize(action);
}
