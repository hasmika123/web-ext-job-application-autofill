import { cn } from "@kiwiply/ui";
import type { Family } from "../family";
import { FAMILY } from "../family";
import { LetterTile, StatusChip } from "./shared";

/**
 * "Organization Dashboard" mock (spec 13.2 item 9): four stat tiles over a "Team Activity" table
 * (Applications / Interviews / Offers / Status). The /organizations page has its own fuller table.
 */
const STATS: { value: string; label: string; family: Family }[] = [
  { value: "248", label: "Applications", family: "blue" },
  { value: "32", label: "Interviews", family: "blue" },
  { value: "5", label: "Offers", family: "blue" },
  { value: "12", label: "Active Employees", family: "blue" },
];

const ROWS: { name: string; apps: number; interviews: number; offers: number; status: string; family: Family; tint: Family }[] = [
  { name: "Priya S.", apps: 24, interviews: 4, offers: 1, status: "Active", family: "green", tint: "pink" },
  { name: "Jason T.", apps: 18, interviews: 2, offers: 0, status: "Active", family: "green", tint: "blue" },
  { name: "Maya K.", apps: 30, interviews: 5, offers: 2, status: "Active", family: "green", tint: "violet" },
  { name: "Rohit A.", apps: 12, interviews: 1, offers: 0, status: "In Review", family: "coral", tint: "amber" },
];

export default function OrgTableMock({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Organization dashboard preview: 248 applications, 32 interviews, 5 offers and 12 active employees, with a Team Activity table for Priya S., Jason T., Maya K. and Rohit A."
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden rounded-[var(--radius-v2-card)] border border-v2-line/70 bg-white p-4 shadow-v2-float sm:p-5",
        className,
      )}
    >
      <p className="text-[15px] font-bold text-v2-navy">Organization Dashboard</p>
      <ul className="mt-3 grid grid-cols-4 gap-2">
        {STATS.map((s) => (
          <li key={s.label} className={cn("rounded-xl px-1.5 py-2 text-center", FAMILY[s.family].soft)}>
            <p className="text-[17px] font-extrabold leading-none text-v2-navy sm:text-[19px]">{s.value}</p>
            <p className="mt-1 text-[10px] leading-tight text-v2-ink-soft">{s.label}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[14px] font-bold text-v2-navy">Team Activity</p>
      <table className="mt-2 w-full table-fixed border-separate border-spacing-0 text-left text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] font-medium text-v2-muted">
            <th scope="col" className="w-[28%] pb-2 pl-1 font-medium sm:w-[30%]">
              <span className="sr-only">Name</span>
            </th>
            <th scope="col" className="pb-2 text-center font-medium">
              <span className="sm:hidden">Apps</span>
              <span className="hidden sm:inline">Applic&shy;ations</span>
            </th>
            <th scope="col" className="pb-2 text-center font-medium">
              Interviews
            </th>
            <th scope="col" className="pb-2 text-center font-medium">
              Offers
            </th>
            <th scope="col" className="w-[24%] pb-2 text-center font-medium sm:w-[21%]">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.name}>
              <td className="border-t border-v2-line/60 py-2 pl-1">
                <span className="flex items-center gap-2">
                  <LetterTile letter={r.name[0]} family={r.tint} className="hidden h-6 w-6 rounded-full text-[11px] sm:grid" />
                  <span className="truncate font-semibold text-v2-navy">{r.name}</span>
                </span>
              </td>
              <td className="border-t border-v2-line/60 py-2 text-center text-v2-ink-soft">{r.apps}</td>
              <td className="border-t border-v2-line/60 py-2 text-center text-v2-ink-soft">{r.interviews}</td>
              <td className="border-t border-v2-line/60 py-2 text-center text-v2-ink-soft">{r.offers}</td>
              <td className="border-t border-v2-line/60 py-2 text-center">
                <StatusChip family={r.family} className="px-2 py-1 text-[10.5px]">
                  {r.status}
                </StatusChip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
