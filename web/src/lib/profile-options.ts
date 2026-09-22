/**
 * Answer lists and profile keys shared by the profile editor (`BioEditor`) and onboarding
 * (`/welcome`). The values are what the extension fills into application forms, so both
 * surfaces must write the same strings (the dossier "no guessing" rule).
 */

export type Bio = Record<string, unknown>;

export const YESNO = ["Yes", "No"];

// Job preferences (Phase 10.3a). Fixed lists where the answer is a choice, so the value the
// extension fills is one an application's own dropdown is likely to offer word for word.
export const NOTICE = ["Immediately", "1 week", "2 weeks", "3 weeks", "1 month", "2 months", "3 months"];
export const WORK_PREFERENCE = ["Remote", "Hybrid", "On-site"];

export const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
export const HISPANIC = ["Yes", "No", "Prefer not to say"];
export const RACES = [
  "American Indian or Alaska Native", "Asian", "Black or African American",
  "Hispanic or Latino", "Native Hawaiian or Other Pacific Islander", "White",
  "Two or More Races", "Prefer not to say",
];
export const VETERAN = [
  "I am not a protected veteran",
  "I identify as one or more classifications of a protected veteran",
  "Prefer not to say",
];
export const DISABILITY = [
  "Yes, I have a disability (or previously had one)",
  "No, I do not have a disability",
  "Prefer not to answer",
];

/**
 * Set (ISO time) when the user finishes OR skips onboarding. Lives in the bio payload like
 * everything else; the extension ignores it (its fill whitelist doesn't include it).
 */
export const ONBOARDED_KEY = "onboardedAt";

function has(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/**
 * Should the dashboard send this user to `/welcome`? Only once: never after they've finished
 * or skipped it, and not for someone who already answered the work-authorization question
 * (they set up their profile before onboarding existed).
 */
export function needsOnboarding(bio: Bio): boolean {
  return !has(bio[ONBOARDED_KEY]) && !has(bio.authorizedToWork);
}

/** Parse the server's opaque `payload` into a bio object; anything unreadable is an empty bio. */
export function parseBioPayload(dto: { payload?: string } | null): Bio {
  if (!dto?.payload) return {};
  try {
    const parsed = JSON.parse(dto.payload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Bio) : {};
  } catch {
    return {};
  }
}
