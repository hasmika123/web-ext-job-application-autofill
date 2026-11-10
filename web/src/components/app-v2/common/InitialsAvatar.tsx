import { cn } from "@kiwiply/ui";
import { TONE, toneFor, type Tone } from "./tones";

export function initialsOf(name: string): string {
  const parts = name
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Coloured circle with initials. Tone defaults to a stable colour per name. */
export default function InitialsAvatar({
  name,
  size = 36,
  tone,
  className,
}: {
  name: string;
  size?: number;
  tone?: Tone;
  className?: string;
}) {
  const t = TONE[tone ?? toneFor(name)];
  return (
    <span
      aria-hidden
      className={cn("inline-grid flex-none place-items-center rounded-full font-bold", t.soft, t.ink, className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {initialsOf(name)}
    </span>
  );
}
