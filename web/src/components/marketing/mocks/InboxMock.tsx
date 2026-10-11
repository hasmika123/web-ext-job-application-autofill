import { cn } from "@kiwiply/ui";
import type { Family } from "../family";
import { LetterTile, MockFrame, StatusChip } from "./shared";

/** Inbox tracking mock: five fictional messages matched to applications. Spec 7.2 item 4. */
const ROWS: { company: string; subject: string; role: string; tag: string; family: Family; time: string }[] = [
  { company: "Northwind", subject: "Interview invite", role: "Software Engineer", tag: "Interview", family: "green", time: "2m ago" },
  { company: "Acme Robotics", subject: "Application received", role: "Product Manager", tag: "Applied", family: "blue", time: "1h ago" },
  { company: "Bluefin Labs", subject: "A quick question about availability", role: "Data Analyst", tag: "Response", family: "violet", time: "1d ago" },
  { company: "Harbor & Co", subject: "Update on your application", role: "Support Lead", tag: "Rejection", family: "coral", time: "1d ago" },
  { company: "Lumen Health", subject: "Next steps", role: "UX Designer", tag: "Update", family: "amber", time: "2d ago" },
];

export default function InboxMock({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Example inbox: five recruiter emails, each matched to an application and tagged Interview, Applied, Response, Rejection or Update"
      title="Inbox"
      className={className}
      bodyClassName="p-2 sm:p-3"
    >
      <ul>
        {ROWS.map((r, i) => (
          <li key={r.company} className={cn("flex items-center gap-3 px-2 py-2.5", i > 0 && "border-t border-v2-line/60")}>
            <LetterTile letter={r.company[0]} family={r.family} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold leading-tight text-v2-navy">{r.company}</p>
              <p className="truncate text-[12.5px] leading-tight text-v2-ink-soft">{r.subject}</p>
              <p className="truncate text-[11.5px] leading-tight text-v2-muted">{r.role}</p>
            </div>
            <span className="hidden flex-none text-[11.5px] text-v2-muted sm:block">{r.time}</span>
            <StatusChip family={r.family}>{r.tag}</StatusChip>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}
