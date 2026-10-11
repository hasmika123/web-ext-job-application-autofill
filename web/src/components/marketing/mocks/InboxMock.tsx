import { InboxIcon, cn } from "@kiwiply/ui";
import type { Family } from "../family";
import { CompanyTile, MockFrame, StatusChip } from "./shared";

/** Inbox tracking mock: the board's five recruiter messages matched to applications. Spec 13.2 item 3. */
const ROWS: { company: string; subject: string; role: string; tag: string; family: Family; time: string }[] = [
  { company: "Google", subject: "Interview Invite", role: "Software Engineer", tag: "Interview", family: "blue", time: "2m ago" },
  { company: "Amazon", subject: "Application Received", role: "Product Manager", tag: "Applied", family: "green", time: "1h ago" },
  { company: "Microsoft", subject: "Follow Up", role: "Software Engineer", tag: "Response", family: "green", time: "1d ago" },
  { company: "Airbnb", subject: "Unfortunately…", role: "Frontend Developer", tag: "Rejection", family: "coral", time: "2d ago" },
  { company: "Netflix", subject: "Portfolio Review", role: "Product Manager", tag: "Update", family: "coral", time: "3d ago" },
];

export default function InboxMock({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Inbox preview: five recruiter emails from Google, Amazon, Microsoft, Airbnb and Netflix, each matched to an application and tagged Interview, Applied, Response, Rejection or Update"
      title="Inbox"
      icon={InboxIcon}
      className={className}
      bodyClassName="px-3 pb-3 pt-1 sm:px-4"
    >
      <ul>
        {ROWS.map((r, i) => (
          <li key={r.company} className={cn("flex items-center gap-3 py-2.5", i > 0 && "border-t border-v2-line/60")}>
            <CompanyTile name={r.company} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold leading-tight text-v2-navy">{r.company}</p>
              <p className="truncate text-[12.5px] font-medium leading-tight text-v2-ink-soft">{r.subject}</p>
              <p className="truncate text-[11.5px] leading-tight text-v2-muted">{r.role}</p>
            </div>
            <span className="hidden flex-none text-[11.5px] text-v2-muted sm:block">{r.time}</span>
            <StatusChip family={r.family} className="min-w-[68px] justify-center">
              {r.tag}
            </StatusChip>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}
