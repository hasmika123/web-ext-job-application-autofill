import type { IconProps } from "../primitives/icons";

/**
 * The glyph the Interviews board uses for a Technical interview: code brackets `</>`. Same contract as every icon in
 * `primitives/icons` (24x24 stroke glyph on currentColor, size 16 by default, `aria-hidden`).
 */
export function CodeBracketsIcon({ size = 16, className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M8 8l-4 4 4 4" />
      <path d="M16 8l4 4-4 4" />
      <path d="M13.5 6l-3 12" />
    </svg>
  );
}
