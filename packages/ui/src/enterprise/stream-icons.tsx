import type { ReactNode, SVGProps } from "react";

/**
 * Glyphs of the Job Streams board that the shared icon set does not have (database cylinder, folder). Same contract as
 * `primitives/icons`: 24x24 stroke glyphs on `currentColor`, `size` in px (default 16), decorative (`aria-hidden`).
 */
export interface StreamIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function glyph(name: string, node: ReactNode) {
  function Icon({ size = 16, className, ...props }: StreamIconProps) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        {node}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const DatabaseIcon = glyph(
  "DatabaseIcon",
  <>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
    <path d="M4.5 5.5v6.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5.5" />
    <path d="M4.5 12v6.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V12" />
  </>,
);

export const FolderIcon = glyph(
  "FolderIcon",
  <>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.3h7.4A2.5 2.5 0 0 1 21 9.8v7.7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
    <path d="M9 14h6" />
  </>,
);
