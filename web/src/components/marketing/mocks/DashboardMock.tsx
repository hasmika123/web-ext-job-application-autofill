import { BoardIcon, CalendarIcon, ChartIcon, DashboardIcon, GearIcon, SearchIcon, TrophyIcon, UsersIcon, cn } from "@kiwiply/ui";
import BrandLogo from "../BrandLogo";
import { FAMILY, type Family } from "../family";
import { CompanyTile, MockFrame, StatusChip } from "./shared";

/**
 * Dashboard mock (spec 13.2 item 6): navy sidebar + "My Applications" tabs and rows, plus the
 * 12 / 5 / 3 stat chips (rendered by the section beside it, see `DashboardStats`).
 */
const NAV = [
  { icon: DashboardIcon, label: "Dashboard", active: true },
  { icon: SearchIcon, label: "Jobs" },
  { icon: BoardIcon, label: "Applications" },
  { icon: UsersIcon, label: "Interviews" },
  { icon: TrophyIcon, label: "Offers" },
  { icon: ChartIcon, label: "Analytics" },
  { icon: GearIcon, label: "Settings" },
];

const TABS = ["All (248)", "Active (112)", "Interviews (5)", "Offers (3)", "Rejected (88)"];

const ROWS: { company: string; role: string; status: string; family: Family; when: string }[] = [
  { company: "Google", role: "Software Engineer", status: "Interview", family: "blue", when: "2 days ago" },
  { company: "Amazon", role: "SDE Intern", status: "In Review", family: "blue", when: "4 days ago" },
  { company: "Microsoft", role: "Product Manager", status: "Interview", family: "blue", when: "1 week ago" },
  { company: "Airbnb", role: "Frontend Developer", status: "Offer", family: "green", when: "1 week ago" },
];

export default function DashboardMock({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Dashboard preview: a sidebar (Dashboard, Jobs, Applications, Interviews, Offers, Analytics, Settings) and a My Applications list with Google, Amazon, Microsoft and Airbnb applications and their status"
      className={className}
      bodyClassName="p-0 sm:p-0"
    >
      <div className="grid sm:grid-cols-[168px_minmax(0,1fr)]">
        <aside className="bg-v2-navy-deep p-4 sm:rounded-none">
          <div className="mb-4">
            <BrandLogo tone="dark" height={22} />
          </div>
          <ul className="space-y-0.5">
            {NAV.map((n) => (
              <li
                key={n.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium",
                  n.active ? "bg-v2-green/25 text-white" : "text-white/70",
                )}
              >
                <n.icon aria-hidden className="h-4 w-4" />
                {n.label}
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0 p-4 sm:p-5">
          <p className="text-[16px] font-bold text-v2-navy">My Applications</p>
          <ul className="mt-3 flex gap-4 overflow-hidden border-b border-v2-line/70 text-[11.5px] font-medium text-v2-muted">
            {TABS.map((t, i) => (
              <li
                key={t}
                className={cn(
                  "-mb-px flex-none whitespace-nowrap border-b-2 pb-2",
                  i === 0 ? "border-v2-blue font-bold text-v2-blue" : "border-transparent",
                )}
              >
                {t}
              </li>
            ))}
          </ul>
          <ul className="mt-1">
            {ROWS.map((r, i) => (
              <li key={r.company} className={cn("flex items-center gap-3 py-3", i > 0 && "border-t border-v2-line/60")}>
                <CompanyTile name={r.company} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold leading-tight text-v2-navy">{r.company}</p>
                  <p className="truncate text-[12px] leading-tight text-v2-muted">{r.role}</p>
                </div>
                <span className="hidden flex-none text-[11.5px] text-v2-muted sm:block">{r.when}</span>
                <StatusChip family={r.family} className="min-w-[72px] justify-center">
                  {r.status}
                </StatusChip>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </MockFrame>
  );
}

const STATS: { icon: typeof BoardIcon; label: string; value: string; family: Family }[] = [
  { icon: BoardIcon, label: "Applications", value: "12", family: "blue" },
  { icon: UsersIcon, label: "Interviews", value: "5", family: "green" },
  { icon: CalendarIcon, label: "Offers", value: "3", family: "amber" },
];

export function DashboardStats({ className }: { className?: string }) {
  return (
    <ul className={cn("grid grid-cols-3 gap-3 lg:grid-cols-1", className)}>
      {STATS.map((s) => (
        <li
          key={s.label}
          className="flex flex-col items-center gap-2 rounded-[var(--radius-v2-card)] border border-v2-line/60 bg-white p-3 text-center shadow-v2-card lg:flex-row lg:gap-3 lg:text-left"
        >
          <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", FAMILY[s.family].soft, FAMILY[s.family].icon)}>
            <s.icon className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-[20px] font-extrabold leading-none text-v2-navy">{s.value}</span>
            <span className="mt-0.5 block text-[11.5px] text-v2-muted">{s.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
