"use client";

import { ArrowRightIcon, Button, EmptyState, ErrorState, IconButton, MemberAvatar, Menu, Meter, MoreHorizontalIcon, PlusIcon, Skeleton, StatePill, UsersIcon } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { CompactFilters } from "./parts";
import { loadText, type Marketer, type MarketerList } from "@/lib/ent/marketing-assignments";

export type MarketersState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: MarketerList };

/**
 * The left panel: the marketing specialists with their workload (assigned / capacity and a bar that turns amber at 90 percent and red
 * when full), a search and a status filter, Add Marketer, and the "View workload report" link. Selecting a card selects the marketer whose
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
    <section aria-label="Marketing specialists" className="ent-card flex min-w-0 flex-col !p-[14px]" data-marketers-panel>
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="inline-grid h-[30px] w-[30px] flex-none place-items-center rounded-lg text-[var(--ent-x-2b72f0)]">
          <UsersIcon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 data-marketers-count className="text-[14.5px] font-extrabold leading-tight text-[var(--ent-title)]">
            {data ? `${data.summary.marketers} ${data.summary.marketers === 1 ? "marketer" : "marketers"} · ${data.summary.totalAssigned} assigned` : "Marketers"}
          </h2>
        </div>
        {canManage && (
          <Button type="button" size="sm" className="ent-btn flex-none" onClick={onAdd} data-add-marketer>
            <PlusIcon size={14} aria-hidden /> Add marketer
          </Button>
        )}
      </div>

      <div className="mt-2.5">
        <CompactFilters
          query={query}
          onQuery={onQuery}
          placeholder="Search marketers..."
          label="Search marketers"
          filters={[{ name: "status", label: "Status", allLabel: "All statuses", options: [{ value: "ACTIVE", label: "Active" }, { value: "PAUSED", label: "Paused" }] }]}
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
                  Add marketer
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
                  className={`flex items-center gap-1 rounded-[10px] border px-1.5 py-1 ${selected ? "border-[var(--ent-x-3b79ee)] bg-[var(--ent-x-f3f7ff)] shadow-[inset_0_0_0_1px_rgba(59,121,238,0.25)]" : "border-transparent hover:bg-[var(--ent-field-bg)]"}`}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${m.name}, ${loadText(m)} consultants, ${m.percent} percent. Show their consultants`}
                    onClick={() => onSelect(m.memberId)}
                    className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  >
                    <MemberAvatar name={m.name} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-bold leading-tight text-[var(--ent-title)]">{m.name}</span>
                        <span className="flex-none">
                          <StatePill domain="assignment" state={m.status} label={m.status === "PAUSED" ? "Paused" : "Active"} />
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10.5px] text-[var(--ent-soft)]">{m.title ?? "Marketing"}</span>
                    </span>
                    <span className="w-[112px] flex-none">
                      <span className="flex items-baseline gap-1 whitespace-nowrap">
                        <span className="text-[12px] font-bold tabular-nums text-[var(--ent-title)]" data-load>
                          {loadText(m)}
                        </span>
                        <span className="text-[9.5px] text-[var(--ent-soft)]">Consultants</span>
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <Meter className="ent-meter flex-1" value={m.assigned} max={Math.max(1, m.capacity)} warnAt={0.9} label={`${m.name} workload`} valueText={`${m.assigned} of ${m.capacity} consultants, ${m.percent} percent`} />
                        <span className={`w-7 text-right text-[9.5px] font-medium tabular-nums ${m.overloaded ? "text-danger-text" : "text-[var(--ent-soft)]"}`} data-percent>
                          {m.percent}%
                        </span>
                      </span>
                    </span>
                  </button>
                  <Menu
                    trigger={
                      <IconButton aria-label={`Actions for ${m.name}`} title="Marketer actions" className="ent-kebab">
                        <MoreHorizontalIcon size={15} />
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
        <button type="button" onClick={onReport} data-marketers-summary className="mt-3 inline-flex min-h-11 items-center gap-1.5 self-start text-[11.5px] font-semibold text-[var(--ent-x-2b5fd6)] hover:underline sm:min-h-0">
          View workload report <ArrowRightIcon size={13} aria-hidden />
        </button>
      )}
    </section>
  );
}
