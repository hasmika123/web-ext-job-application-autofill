import { BellIcon, SearchIcon, cn } from "@kiwiply/ui";
import type { Family } from "../family";
import { CompanyTile, MockFrame, StatusChip } from "./shared";

/** "Top Job Matches for You": the same three rows as hero slide 1. Spec 13.2 item 4. */
const ROWS: { role: string; company: string; where: string; score: number; family: Family }[] = [
  { role: "Product Designer", company: "Spotify", where: "Remote", score: 98, family: "green" },
  { role: "UX Researcher", company: "Google", where: "New York, NY", score: 92, family: "blue" },
  { role: "Product Manager", company: "Notion", where: "Remote", score: 88, family: "coral" },
];

export default function MatchesMock({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Top job matches preview: Product Designer at Spotify (98% match), UX Researcher at Google (92%) and Product Manager at Notion (88%)"
      title="Top Job Matches for You"
      icon={SearchIcon}
      action="View All"
      className={className}
      bodyClassName="px-3 pb-3 pt-1 sm:px-4"
    >
      <ul>
        {ROWS.map((r, i) => (
          <li key={r.role} className={cn("flex items-center gap-3 py-3.5", i > 0 && "border-t border-v2-line/60")}>
            <CompanyTile name={r.company} className="h-10 w-10 sm:h-11 sm:w-11" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-bold leading-tight text-v2-navy">{r.role}</p>
              <p className="truncate text-[12px] leading-tight text-v2-muted">
                {r.company} · {r.where}
              </p>
            </div>
            <StatusChip family={r.family} className="px-2.5 py-1.5 text-[11.5px] sm:px-3 sm:text-[12px]">
              {r.score}% Match
            </StatusChip>
            <span aria-hidden className="hidden h-8 w-8 flex-none place-items-center rounded-lg bg-v2-green-soft text-v2-green sm:grid">
              <BellIcon className="h-4 w-4" />
            </span>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}
