import { TONE } from "@/components/app-v2/common/tones";
import type { OrgRole, OrgStatus, OrgType } from "@/lib/org-types";

/** How the console words an org's lifecycle state (tenant-model.md section 3). `tone` is a ready-to-use pill class. */
export function statusLabel(status: OrgStatus): { label: string; tone: string; live: boolean } {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", tone: `${TONE.green.soft} ${TONE.green.ink}`, live: true };
    case "DRAFT":
      return { label: "Draft", tone: `${TONE.amber.soft} ${TONE.amber.ink}`, live: false };
    case "PENDING_SETUP_FEE":
      return { label: "Awaiting payment", tone: `${TONE.amber.soft} ${TONE.amber.ink}`, live: false };
    case "PAST_DUE":
      return { label: "Payment due", tone: `${TONE.coral.soft} ${TONE.coral.ink}`, live: true };
    case "SUSPENDED":
      return { label: "Paused", tone: `${TONE.coral.soft} ${TONE.coral.ink}`, live: false };
    case "CLOSED":
      return { label: "Closed", tone: `${TONE.slate.soft} ${TONE.slate.ink}`, live: false };
  }
}

const ROLES: Record<OrgRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  STAFF: "Support owner",
  MEMBER: "Member",
  MARKETER: "Marketer",
  FINANCE: "Finance",
  COACH: "Coach",
};

/** The person-facing name of a role ("Support owner" is the STAFF seat of the Team page). */
export function roleLabel(role: OrgRole): string {
  return ROLES[role] ?? role;
}

const TYPES: Record<OrgType, string> = {
  COMPANY: "Company",
  SCHOOL: "University",
  BOOTCAMP: "Bootcamp",
  OUTPLACEMENT: "Outplacement",
  CONSULTANCY: "Staffing / consultancy",
};

export function typeLabel(type: OrgType): string {
  return TYPES[type] ?? type;
}
