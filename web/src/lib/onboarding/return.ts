/**
 * `?return=` on `/profiles/setup` is where the payoff's "Build a resume" goes (the new-resume chooser sends
 * `?return=/resume-builder%3Fnew%3Dprofile`, ONBOARDING-V2-DESIGN 4 / 5.11). It must be a path on this site: anything else
 * (another origin, a protocol-relative `//host`, a backslash trick, a control character) is dropped and the default is used.
 */
export function safeReturn(value: string | string[] | undefined | null): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 32) return null; // config-literal-ok: ASCII control characters
  return v;
}
