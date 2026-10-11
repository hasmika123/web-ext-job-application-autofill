import { cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import { ExampleBadge } from "./parts";

/**
 * Team table mock: Name, Role, Support owner, Stage, Last activity. A real table from `md` up;
 * stacked cards below it (spec section 10: no horizontal scroll). Fictional people, no photos.
 */
interface Row {
  name: string;
  role: string;
  owner: string;
  stage: string;
  family: Family;
  last: string;
}

const ROWS: Row[] = [
  { name: "Jordan L.", role: "Java Developer", owner: "Sam K.", stage: "Interviewing", family: "green", last: "2 days ago" },
  { name: "Maya R.", role: "Data Engineer", owner: "Alex T.", stage: "Applying", family: "blue", last: "1 day ago" },
  { name: "Devon P.", role: "QA Analyst", owner: "Sam K.", stage: "Offer", family: "lime", last: "3 days ago" },
  { name: "Riley C.", role: "UX Designer", owner: "Casey W.", stage: "In review", family: "amber", last: "Today" },
  { name: "Sky N.", role: "DevOps Engineer", owner: "Alex T.", stage: "Applying", family: "blue", last: "2 days ago" },
];

const HEADERS = ["Name", "Role", "Support owner", "Stage", "Last activity"];

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("");
}

function StageChip({ stage, family }: { stage: string; family: Family }) {
  const f = FAMILY[family];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none", f.soft, f.text)}>
      {stage}
    </span>
  );
}

function Avatar({ name, family }: { name: string; family: Family }) {
  const f = FAMILY[family];
  return (
    <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-bold", f.soft, f.text)}>
      {initials(name)}
    </span>
  );
}

export default function OrgTableMock({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-[var(--radius-v2-card)] border border-v2-line/70 bg-white p-4 shadow-v2-float sm:p-5", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-v2-navy">Team overview</p>
        <ExampleBadge />
      </div>

      {/* md and up: table */}
      <table className="mt-4 hidden w-full border-separate border-spacing-0 text-left text-sm md:table">
        <caption className="sr-only">Example team table with stage and last activity per consultant</caption>
        <thead>
          <tr>
            {HEADERS.map((h) => (
              <th key={h} scope="col" className="border-b border-v2-line px-2 pb-2 text-xs font-semibold text-v2-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.name}>
              <td className="border-b border-v2-line/60 px-2 py-2.5">
                <span className="flex items-center gap-2.5">
                  <Avatar name={r.name} family={r.family} />
                  <span className="font-semibold text-v2-navy">{r.name}</span>
                </span>
              </td>
              <td className="border-b border-v2-line/60 px-2 py-2.5 text-v2-ink-soft">{r.role}</td>
              <td className="border-b border-v2-line/60 px-2 py-2.5 text-v2-ink-soft">{r.owner}</td>
              <td className="border-b border-v2-line/60 px-2 py-2.5">
                <StageChip stage={r.stage} family={r.family} />
              </td>
              <td className="border-b border-v2-line/60 px-2 py-2.5 text-v2-ink-soft">{r.last}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* below md: stacked cards */}
      <ul className="mt-4 flex flex-col gap-3 md:hidden">
        {ROWS.map((r) => (
          <li key={r.name} className="rounded-xl border border-v2-line/70 bg-v2-canvas p-3">
            <div className="flex items-center gap-3">
              <Avatar name={r.name} family={r.family} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-v2-navy">{r.name}</p>
                <p className="truncate text-[13px] text-v2-ink-soft">{r.role}</p>
              </div>
              <StageChip stage={r.stage} family={r.family} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
              <div>
                <dt className="text-v2-muted">Support owner</dt>
                <dd className="font-medium text-v2-navy">{r.owner}</dd>
              </div>
              <div>
                <dt className="text-v2-muted">Last activity</dt>
                <dd className="font-medium text-v2-navy">{r.last}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
