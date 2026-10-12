/**
 * The honest "~N fields" of the setup payoff (Onboarding v2 R1.9 data, R1.11 screen; ONBOARDING-V2-DESIGN 10,
 * DECISIONS #33f). Pure: how many form fields the extension can fill for this person, computed from what is
 * really in the profile, never a marketing constant. The TS twin of the API's `AutofillCoverage.java`; both run
 * the same fixtures (`__fixtures__/coverage-*.json`, copied byte for byte under `api/src/test/resources/onboarding/`),
 * and `coverage.parity.test.ts` fails when the extension's schema keys change, so it is the test that breaks, not
 * the user's number.
 *
 * - **Direct fields**: the extension's canonical schema keys (`job-autofill/src/lib/schema.js` `FIELDS`) that are
 *   non-blank in the bio. `fullName` counts when first and last name are both set. EEO counts only when answered.
 * - **Repeated fields**: 5 per experience (at most 3), 4 per education (at most 2), 1 when there is a skill.
 */

/** The 31 canonical keys of the extension's schema, in schema order. */
export const AUTOFILL_FIELD_KEYS = [
  "firstName",
  "lastName",
  "fullName",
  "preferredName",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
  "linkedin",
  "github",
  "website",
  "authorizedToWork",
  "requireSponsorship",
  "desiredSalary",
  "noticePeriod",
  "earliestStartDate",
  "workPreference",
  "willingToRelocate",
  "referralSource",
  "summary",
  "skills",
  "coverLetter",
  "gender",
  "race",
  "ethnicity",
  "veteranStatus",
  "disabilityStatus",
] as const;

export const COVERAGE_GROUPS = ["contact", "links", "work", "education", "skills", "preferences", "eeo"] as const;
export type CoverageGroup = (typeof COVERAGE_GROUPS)[number];

export const EXPERIENCE_FIELDS_EACH = 5;
export const EXPERIENCE_MAX_ITEMS = 3;
export const EDUCATION_FIELDS_EACH = 4;
export const EDUCATION_MAX_ITEMS = 2;

const CONTACT = ["firstName", "lastName", "fullName", "preferredName", "email", "phone", "addressLine1", "addressLine2", "city", "state", "postalCode", "country"];
const LINKS = ["linkedin", "github", "website"];
const PREFERENCES = ["authorizedToWork", "requireSponsorship", "desiredSalary", "noticePeriod", "earliestStartDate", "workPreference", "willingToRelocate", "referralSource"];
const EEO = ["gender", "race", "ethnicity", "veteranStatus", "disabilityStatus"];
// The summary and cover letter are the career narrative: they count with the work group.
const WORK_TEXT = ["summary", "coverLetter"];

/** How many live profile items of each repeated kind the profile holds. */
export interface CoverageCounts {
  experience: number;
  education: number;
  skills: number;
}

export interface CoverageResult {
  fields: number;
  groups: Record<CoverageGroup, number>;
}

/** A key with a real value: non-blank text, a number or boolean, or a non-empty array / object. */
function filled(bio: Record<string, unknown> | null | undefined, key: string): boolean {
  const v = bio?.[key];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function present(bio: Record<string, unknown> | null | undefined, keys: string[]): number {
  return keys.filter((k) => (k === "fullName" ? filled(bio, "firstName") && filled(bio, "lastName") : filled(bio, k))).length;
}

export function autofillCoverage(bio: Record<string, unknown> | null | undefined, counts?: Partial<CoverageCounts> | null): CoverageResult {
  const c = { experience: counts?.experience ?? 0, education: counts?.education ?? 0, skills: counts?.skills ?? 0 };
  const groups: Record<CoverageGroup, number> = {
    contact: present(bio, CONTACT),
    links: present(bio, LINKS),
    work: present(bio, WORK_TEXT) + EXPERIENCE_FIELDS_EACH * Math.min(Math.max(0, c.experience), EXPERIENCE_MAX_ITEMS),
    education: EDUCATION_FIELDS_EACH * Math.min(Math.max(0, c.education), EDUCATION_MAX_ITEMS),
    // The schema's "skills" key and the profile's skill items are the same field: counted once.
    skills: filled(bio, "skills") || c.skills >= 1 ? 1 : 0,
    preferences: present(bio, PREFERENCES),
    eeo: present(bio, EEO),
  };
  const fields = COVERAGE_GROUPS.reduce((sum, g) => sum + groups[g], 0);
  return { fields, groups };
}
