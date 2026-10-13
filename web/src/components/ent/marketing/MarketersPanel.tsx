"use client";

import { ArrowRightIcon, Button, EmptyState, ErrorState, IconButton, MemberAvatar, Menu, Meter, MoreVerticalIcon, PlusIcon, Skeleton, StatePill, UsersIcon } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { CompactFilters } from "./parts";
import { loadText, type Marketer, type MarketerList } from "@/lib/ent/marketing-assignments";

export type MarketersState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: MarketerList };

/**
 * The left panel: the marketing specialists with their workload (assigned / capacity and a bar that turns amber at 90 percent and red
 * when full), a search and a status filter, Add Marketer, and the summary footer. Selecting a card selects the marketer whose
 * consultants the table shows; the card's own menu edits capacity or pauses the marketer.
 */
export default function MarketersPanel({
  state,
  selectedId,
  onSelect,
  query,
  onQuery,
  status,
  onStatus,
  canManage,
  onAdd,
  onCapacity,
  onTogglePause,
  onReport,
  onRetry,
}: {
  state: MarketersState;
  selectedId: number | null;
  onSelect: (id: number) => void;
  query: string;
  onQuery: (q: string) => void;
  status: string;
  onStatus: (s: string) => void;
  canManage: boolean;
  onAdd: () => void;
  onCapacity: (m: Marketer) => void;
  onTogglePause: (m: Marketer) => void;
  onReport: () => void;
  onRetry: () => void;
}) {
  const data = state.status === "ok" ? state.data : null;
  const filtered = query.trim().length >= 2 || !!status;
  const menu = (m: Marketer): MenuEntry[] => [
    { label: "View consultants", onSelect: () => onSelect(m.memberId) },
    ...(m.canManage
      ? ([
          { label: "Edit capacity", onSelect: () => onCapacity(m) },
          { label: m.status === "PAUSED" ? "Resume marketer" : "Pause marketer", onSelect: () => onTogglePause(m) },
        ] as MenuEntry[])
      : []),
  ];

  return (
    <section aria-label="Marketing specialists" className="flex min-w-0 flex-col rounded-2xl border border-line bg-paper p-3.5" data-marketers-panel>
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="inline-grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent-deep">
          <UsersIcon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16.5px] font-extrabold leading-tight text-ink">Marketing Specialists</h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">View marketer workloads and manage assignments.</p>
        </div>
        {canManage && (
          <Button type="button" size="sm" className="flex-none" onClick={onAdd} data-add-marketer>
            <PlusIcon size={15} aria-hidden /> Add Marketer
          </Button>
        )}
      </div>

      <div className="mt-3">
        <CompactFilters
          query={query}
          onQuery={onQuery}
          placeholder="Search marketers..."
          label="Search marketers"
          filters={[{ name: "status", label: "Status", allLabel: "All Statuses", options: [{ value: "ACTIVE", label: "Active" }, { value: "PAUSED", label: "Paused" }] }]}
          values={{ status }}
          onFilter={(_n, v) => onStatus(v)}
          active={filtered}
          onClear={() => {
            onQuery("");
            onStatus("");
          }}
        />
      </div>

      <div className="mt-3 min-h-[120px] flex-1">
        {state.status === "loading" && (
          <ul aria-label="Loading marketers" className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <Skeleton className="h-16 w-full rounded-xl" />
              </li>
            ))}
          </ul>
        )}
        {state.status === "error" && <ErrorState what="the marketers" description={state.message} onRetry={onRetry} />}
        {data && data.items.length === 0 && (
          <EmptyState
            variant="inline"
            title={filtered ? "No marketers match" : "No marketers yet"}
            description={filtered ? "Try a different search, or clear the filters." : "Add a member who has a marketing role, then give them consultants."}
            action={
              !filtered && canManage ? (
                <Button type="button" onClick={onAdd}>
                  Add Marketer
                </Button>
              ) : undefined
            }
          />
        )}
        {data && data.items.length > 0 && (
          <ul className="space-y-1" aria-label="Marketers">
            {data.items.map((m) => {
              const selected = m.memberId === selectedId;
              return (
                <li
                  key={m.memberId}
                  data-marketer={m.memberId}
                  data-selected={selected || undefined}
                  className={`flex items-center gap-0.5 rounded-xl border p-1 ${selected ? "border-accent bg-accent-soft/50" : "border-transparent hover:bg-paper-2/60"}`}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${m.name}, ${loadText(m)} consultants, ${m.percent} percent. Show their consultants`}
                    onClick={() => onSelect(m.memberId)}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    <MemberAvatar name={m.name} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-bold leading-tight text-ink">{m.name}</span>
                        <span className="flex-none">
                          <StatePill domain="assignment" state={m.status} label={m.status === "PAUSED" ? "Paused" : "Active"} />
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted">{m.title ?? "Marketing"}</span>
                    </span>
                    <span className="w-[7.4rem] flex-none">
                      <span className="flex items-baseline gap-1 whitespace-nowrap text-[12px]">
                        <span className="font-bold tabular-nums text-ink" data-load>
                          {loadText(m)}
                        </span>
                        <span className="text-[11px] text-muted">Consultants</span>
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <Meter className="flex-1" value={m.assigned} max={Math.max(1, m.capacity)} warnAt={0.9} label={`${m.name} workload`} valueText={`${m.assigned} of ${m.capacity} consultants, ${m.percent} percent`} />
                        <span className={`w-8 text-right text-[11px] font-semibold tabular-nums ${m.overloaded ? "text-danger-text" : "text-muted"}`} data-percent>
                          {m.percent}%
                        </span>
                      </span>
                    </span>
                  </button>
                  <Menu
                    trigger={
                      <IconButton aria-label={`Actions for ${m.name}`} title="Marketer actions">
                        <MoreVerticalIcon size={16} />
                      </IconButton>
                    }
                    items={menu(m)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data && (
        <div className="mt-4 rounded-xl bg-accent-soft/40 p-3" data-marketers-summary>
          <div className="flex items-start gap-2.5">
            <span aria-hidden className="inline-grid h-9 w-9 flex-none place-items-center rounded-lg bg-accent-soft text-accent-deep">
              <UsersIcon size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[14.5px] font-extrabold leading-tight text-ink">
                {data.summary.marketers} Marketing {data.summary.marketers === 1 ? "Specialist" : "Specialists"}
              </h3>
              <p className="text-[12px] leading-snug text-muted">Manage workloads, set coverage, and keep assignments balanced.</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-paper p-3 [&_dt]:whitespace-nowrap">
            <div>
              <dd className="text-[22px] font-extrabold leading-none tabular-nums text-ink" data-summary="total">
                {data.summary.totalAssigned}
              </dd>
              <dt className="mt-1 text-[11.5px] text-muted">Total Assigned</dt>
            </div>
            <div>
              <dd className="text-[22px] font-extrabold leading-none tabular-nums text-ink" data-summary="avg">
                {data.summary.avgPerMarketer ?? "—"}
              </dd>
              <dt className="mt-1 text-[11.5px] text-muted">Avg per Marketer</dt>
            </div>
            <div>
              <dd className="text-[22px] font-extrabold leading-none tabular-nums text-ink" data-summary="overloaded">
                {data.summary.overloaded}
              </dd>
              <dt className="mt-1 text-[11.5px] text-muted">Overloaded</dt>
            </div>
          </dl>
          <button type="button" onClick={onReport} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-accent-deep hover:underline sm:min-h-0">
            View Workload Report <ArrowRightIcon size={14} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
