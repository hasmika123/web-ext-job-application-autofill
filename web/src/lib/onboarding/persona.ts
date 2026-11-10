/**
 * The persona lens (Onboarding v2 R1.10 / R1.11, ONBOARDING-V2-DESIGN 3.2, DECISIONS #33d). Who the person says they
 * are changes what we ask and in what order, never what is possible: a persona reorders and rewords, hides a
 * question behind "Show all questions", and pre-fills nothing into the profile. Pure data and pure functions; the
 * screens (`PersonaStep`, `SourceStep`, `PrefsFlow`) read the tables from here.
 */
import type { FreshGoalId } from "@/lib/profile-options";
import type { Persona } from "@/lib/profile-setup/state";

export type { Persona };

/** The chips of the `hello` screen, in display order (DESIGN 5.2). The icons are drawn by `PersonaStep`. */
export const PERSONA_CHIPS: { id: Persona; label: string }[] = [
  { id: "student", label: "Student / Internship" },
  { id: "first_job", label: "First job" },
  { id: "switching", label: "Switching careers" },
  { id: "experienced", label: "Experienced" },
];

/** The words for the `persona` analytics prop and for a screen reader; never shown as a heading. */
export const personaLabel = (p: Persona): string => PERSONA_CHIPS.find((c) => c.id === p)?.label ?? p;

/** Students and first-job seekers often have no resume yet: the source screen leads with "Start fresh" for them (DESIGN 5.3). */
export function leadsWithFresh(persona: Persona | null): boolean {
  return persona === "student" || persona === "first_job";
}

/** The two secondary ways in under the upload hero, in the order the persona sees them. */
export function sourceOrder(persona: Persona | null): ("paste" | "fresh")[] {
  return leadsWithFresh(persona) ? ["fresh", "paste"] : ["paste", "fresh"];
}

/** The line above the secondary chips: "No file handy?", or the warmer one for people who may have no resume. */
export function sourceHeader(persona: Persona | null): string {
  return leadsWithFresh(persona) ? "No resume yet? Totally fine." : "No file handy?";
}

/** The guided "Start fresh" goal chip, pre-filled from the persona (still changeable). */
export function freshGoalFor(persona: Persona | null): FreshGoalId | "" {
  switch (persona) {
    case "student":
      return "internship";
    case "first_job":
      return "first-job";
    case "switching":
      return "switch";
    case "experienced":
      return "same";
    default:
      return "";
  }
}

// ---- the six application questions (DESIGN 3.2 / 5.9) ---------------------------------------------

/** A question is identified by its first bio key (the self-identification block by `gender`). */
export type PrefId = "authorizedToWork" | "requireSponsorship" | "desiredSalary" | "noticePeriod" | "workPreference" | "gender";

/** The `/welcome` order, used when there is no persona. */
const DEFAULT_ORDER: PrefId[] = ["authorizedToWork", "requireSponsorship", "desiredSalary", "noticePeriod", "workPreference", "gender"];

const ORDER: Record<Persona, { shown: PrefId[]; hidden: PrefId[] }> = {
  student: { shown: ["authorizedToWork", "requireSponsorship", "workPreference", "noticePeriod", "gender"], hidden: ["desiredSalary"] },
  first_job: { shown: ["authorizedToWork", "requireSponsorship", "desiredSalary", "noticePeriod", "workPreference", "gender"], hidden: [] },
  switching: { shown: ["authorizedToWork", "requireSponsorship", "workPreference", "desiredSalary", "noticePeriod", "gender"], hidden: [] },
  experienced: { shown: ["authorizedToWork", "requireSponsorship", "noticePeriod", "desiredSalary", "workPreference", "gender"], hidden: [] },
};

/** The questions the persona is asked, in order, and the ones it hides behind "Show all questions". EEO is always last. */
export function prefOrder(persona: Persona | null): { shown: PrefId[]; hidden: PrefId[] } {
  return persona ? ORDER[persona] : { shown: DEFAULT_ORDER, hidden: [] };
}

/** The one-line tip under the first question of a persona (DESIGN 3.2 "Tips"); null for no persona (the `/welcome` "why" lines stand). */
export function prefTip(persona: Persona | null): string | null {
  switch (persona) {
    case "student":
      return "Internship forms ask this on page one.";
    case "first_job":
      return "Most entry-level forms ask these five.";
    case "switching":
      return "Career-change applications ask about relocation and start dates more often.";
    case "experienced":
      return "Senior roles nearly always ask notice and salary.";
    default:
      return null;
  }
}

/** What a persona rewords on a question (DESIGN 5.9 table); a missing field keeps the `/welcome` wording. */
export interface PrefRewrite {
  title?: string;
  why?: string;
  /** Salary: the hint under the box. */
  hint?: string;
  /** Start date: the persona asks with "Right away" / "After I graduate" chips and a month. */
  startChips?: boolean;
}

export function prefRewrite(persona: Persona | null, id: PrefId): PrefRewrite {
  if (id === "noticePeriod" && (persona === "student" || persona === "first_job")) {
    return { title: "When could you start?", why: "Forms ask it as a start date or availability.", startChips: true };
  }
  if (id === "desiredSalary" && persona === "first_job") return { hint: "A range is fine, e.g. $45–55k" };
  if (id === "gender") return { why: "Optional. Only filled where a form asks, and you review each one." };
  return {};
}

/** The start-date chips of the student / first-job wording and the notice option each one is stored as (DECISIONS #33d). */
export const START_RIGHT_AWAY = "Right away";
export const START_AFTER_GRAD = "After I graduate";
export const START_NOTICE_FOR_NOW = "Immediately";

/** The notice option nearest a month a person could start (`YYYY-MM`, or `YYYY` counted from its January): `NOTICE` is Immediately … 3 months. */
export function noticeForMonth(month: string, now: Date = new Date()): string {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(month);
  if (!m) return START_NOTICE_FOR_NOW;
  const monthsAway = (Number(m[1]) - now.getFullYear()) * 12 + ((m[2] ? Number(m[2]) : 1) - 1 - now.getMonth());
  if (monthsAway <= 0) return "Immediately";
  if (monthsAway === 1) return "1 month";
  if (monthsAway === 2) return "2 months";
  return "3 months";
}
