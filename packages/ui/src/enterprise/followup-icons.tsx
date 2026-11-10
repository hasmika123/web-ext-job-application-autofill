import type { IconProps } from "../primitives/icons";

/**
 * Two glyphs the Follow-ups board needs that the shared icon set lacks: an hourglass ("Waiting on Response") and the
 * Teams channel mark. Same contract as `primitives/icons`: 24x24, `currentColor`, size via `size`.
 */

/** An hourglass: a reply is awaited. */
export function HourglassIcon({ size = 16, className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M6 2h12M6 22h12" />
      <path d="M7 2v4.2a5 5 0 0 0 1.8 3.8L12 12l-3.2 2a5 5 0 0 0-1.8 3.8V22" />
      <path d="M17 2v4.2a5 5 0 0 1-1.8 3.8L12 12l3.2 2a5 5 0 0 1 1.8 3.8V22" />
    </svg>
  );
}

/** The Teams channel mark: a rounded tile with a "T" and a second head-and-shoulders. */
export function TeamsIcon({ size = 16, className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <rect x="2.5" y="6" width="11" height="12" rx="2" />
      <path d="M5.5 9.5h5M8 9.5V15" />
      <circle cx="17.5" cy="7.5" r="2" />
      <path d="M14.5 11.5h6a1 1 0 0 1 1 1V16a3 3 0 0 1-3 3h-.5" />
    </svg>
  );
}
