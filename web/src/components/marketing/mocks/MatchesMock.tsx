import { BookmarkIcon, cn } from "@kiwiply/ui";
import type { Family } from "../family";
import { LetterTile, MockFrame, StatusChip } from "./shared";

/** Job-matches mock: three fictional roles with a match score. Spec 7.2 item 5. */
const ROWS: { role: string; company: string; where: string; score: number; family: Family }[] = [
  { role: "Product Designer", company: "Northwind", where: "Remote · Full-time", score: 94, family: "blue" },
  { role: "UX Researcher", company: "Acme Robotics", where: "Hybrid · Full-time", score: 91, family: "violet" },
  { role: "Product Manager", company: "Bluefin Labs", where: "Remote · Contract", score: 88, family: "teal" },
];

export default function MatchesMock({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Example list of three job matches with match scores of 94, 91 and 88 percent"
      title="Top job matches for you"
      className={className}
      bodyClassName="p-2 sm:p-3"
    >
      <ul>
        {ROWS.map((r, i) => (
          <li key={r.role} className={cn("flex items-center gap-3 px-2 py-3", i > 0 && "border-t border-v2-line/60")}>
            <LetterTile letter={r.company[0]} family={r.family} className="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold leading-tight text-v2-navy">{r.role}</p>
              <p className="truncate text-[12px] leading-tight text-v2-muted">
                {r.company} · {r.where}
              </p>
            </div>
            <StatusChip family="green">{r.score}% match</StatusChip>
            <BookmarkIcon aria-hidden className="hidden h-5 w-5 flex-none text-v2-muted sm:block" />
          </li>
        ))}
      </ul>
      <p className="mt-1 rounded-xl bg-v2-canvas px-3 py-2 text-[12px] leading-snug text-v2-ink-soft">
        Free shows three a day. Pro shows the full ranked list.
      </p>
    </MockFrame>
  );
}
