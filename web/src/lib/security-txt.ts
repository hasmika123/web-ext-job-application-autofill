import { SITE_URL } from "@/lib/site";

/**
 * kiwiply.com/.well-known/security.txt (RFC 9116; gap D-5): where a security researcher reports a vulnerability. Platform hosts only: a
 * consultancy's own domain never names Kiwiply (the route answers 404 there).
 *
 * `EXPIRES` is a fixed date on purpose (RFC 9116 asks for one under a year ahead, so a stale file is visibly stale). The test fails 30 days
 * before it, as the reminder to review the contact and move the date.
 */
export const SECURITY_CONTACT = "mailto:support@kiwiply.com";
export const SECURITY_TXT_EXPIRES = "2027-11-18T00:00:00.000Z";
export const SECURITY_TXT_PATH = "/.well-known/security.txt";

export function securityTxt(): string {
  return [
    `Contact: ${SECURITY_CONTACT}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    "Preferred-Languages: en",
    `Canonical: ${SITE_URL}${SECURITY_TXT_PATH}`,
    "",
  ].join("\n");
}
