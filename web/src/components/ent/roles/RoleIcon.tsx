import { BarChartIcon, BriefcaseIcon, CrownIcon, DollarIcon, HandshakeIcon, KeyIcon, ShieldIcon, UsersIcon, cn } from "@kiwiply/ui";
import { roleIcon, type RoleRow } from "@/lib/ent/roles";

const ICONS = {
  crown: CrownIcon,
  users: UsersIcon,
  briefcase: BriefcaseIcon,
  handshake: HandshakeIcon,
  chart: BarChartIcon,
  dollar: DollarIcon,
  shield: ShieldIcon,
  key: KeyIcon,
  heart: UsersIcon,
} as const;

const TONES = {
  brand: "bg-[var(--brand-subtle,var(--color-accent-soft))] text-[var(--brand-text,var(--color-accent-deep))]",
  brand2: "bg-[var(--brand-2-subtle,var(--color-paper-2))] text-[var(--brand-2-text,var(--color-ink-soft))]",
  warm: "bg-brown-soft text-brown-deep",
} as const;

/** The rounded icon tile of a role row (the board colours them by what the role is for). Decorative: the name is next to it. */
export default function RoleIcon({ role, size = 20, className }: { role: Pick<RoleRow, "key" | "templateKey" | "system">; size?: number; className?: string }) {
  const { icon, tone } = roleIcon(role);
  const Icon = ICONS[icon];
  return (
    <span aria-hidden data-role-icon={icon} className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", TONES[tone], className)}>
      <Icon size={size} />
    </span>
  );
}
