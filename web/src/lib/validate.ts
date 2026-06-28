/** Minimal, dependency-free field validators for inline form validation. */

/**
 * Shared field limits — used both as input `maxLength` caps and in validation messages.
 * Where the backend also enforces a limit, these mirror it so the client never lets through
 * something the API will reject:
 *   - username → JHipster login `@Size(max=50)`
 *   - email    → `@Size(max=254)`
 *   - password → ManagedUserVM PASSWORD_MIN/MAX_LENGTH (4–100)
 *   - resume label → ResumeDTO `@Size(max=200)` (we keep the UI tidier at 100)
 * The rest (names, phone, URLs, skills) bound the opaque bio/resume JSON the API stores.
 */
export const LIMITS = {
  username: 50,
  emailMax: 254,
  passwordMin: 4,
  passwordMax: 100,
  name: 100,
  phone: 40,
  url: 2048,
  address: 200,
  resumeLabel: 100,
  resumeLabelServer: 200,
  skill: 60,
  text: 200,
  summary: 5000,
  bullet: 2000,
} as const;

export function isEmail(s: string): boolean {
  const v = s.trim();
  return v.length <= LIMITS.emailMax && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Accepts URLs with or without a scheme (e.g. "linkedin.com/in/x"). Empty = valid (optional). */
export function isUrl(s: string): boolean {
  const v = s.trim();
  if (!v) return true;
  if (v.length > LIMITS.url) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

// A login the backend accepts (the non-email branch of JHipster's LOGIN_REGEX): letters,
// digits, and . _ - @ + — 1..50 chars. Stricter than the full regex, but always a valid login.
const USERNAME_RE = /^[A-Za-z0-9._@+-]+$/;

export function isUsername(s: string): boolean {
  const v = s.trim();
  return v.length >= 1 && v.length <= LIMITS.username && USERNAME_RE.test(v);
}

/** Loose phone check: digits plus + - ( ) . and spaces, at least 7 chars. Empty = valid. */
export function isPhone(s: string): boolean {
  const v = s.trim();
  if (!v) return true;
  return v.length <= LIMITS.phone && /^[0-9+()\-.\s]{7,}$/.test(v);
}
