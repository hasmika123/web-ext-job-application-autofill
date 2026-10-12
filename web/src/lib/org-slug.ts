/**
 * The join-link address of an organization (`kiwiply.com/join/{slug}/{code}`), derived from its name while the person
 * types. Twin of the API's `OrgSlugs` (3 to 60 lower-case letters, digits and single dashes; accents folded; runs of other
 * characters become one dash). The server stays the authority: it also refuses reserved words and taken addresses and
 * answers a `SLUG_TAKEN` with a `suggestion`, which the create flow shows inline.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 60;

/** A slug from a display name, exactly as the API derives it. */
export function deriveSlug(name: string): string {
  let s = (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > SLUG_MAX) s = s.slice(0, SLUG_MAX).replace(/-+$/g, "");
  if (!s) return "org-team";
  if (s.length < SLUG_MIN) s += "-org";
  return s;
}

/** True when `slug` is well-formed (it may still be reserved or taken: only the server knows). */
export function isWellFormedSlug(slug: string): boolean {
  return slug.length >= SLUG_MIN && slug.length <= SLUG_MAX && /^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/.test(slug) && !slug.includes("--");
}

/** What a person types into the address box becomes a slug as they go: lower-case, spaces and punctuation to dashes, no doubled dashes. */
export function cleanSlugInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX);
}
