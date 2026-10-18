import { MoreHorizontalIcon, UserIcon, cn } from "@kiwiply/ui";
import type { Family } from "../family";
import { CompanyTile, StatusChip } from "./shared";

/**
 * "Top Job Matches for You" card, as on the board: a user-icon tile + title + "View All ···" on the
 * header row, then three match rows (company mark, role / company · place, "NN% Match" chip, small
 * user tile). The card is its own size container (`@container`), so it adapts to the column it
 * sits in: the trailing user tile appears once the card is at least 400px wide.
 */
const ROWS: { role: string; company: string; where: string; score: number; family: Family }[] = [
  { role: "Product Designer", company: "Spotify", where: "Remote", score: 98, family: "green" },
  { role: "UX Researcher", company: "Google", where: "New York, NY", score: 92, family: "blue" },
  { role: "Product Manager", company: "Notion", where: "Remote", score: 88, family: "coral" },
];

export default function MatchesMock({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Top job matches preview: Product Designer at Spotify (98% match), UX Researcher at Google (92%) and Product Manager at Notion (88%)"
      className={cn(
        "@container w-full min-w-0 max-w-full overflow-hidden rounded-[20px] border border-v2-line/60 bg-white shadow-v2-float",
        className,
      )}
    >
      <div className="px-4 pb-2 pt-4 @[400px]:px-5 @[400px]:pt-5">
        <div aria-hidden className="flex items-center gap-3 pb-1">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-v2-green-soft text-v2-green">
            <UserIcon className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 truncate text-[clamp(14px,1.3vw,16px)] font-bold text-v2-navy">Top Job Matches for You</p>
          <span className="flex flex-none items-center gap-1 text-[12.5px] font-semibold text-v2-blue">
            <span className="hidden @[340px]:inline">View All</span>
            <MoreHorizontalIcon className="h-4 w-4 text-v2-muted/60" />
          </span>
        </div>
        <ul aria-hidden>
          {ROWS.map((r, i) => (
            <li key={r.role} className={cn("flex items-center gap-3 py-3.5", i > 0 && "border-t border-v2-line/60")}>
              <CompanyTile name={r.company} className="h-10 w-10 @[400px]:h-11 @[400px]:w-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[clamp(13.5px,1.25vw,15px)] font-bold leading-tight text-v2-navy">{r.role}</p>
                <p className="truncate text-[12.5px] leading-tight text-v2-muted">
                  {r.company} · {r.where}
                </p>
              </div>
              <StatusChip family={r.family} className="px-2.5 py-1.5 text-[11.5px] @[400px]:px-3 @[400px]:text-[12px]">
                {r.score}% Match
              </StatusChip>
              <span className="hidden h-8 w-8 flex-none place-items-center rounded-lg bg-v2-green-soft text-v2-green @[400px]:grid">
                <UserIcon className="h-4 w-4" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
