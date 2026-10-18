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
  amber: "bg-v2-amber-soft text-v2-amber-ink",
  violet: "bg-v2-violet-soft text-v2-violet-ink",
  coral: "bg-v2-coral-soft text-v2-coral-ink",
  green: "bg-v2-green-soft text-v2-green-ink",
  teal: "bg-v2-teal-soft text-v2-teal-ink",
  blue: "bg-[var(--brand-subtle,var(--color-accent-soft))] text-[var(--brand-text,var(--color-accent-deep))]",
} as const;

/** The rounded icon tile of a role row (the board colours them by what the role is for). Decorative: the name is next to it. */
export default function RoleIcon({ role, size = 20, className }: { role: Pick<RoleRow, "key" | "templateKey" | "system">; size?: number; className?: string }) {
  const { icon, tone } = roleIcon(role);
  const Icon = ICONS[icon];
  return (
    <span aria-hidden data-role-icon={icon} className={cn("grid h-[42px] w-[42px] flex-none place-items-center rounded-[12px]", TONES[tone], className)}>
      <Icon size={size} />
    </span>
  );
}
