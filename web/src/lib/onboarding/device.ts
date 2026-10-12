/**
 * What kind of device the setup is on, from the user agent (Onboarding v2 R1.10 / R1.11): a phone gets the one big
 * "Choose a file" button with no drag copy and the laptop note instead of the extension card (DESIGN 5.3, 5.11, 15).
 * The server never renders these screens (they mount after the draft reconcile), so reading `navigator` is safe.
 */
const PHONE = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i;

/** A phone or tablet browser: no drag and drop, and no desktop extension to install. */
export function isPhoneUa(ua: string | undefined = typeof navigator === "undefined" ? undefined : navigator.userAgent): boolean {
  return !!ua && PHONE.test(ua);
}
