/** A same-site path only: one leading slash, no scheme, no backslash, short. Anything else is ignored (never an open redirect). */
export function safeReturnTo(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.includes("\\") || v.includes("://") || v.length > 200) return undefined;
  return v;
}
