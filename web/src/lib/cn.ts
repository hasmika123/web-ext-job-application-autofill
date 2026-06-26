/**
 * Minimal className joiner — filters out falsy values and joins with spaces.
 * Deliberately dependency-free (no clsx / tailwind-merge): primitives own their
 * base classes, callers append layout/spacing utilities that don't conflict.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
