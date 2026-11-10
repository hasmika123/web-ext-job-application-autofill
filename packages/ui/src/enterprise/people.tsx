import type { ReactNode } from "react";
import { cn } from "../primitives/cn";

/**
 * PersonCell + MemberAvatar + StatusDot (X2.15; promoted from the admin kit, 16 s7). Props-driven and dependency-free:
 * the avatar is initials on a tone chosen from the name, so the same person is always the same colour.
 */

const AVATAR_TONES = [
  "bg-accent-soft text-accent-deep",
  "bg-brown-soft text-brown-deep",
  "bg-paper-2 text-ink",
  "bg-danger/10 text-danger-text",
] as const;

/** "Priya Nair" -> "PN"; one word -> its first two letters; blank -> "?". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function toneIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % AVATAR_TONES.length;
}

export interface MemberAvatarProps {
  name: string;
  size?: number;
  /** Shown instead of initials when present. */
  src?: string | null;
  className?: string;
}

export function MemberAvatar({ name, size = 34, src, className }: MemberAvatarProps) {
  const box = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- packages/ui is framework-free
    return <img src={src} alt="" aria-hidden style={box} className={cn("flex-none rounded-full object-cover", className)} />;
  }
  return (
    <span
      aria-hidden
      data-member-avatar
      style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      className={cn("inline-grid flex-none place-items-center rounded-full font-bold", AVATAR_TONES[toneIndex(name)], className)}
    >
      {initialsOf(name)}
    </span>
  );
}

export interface PersonCellProps {
  /** The display name (a link node is fine). */
  name: ReactNode;
  /** Plain text that seeds the initials and colour. */
  avatarName: string;
  /** A handle, email or role line. */
  sub?: ReactNode;
  size?: number;
  src?: string | null;
  className?: string;
}

export function PersonCell({ name, avatarName, sub, size = 34, src, className }: PersonCellProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <MemberAvatar name={avatarName} size={size} src={src} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13.5px] font-semibold text-ink">{name}</div>
        {sub != null && <div className="truncate text-[12px] text-muted">{sub}</div>}
      </div>
    </div>
  );
}

export type StatusDotTone = "green" | "amber" | "red" | "grey";

const DOT_TONE_OF: Record<string, StatusDotTone> = {
  active: "green",
  healthy: "green",
  completed: "green",
  pending: "amber",
  paused: "amber",
  suspended: "red",
  error: "red",
  failed: "red",
  blocked: "red",
};
const DOT_CLASS: Record<StatusDotTone, string> = { green: "bg-accent", amber: "bg-warn", red: "bg-danger", grey: "bg-muted" };

export function statusDotTone(status: string): StatusDotTone {
  return DOT_TONE_OF[status.trim().toLowerCase()] ?? "grey";
}

export interface StatusDotProps {
  status: string;
  tone?: StatusDotTone;
  className?: string;
}

/** A coloured dot and the status word: colour is never the only signal. */
export function StatusDot({ status, tone, className }: StatusDotProps) {
  const t = tone ?? statusDotTone(status);
  return (
    <span data-status-dot={t} className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft", className)}>
      <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", DOT_CLASS[t])} />
      {status}
    </span>
  );
}
