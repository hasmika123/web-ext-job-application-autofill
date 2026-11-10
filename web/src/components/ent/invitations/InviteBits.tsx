import { initialsOf, cn } from "@kiwiply/ui";
import type { InviteStatus } from "@/lib/ent/invitations";

/* The board's avatar tints (initials on a pale disc) and the status pills with their leading dot. Local to this page. */
const TONES = [
  "bg-[var(--inv-purple-soft)] text-[var(--inv-purple-ink)]",
  "bg-accent-soft text-accent-deep",
  "bg-v2-coral-soft text-v2-coral-ink",
  "bg-v2-green-soft text-v2-green-ink",
  "bg-v2-amber-soft text-v2-amber-ink",
] as const;

function toneOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export function InviteAvatar({ name, size = 30, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-member-avatar
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.37)) }}
      className={cn("inline-grid flex-none place-items-center rounded-full font-bold", toneOf(name), className)}
    >
      {initialsOf(name)}
    </span>
  );
}

const PILL: Record<InviteStatus, { box: string; dot: string }> = {
  PENDING: { box: "bg-v2-amber-soft text-v2-amber-ink", dot: "bg-v2-amber" },
  ACCEPTED: { box: "bg-v2-green-soft text-v2-green-ink", dot: "bg-v2-green" },
  EXPIRED: { box: "bg-v2-coral-soft text-v2-coral-ink", dot: "bg-v2-coral" },
  REVOKED: { box: "bg-paper-2 text-ink-soft", dot: "bg-muted" },
};

export function InviteStatusPill({ status, label }: { status: InviteStatus; label: string }) {
  const t = PILL[status];
  return (
    <span data-state-pill="invitation" className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[13px] font-medium leading-none", t.box)}>
      <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", t.dot)} />
      {label}
    </span>
  );
}
