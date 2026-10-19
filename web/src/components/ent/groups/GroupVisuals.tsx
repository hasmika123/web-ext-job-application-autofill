"use client";

import type { ComponentType } from "react";
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
  UsersIcon,
  DollarIcon,
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

/** The board's status chip: a soft green pill with green text (archived is the same shape in grey). */
export function GroupStatus({ status }: { status: string }) {
  const off = status === "INACTIVE";
  return (
    <span data-group-status={status} className={cn("inline-flex items-center rounded-lg px-2.5 py-0.5 text-[12px] font-semibold leading-5", off ? "bg-paper-2 text-ink-soft" : "bg-v2-green-soft text-v2-green-ink")}>
      {off ? "Archived" : "Active"}
    </span>
  );
}

/** The rounded icon tile of a department or team, in its picked tone (brand tones follow the tenant theme). */
export function GroupTile({ icon, color, size = 44, fallback = "users" }: { icon: string | null; color: string | null; size?: number; fallback?: string }) {
  const Icon = GROUP_ICON[icon ?? fallback] ?? UsersIcon;
  return (
    <span aria-hidden data-group-tile style={{ width: size, height: size }} className={cn("inline-grid flex-none place-items-center", size >= 40 ? "rounded-[12px]" : "rounded-lg", TONE_TILE[toneOf(color)])}>
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Up to four avatars overlapped, then a "+N" chip (the board's pale pill). */
export function AvatarStack({ people, total, size = 28 }: { people: GroupPerson[]; total: number; size?: number }) {
  const extra = Math.max(0, total - people.length);
  if (people.length === 0) return <span className="text-[12px] text-muted">No people yet</span>;
  return (
    <span className="inline-flex items-center" role="img" aria-label={`${total} ${total === 1 ? "person" : "people"}`}>
      {people.map((p, i) => (
        <span key={p.memberId} className={cn("rounded-full ring-2 ring-white", i > 0 && "-ml-2")}>
          <MemberAvatar name={p.name} size={size} />
        </span>
      ))}
      {extra > 0 && <span className="-ml-1 inline-flex h-7 items-center rounded-full bg-accent-soft/70 px-2 pl-3 text-[12px] font-semibold text-ink-soft">+{extra}</span>}
    </span>
  );
}
