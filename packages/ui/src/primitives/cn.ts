/**
 * Minimal className joiner — filters out falsy values and joins with spaces.
 * Deliberately dependency-free (no clsx / tailwind-merge): primitives own their
 * base classes, callers append layout/spacing utilities that don't conflict.
 *
 * Mirror of the web app's `@/lib/cn`; lives here so @kiwiply/ui has no dependency
 * back on the web app. (Primitives get fully unified into the design system in W5.1.)
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
