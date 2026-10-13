"use client";

import type { ComponentType, ReactNode } from "react";
import {
  BriefcaseIcon,
  BuildingIcon,
  ChartIcon,
  GlobeIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HeartIcon,
  LightbulbIcon,
  MemberAvatar,
  RocketIcon,
  ShieldIcon,
  StatePill,
  UsersIcon,
  DollarIcon,
  hasStateMap,
  registerStateMap,
} from "@kiwiply/ui";
import { cn } from "@kiwiply/ui";
import { TONE_TILE, toneOf, type GroupPerson } from "@/lib/ent/groups";

/** Icon name (the API's closed list) -> the `@kiwiply/ui` glyph. */
export const GROUP_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  briefcase: BriefcaseIcon,
  users: UsersIcon,
  building: BuildingIcon,
  chart: ChartIcon,
  heart: HeartIcon,
  rocket: RocketIcon,
  globe: GlobeIcon,
  shield: ShieldIcon,
  graduation: GraduationCapIcon,
  dollar: DollarIcon,
  lightbulb: LightbulbIcon,
  handshake: HandshakeIcon,
};

if (!hasStateMap("group")) registerStateMap("group", { ACTIVE: "green", INACTIVE: "grey" });

export function GroupStatus({ status }: { status: string }) {
  return <StatePill domain="group" state={status} label={status === "INACTIVE" ? "Archived" : "Active"} />;
}

/** The rounded icon tile of a department or team, in its picked tone (brand tones follow the tenant theme). */
export function GroupTile({ icon, color, size = 44, fallback = "users" }: { icon: string | null; color: string | null; size?: number; fallback?: string }) {
  const Icon = GROUP_ICON[icon ?? fallback] ?? UsersIcon;
  return (
    <span aria-hidden data-group-tile style={{ width: size, height: size }} className={cn("inline-grid flex-none place-items-center rounded-xl", TONE_TILE[toneOf(color)])}>
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Up to four avatars overlapped, then "+N". */
export function AvatarStack({ people, total, size = 28 }: { people: GroupPerson[]; total: number; size?: number }) {
  const extra = Math.max(0, total - people.length);
  if (people.length === 0) return <span className="text-[12px] text-muted">No people yet</span>;
  return (
    <span className="inline-flex items-center" role="img" aria-label={`${total} ${total === 1 ? "person" : "people"}`}>
      {people.map((p, i) => (
        <span key={p.memberId} className={cn("rounded-full ring-2 ring-paper", i > 0 && "-ml-1.5")}>
          <MemberAvatar name={p.name} size={size} />
        </span>
      ))}
      {extra > 0 && <span className="ml-1.5 text-[12px] font-semibold text-ink-soft">+{extra}</span>}
    </span>
  );
}

/** One KPI tile. A tile appears only when the API has a real number for it. */
export function Kpi({ icon, label, value, hint, tone = "primary" }: { icon: ReactNode; label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <div data-kpi={label} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-paper p-4">
      <span aria-hidden className={cn("inline-grid h-10 w-10 place-items-center rounded-xl", TONE_TILE[toneOf(tone)])}>
        {icon}
      </span>
      <div className="text-[13px] font-medium text-ink-soft">{label}</div>
      <div className="text-[28px] font-bold leading-none tabular-nums text-ink">{value}</div>
      {hint ? <div className="text-[12px] text-muted">{hint}</div> : null}
    </div>
  );
}
