import { BoardIcon, DashboardIcon, FileTextIcon, GearIcon, InboxIcon, Mark, SearchIcon, cn } from "@kiwiply/ui";
import type { Family } from "../family";
import { LetterTile, MockFrame, StatChip, StatusChip } from "./shared";

/**
 * Dashboard mock: sidebar + applications list + three stat chips, all example data.
 * The sidebar only shows from md up so the mock stays readable at 375px. Spec 7.2 item 7.
 */
const NAV = [
  { icon: DashboardIcon, label: "Dashboard", active: true },
  { icon: SearchIcon, label: "Jobs" },
  { icon: BoardIcon, label: "Applications" },
  { icon: InboxIcon, label: "Inbox" },
  { icon: FileTextIcon, label: "Resumes" },
  { icon: GearIcon, label: "Settings" },
];

const ROWS: { company: string; role: string; status: string; family: Family; when: string }[] = [
  { company: "Northwind", role: "Software Engineer", status: "Interview", family: "green", when: "2 days ago" },
  { company: "Acme Robotics", role: "Product Manager", status: "Applied", family: "blue", when: "4 days ago" },
  { company: "Bluefin Labs", role: "Data Analyst", status: "In review", family: "amber", when: "1 week ago" },
  { company: "Lumen Health", role: "UX Designer", status: "Offer", family: "lime", when: "1 week ago" },
];

const STATS: { label: string; value: string; family: Family }[] = [
  { label: "Applications", value: "12", family: "blue" },
  { label: "Interviews", value: "5", family: "green" },
  { label: "Offers", value: "3", family: "amber" },
];

export default function DashboardMock({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Example dashboard with a navigation sidebar, a list of four applications with their status, and counts of applications, interviews and offers"
      title="My applications"
      className={className}
      bodyClassName="p-0 sm:p-0"
    >
      <div className="grid md:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="hidden bg-v2-navy-deep p-4 md:block">
          <div className="mb-5 flex items-center gap-2 text-[15px] font-bold text-white">
            <Mark size={22} /> Kiwiply
          </div>
          <ul className="space-y-1">
            {NAV.map((n) => (
              <li
                key={n.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium",
                  n.active ? "bg-v2-lime text-v2-navy" : "text-white/75",
                )}
              >
                <n.icon aria-hidden className="h-4 w-4" />
                {n.label}
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0 p-4 sm:p-5">
          <ul className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {STATS.map((s) => (
              <StatChip key={s.label} {...s} />
            ))}
          </ul>
          <ul className="mt-3">
            {ROWS.map((r, i) => (
              <li key={r.company} className={cn("flex items-center gap-3 py-2.5", i > 0 && "border-t border-v2-line/60")}>
                <LetterTile letter={r.company[0]} family={r.family} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold leading-tight text-v2-navy">{r.company}</p>
                  <p className="truncate text-[12px] leading-tight text-v2-muted">{r.role}</p>
                </div>
                <span className="hidden flex-none text-[11.5px] text-v2-muted sm:block">{r.when}</span>
                <StatusChip family={r.family}>{r.status}</StatusChip>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </MockFrame>
  );
}
