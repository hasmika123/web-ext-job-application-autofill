import type { ComponentType } from "react";
import {
  AlertIcon, BarChartIcon, BellIcon, BoardIcon, BriefcaseIcon, BuildingIcon, CalendarCheckIcon, ChartIcon, CheckCircleIcon, ClipboardCheckIcon,
  ClockIcon, CreditCardIcon, DollarIcon, FileTextIcon, GearIcon, GlobeIcon, HandshakeIcon, HeartIcon, HomeIcon, KeyIcon, LayersIcon, MailIcon,
  NetworkIcon, RefreshIcon, RouteIcon, SearchIcon, SendIcon, ShieldCheckIcon, ShieldIcon, SignOutIcon, SparklesIcon, TargetIcon, TrendingUpIcon,
  TrophyIcon, UserIcon, UsersIcon, WebhookIcon,
  type IconProps,
} from "@kiwiply/ui";

/** The icon names the workspace definitions use (`NavItem.icon`, without the `Icon` suffix) -> `@kiwiply/ui` glyphs. */
const ICONS: Record<string, ComponentType<IconProps>> = {
  Alert: AlertIcon, BarChart: BarChartIcon, Bell: BellIcon, Board: BoardIcon, Briefcase: BriefcaseIcon, Building: BuildingIcon,
  CalendarCheck: CalendarCheckIcon, Chart: ChartIcon, CheckCircle: CheckCircleIcon, ClipboardCheck: ClipboardCheckIcon, Clock: ClockIcon,
  CreditCard: CreditCardIcon, Dollar: DollarIcon, FileText: FileTextIcon, Gear: GearIcon, Globe: GlobeIcon, Handshake: HandshakeIcon,
  Heart: HeartIcon, Home: HomeIcon, Key: KeyIcon, Layers: LayersIcon, Mail: MailIcon, Network: NetworkIcon, Refresh: RefreshIcon,
  Route: RouteIcon, Search: SearchIcon, Send: SendIcon, Shield: ShieldIcon, ShieldCheck: ShieldCheckIcon, SignOut: SignOutIcon,
  Sparkles: SparklesIcon, Target: TargetIcon, TrendingUp: TrendingUpIcon, Trophy: TrophyIcon, User: UserIcon, Users: UsersIcon, Webhook: WebhookIcon,
};

/** One menu glyph by its data name; an unknown name falls back to a plain page icon (a new page never renders a hole). */
export function NavIcon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const Icon = ICONS[name] ?? FileTextIcon;
  return <Icon size={size} className={className} />;
}
