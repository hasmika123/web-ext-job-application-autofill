import { ChevronDownIcon, SearchIcon, UserIcon, cn } from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import { Avatar, initialsOf } from "./parts";
import { TEAM_ROWS } from "./placeholder-data";

/** Avatar tint per person, by row, so the faces differ without portraits. */
const TINTS: Family[] = ["blue", "pink", "teal", "violet", "amber"];
const OWNER_TINTS: Family[] = ["green", "blue", "violet", "coral", "green"];

function StageChip({ stage, tone }: { stage: string; tone: Family }) {
  const f = FAMILY[tone];
  return (
    <span className={cn("inline-flex min-w-[72px] justify-center rounded-md px-2.5 py-1 text-[11.5px] font-semibold", f.soft, f.text)}>
      {stage}
    </span>
  );
}

/**
 * The "Team Management" table. Decorative mock (aria-hidden): a five-column table from `md`
 * up, stacked cards below it so nothing scrolls sideways. Names and numbers come from
 * `placeholder-data.ts`.
 */
export default function OrgTableMock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-4 shadow-v2-float md:p-5", className)}
    >
      <div className="flex items-center gap-2 text-[14px] font-bold text-v2-navy">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-v2-blue-soft text-v2-blue">
          <UserIcon className="h-4 w-4" />
        </span>
        Team Management
      </div>

      {/* Toolbar: md+ only, it is purely illustrative. */}
      <div className="mt-4 hidden items-center gap-2 md:flex">
        <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg border border-v2-line px-3 py-2 text-[12px] text-v2-muted">
          <SearchIcon className="h-3.5 w-3.5 flex-none" />
          Search employees…
        </span>
        {["All Departments", "All Statuses"].map((t) => (
          <span key={t} className="hidden flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-v2-line px-3 py-2 text-[12px] text-v2-muted lg:flex">
            {t}
            <ChevronDownIcon className="h-3 w-3" />
          </span>
        ))}
        <span className="flex-none whitespace-nowrap rounded-lg bg-[#1F9D3A] px-3.5 py-2 text-[12px] font-bold text-white">Add Employee</span>
      </div>

      {/* md+: table */}
      <div className="mt-4 hidden md:block">
        <div className="grid grid-cols-[24px_1.5fr_1.4fr_1fr_0.9fr_32px] items-center gap-3 rounded-lg bg-v2-canvas px-3 py-2 text-[11px] font-semibold text-v2-muted">
          <span className="h-3.5 w-3.5 rounded border border-v2-line bg-white" />
          <span>Name</span>
          <span>Support Owner</span>
          <span>Placement Stage</span>
          <span>Last Activity</span>
          <span>Actions</span>
        </div>
        {TEAM_ROWS.map((r, n) => (
          <div
            key={r.name}
            className="grid grid-cols-[24px_1.5fr_1.4fr_1fr_0.9fr_32px] items-center gap-3 border-b border-v2-line/60 px-3 py-3 last:border-b-0"
          >
            <span className="h-3.5 w-3.5 rounded border border-v2-line bg-white" />
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar initials={initialsOf(r.name)} family={TINTS[n]} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[12.5px] font-bold text-v2-navy">{r.name}</span>
                <span className="truncate text-[10.5px] text-v2-muted">{r.role}</span>
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar initials={initialsOf(r.owner)} family={OWNER_TINTS[n]} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[12.5px] font-bold text-v2-navy">{r.owner}</span>
                <span className="truncate text-[10.5px] text-v2-muted">{r.ownerRole}</span>
              </span>
            </span>
            <StageChip stage={r.stage} tone={r.tone} />
            <span className="text-[12px] text-v2-ink-soft">{r.activity}</span>
            <span className="text-center text-[16px] font-bold leading-none text-v2-muted">···</span>
          </div>
        ))}
      </div>

      {/* below md: stacked cards */}
      <ul className="mt-4 flex flex-col gap-3 md:hidden">
        {TEAM_ROWS.map((r, n) => (
          <li key={r.name} className="flex flex-col gap-3 rounded-xl border border-v2-line/70 bg-white p-3.5">
            <div className="flex items-center gap-3">
              <Avatar initials={initialsOf(r.name)} family={TINTS[n]} className="h-10 w-10 text-[12px]" />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[14px] font-bold text-v2-navy">{r.name}</span>
                <span className="truncate text-[12px] text-v2-muted">{r.role}</span>
              </span>
              <StageChip stage={r.stage} tone={r.tone} />
            </div>
            <div className="flex items-center justify-between gap-3 text-[12px] text-v2-ink-soft">
              <span className="min-w-0 truncate">
                <span className="text-v2-muted">Support Owner: </span>
                <span className="font-semibold text-v2-navy">{r.owner}</span>
                <span className="text-v2-muted"> · {r.ownerRole}</span>
              </span>
              <span className="flex-none">{r.activity}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
