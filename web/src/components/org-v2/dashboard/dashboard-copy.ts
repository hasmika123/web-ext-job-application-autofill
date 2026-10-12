/**
 * The words of the org dashboard: how the checklist rows read, what to call a group in each kind of organization, and how an
 * audit key is worded in the recent-activity feed. Pure, so it is unit-tested and never drifts between the page and its tests.
 */
import type { Tone } from "@/components/app-v2/common/tones";
import type { OnboardingItem, OrgType } from "@/lib/org-types";

export type GroupKind = "COHORT" | "DEPARTMENT" | "TEAM";

/** What a school or bootcamp calls its groups ("cohort"), a company ("department"), everyone else ("team"). */
export function groupWord(type: OrgType): { kind: GroupKind; singular: string; plural: string } {
  if (type === "BOOTCAMP" || type === "SCHOOL") return { kind: "COHORT", singular: "cohort", plural: "cohorts" };
  if (type === "COMPANY") return { kind: "DEPARTMENT", singular: "department", plural: "departments" };
  return { kind: "TEAM", singular: "team", plural: "teams" };
}

export interface ChecklistRowCopy {
  title: string;
  /** The line under the title: the live numbers, or what the row is for. */
  detail: string;
}

/** The checklist rows, worded with the live counts ("38 of 60 joined"). */
export function rowCopy(item: OnboardingItem, type: OrgType): ChecklistRowCopy {
  const g = groupWord(type);
  const of = (what: string) => (item.count != null && item.total != null && item.total > 0 ? `${item.count} of ${item.total} ${what}` : null);
  switch (item.key) {
    case "activate":
      return item.done
        ? { title: "Workspace activated", detail: "You can invite people." }
        : { title: "Activate your workspace", detail: "Until then it's a draft: you can set things up, but not invite people." };
    case "groups":
      return item.done
        ? { title: `Your ${g.plural}`, detail: `${item.count ?? 0} added. Add another any time.` }
        : { title: `Add your first ${g.singular}`, detail: `People are grouped by ${g.singular}, so you can see how each one is doing.` };
    case "profile":
      return { title: "Add your organization's details", detail: "A website and a logo make invites feel trustworthy." };
    case "admins":
      return { title: "Invite your co-admins", detail: of("joined") ?? "Up to three people can help you set up." };
    case "invite":
      return { title: "Invite your people", detail: of("joined") ?? "A link, a QR code or a list of emails." };
    case "plans":
      return { title: "Assign plans", detail: "Choose who gets Pro, Autopilot or interview practice." };
    case "owners":
      return { title: "Pick support owners", detail: "Staff who look after a handful of people each." };
    case "domain":
      return { title: "Verify your email domain", detail: "Optional. Lets people with a school or company email join in one tap." };
  }
}

/** How an audit key reads in the feed. Unknown keys are worded plainly rather than shown raw. */
export function activityCopy(action: string, mine: boolean): { title: string; tone: Tone } {
  const who = mine ? "You" : "Someone on your team";
  switch (action) {
    case "ORG_CREATE":
      return { title: "Workspace created", tone: "green" };
    case "ORG_SETTINGS":
      return { title: `${who} updated the workspace details`, tone: "blue" };
    case "BILLING_DEV_ACTIVATED":
      return { title: "Workspace activated", tone: "green" };
    case "ORG_CLOSE":
      return { title: `${who} closed the workspace`, tone: "coral" };
    case "GROUP_CREATE":
      return { title: `${who} added a group`, tone: "violet" };
    case "GROUP_UPDATE":
      return { title: `${who} changed a group`, tone: "violet" };
    case "GROUP_DELETE":
      return { title: `${who} removed a group`, tone: "slate" };
    default:
      return { title: `${who} made a change`, tone: "slate" };
  }
}

/** The pipeline stages as the dashboard labels and colours them. */
export const STAGE_LABEL: Record<string, string> = { APPLIED: "Applied", IN_REVIEW: "In review", INTERVIEW: "Interviewing", OFFER: "Offer", REJECTED: "Rejected" };
export const STAGE_TONE: Record<string, Tone> = { APPLIED: "blue", IN_REVIEW: "violet", INTERVIEW: "amber", OFFER: "teal", REJECTED: "slate" };
