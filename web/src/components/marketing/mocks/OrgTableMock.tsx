import type { Family } from "../family";
import { MockFrame, StatChip, StatusChip } from "./shared";

/**
 * Compact team-progress mock for the landing teaser (the /organizations page has its own fuller
 * table). Three columns so it needs no stacking at 375px. Spec 7.2 item 10.
 */
const ROWS: { name: string; stage: string; family: Family; last: string }[] = [
  { name: "Jordan L.", stage: "Interviewing", family: "green", last: "2 days ago" },
  { name: "Maya R.", stage: "Applying", family: "blue", last: "1 day ago" },
  { name: "Devon P.", stage: "Offer", family: "lime", last: "3 days ago" },
  { name: "Riley C.", stage: "In review", family: "amber", last: "Today" },
];

const STATS: { label: string; value: string; family: Family }[] = [
  { label: "Applications", value: "248", family: "blue" },
  { label: "Interviews", value: "32", family: "green" },
  { label: "Offers", value: "5", family: "amber" },
];

export default function OrgTableMock({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Example team dashboard with application, interview and offer counts and four consultants with their stage and last activity"
      title="Team overview"
      className={className}
    >
      <ul className="grid grid-cols-3 gap-2.5">
        {STATS.map((s) => (
          <StatChip key={s.label} {...s} />
        ))}
      </ul>
      <table className="mt-3 w-full table-fixed border-separate border-spacing-0 text-left text-[13px]">
        <thead>
          <tr className="text-[11.5px] font-semibold text-v2-muted">
            <th scope="col" className="w-[36%] border-b border-v2-line px-1 pb-2">
              Consultant
            </th>
            <th scope="col" className="w-[36%] border-b border-v2-line px-1 pb-2">
              Stage
            </th>
            <th scope="col" className="border-b border-v2-line px-1 pb-2">
              Last activity
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.name}>
              <td className="truncate border-b border-v2-line/60 px-1 py-2.5 font-semibold text-v2-navy">{r.name}</td>
              <td className="border-b border-v2-line/60 px-1 py-2.5">
                <StatusChip family={r.family}>{r.stage}</StatusChip>
              </td>
              <td className="truncate border-b border-v2-line/60 px-1 py-2.5 text-v2-ink-soft">{r.last}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </MockFrame>
  );
}
