/**
 * The consultant contact fields shared by the consultant's own Profile page, the Org Admin Consultants drawer and the marketer's read-only view:
 * a work phone, an IANA time zone and a preferred-contact label. Contact data only, never an identity document, SSN, bank or tax number, or date
 * of birth. The API validates the same rules (ConsultantContact); this file only lets the forms refuse early.
 */

export const PREFERRED_CONTACTS = [
  { value: "EMAIL", label: "E-mail" },
  { value: "PHONE", label: "Phone call" },
  { value: "TEXT", label: "Text message" },
] as const;

export const TIME_ZONES: readonly { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Toronto", label: "Eastern (Toronto)" },
  { value: "America/Vancouver", label: "Pacific (Vancouver)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export function preferredLabel(code: string | null | undefined): string | null {
  return PREFERRED_CONTACTS.find((p) => p.value === code)?.label ?? null;
}

export function timeZoneLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return TIME_ZONES.find((z) => z.value === id)?.label ?? id;
}

/** Null when fine (blank is fine: it clears the field), else a short message. Mirrors the API rule. */
export function checkPhone(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (!/^[0-9+()\- ]{1,32}$/.test(t)) return "Use digits, +, spaces, dashes and parentheses only.";
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits < 7 || digits > 15) return "A phone number has between 7 and 15 digits.";
  return null;
}
