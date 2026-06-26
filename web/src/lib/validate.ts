/** Minimal, dependency-free field validators for inline form validation. */

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Accepts URLs with or without a scheme (e.g. "linkedin.com/in/x"). Empty = valid (optional). */
export function isUrl(s: string): boolean {
  const v = s.trim();
  if (!v) return true;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}
