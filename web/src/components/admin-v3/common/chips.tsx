import type { ReactNode } from "react";
import { BuildingIcon, CrownIcon, EyeIcon, UserIcon, UsersIcon, cn } from "@kiwiply/ui";
import { StatusChip, TONE, type Tone } from "@/components/app-v2/common";

const ROLE: Record<string, { tone: Tone; icon: ReactNode }> = {
  Admin: { tone: "violet", icon: <UserIcon size={13} /> },
  Manager: { tone: "amber", icon: <UsersIcon size={13} /> },
  Member: { tone: "blue", icon: <UsersIcon size={13} /> },
  User: { tone: "blue", icon: <UserIcon size={13} /> },
  Viewer: { tone: "slate", icon: <EyeIcon size={13} /> },
};

/** Role pill with icon: Admin (violet) / Manager (amber) / Member, User (blue) / Viewer (slate). Unknown roles render slate. */
export function RoleChip({ role }: { role: string }) {
  const r = ROLE[role] ?? { tone: "slate" as Tone, icon: null };
  return (
    <StatusChip tone={r.tone}>
      {r.icon}
      {role}
    </StatusChip>
  );
}

const PLAN: Record<string, { tone: Tone; icon: ReactNode }> = {
  Enterprise: { tone: "violet", icon: <BuildingIcon size={13} /> },
  Autopilot: { tone: "violet", icon: <CrownIcon size={13} /> },
  Pro: { tone: "green", icon: <CrownIcon size={13} /> },
  Team: { tone: "blue", icon: <UsersIcon size={13} /> },
  Free: { tone: "slate", icon: <EyeIcon size={13} /> },
};

/** Plan pill with icon: Enterprise/Autopilot (violet) / Pro (green) / Team (blue) / Free (slate). Unknown plans render slate. */
export function PlanChip({ plan }: { plan: string }) {
  const p = PLAN[plan] ?? { tone: "slate" as Tone, icon: null };
  return (
    <StatusChip tone={p.tone}>
      {p.icon}
      {plan}
    </StatusChip>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  Active: "green",
  Healthy: "green",
  Completed: "green",
  Live: "green",
  Pending: "amber",
  "Pending invite": "amber",
  Paused: "amber",
  "Needs attention": "amber",
  Trial: "violet",
  Suspended: "coral",
  Error: "coral",
  Failed: "coral",
  Blocked: "coral",
};

/** Dot + coloured text status. `tone` overrides the built-in label to tone map. */
export function StatusDot({ status, tone, className }: { status: string; tone?: Tone; className?: string }) {
  const t = TONE[tone ?? STATUS_TONE[status] ?? "slate"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium", t.ink, className)}>
      <span aria-hidden className={cn("h-2 w-2 rounded-full", t.solid)} />
      {status}
    </span>
  );
}

/** Small "Sample data" marker for panels/pages whose numbers are illustrative, not live. */
export function SampleTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-v2-amber-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-v2-amber-ink", className)}>
      Sample data
    </span>
  );
}

/** LIVE (lime) / SOON (grey) micro pill. */
export function LivePill({ soon, className }: { soon?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "flex-none rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        soon ? "bg-paper-2 text-ink-soft" : "bg-v2-lime text-v2-navy",
        className,
      )}
    >
      {soon ? "Soon" : "Live"}
    </span>
  );
}
