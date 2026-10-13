"use client";

import { ChevronDownIcon, ChevronUpIcon, MemberAvatar, Select } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { dayText, nextSort, pageCount as pagesOf, PAGE_SIZES, showingText, type ClientRow, type SortDir, type SortKey } from "@/lib/ent/clients";
import { pageWindow } from "@/components/ent/employees/EmployeesTable";
import { Check, Kebab } from "@/components/ent/jobs/parts";
import { CompanyTile, HealthPill } from "./parts";

export interface ClientsTableProps {
  rows: ClientRow[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onTogglePage: (on: boolean) => void;
  /** The client whose drawer is open (kept highlighted). */
  openId: number | null;
  onOpen: (row: ClientRow) => void;
  rowMenu: (row: ClientRow) => MenuEntry[];
  sort: { key: SortKey; dir: SortDir };
  onSort: (s: { key: SortKey; dir: SortDir }) => void;
}

const COLS: { key: SortKey | null; label: string; className: string; lines?: [string, string] }[] = [
  { key: "name", label: "Client Company", className: "text-left" },
  { key: "industry", label: "Industry", className: "text-left" },
  { key: "requirements", label: "Open Requirements", className: "text-left", lines: ["Open", "Requirements"] },
  { key: "consultants", label: "Active Consultants", className: "text-left", lines: ["Active", "Consultants"] },
  { key: "manager", label: "Account Manager", className: "text-left" },
  { key: "health", label: "Health", className: "text-left" },
  { key: "activity", label: "Last Activity", className: "text-left" },
  { key: null, label: "Actions", className: "text-center" },
];

function Manager({ row }: { row: ClientRow }) {
  if (!row.manager) return <span className="text-muted">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <MemberAvatar name={row.manager.name} size={32} />
      <span className="truncate text-[12.5px] text-[#2a3667]">{row.manager.name}</span>
    </span>
  );
}

/**
 * The directory as a table (a phone sees the same rows as stacked cards): checkbox, company tile and name, industry, open requirements,
 * active consultants, account manager, health, last activity and the row menu. The whole row opens the drawer (Enter or Space too);
 * a column header sorts. Initials tiles stand for logos and photos (none exist).
 */
export function ClientsTable({ rows, selected, onToggle, onTogglePage, openId, onOpen, rowMenu, sort, onSort }: ClientsTableProps) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOn = !allOn && rows.some((r) => selected.has(r.id));
  return (
    <div data-clients-list>
      {/* the phone's cards */}
      <ul aria-label="Clients" className="space-y-2.5 md:hidden">
        {rows.map((r) => {
          const open = openId === r.id;
          return (
            <li
              key={r.id}
              data-row-id={r.id}
              tabIndex={0}
              aria-current={open ? "true" : undefined}
              onClick={() => onOpen(r)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onOpen(r);
                }
              }}
              className={`ent-card cursor-pointer p-3.5 ${open ? "!border-accent/50 bg-accent-soft/40" : ""}`}
            >
              <div className="flex items-center gap-3">
                <CompanyTile name={r.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-[var(--ent-title,#0b1445)]">{r.name}</p>
                  <p className="truncate text-[12.5px] text-muted">{r.industry ?? ""}</p>
                </div>
                <HealthPill level={r.health.level} />
                <span onClick={(e) => e.stopPropagation()}>
                  <Kebab items={rowMenu(r)} label={`Actions for ${r.name}`} />
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                <div>
                  <dt className="text-muted">Open requirements</dt>
                  <dd className="text-[15px] font-semibold text-accent-deep tabular-nums">{r.openRequirements}</dd>
                </div>
                <div>
                  <dt className="text-muted">Active consultants</dt>
                  <dd className="text-[15px] font-semibold text-ink-soft tabular-nums">{r.activeConsultants}</dd>
                </div>
                <div>
                  <dt className="text-muted">Last activity</dt>
                  <dd className="font-medium text-ink-soft">{dayText(r.lastActivityAt)}</dd>
                </div>
              </dl>
              {r.manager && <p className="mt-2 text-[12.5px] text-muted">Account manager: {r.manager.name}</p>}
            </li>
          );
        })}
      </ul>

      {/* the desktop table */}
      <div className="ent-card hidden overflow-hidden !rounded-[14px] md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Clients</caption>
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "10.5%" }} />
            <col style={{ width: "10.5%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "6%" }} />
          </colgroup>
          <thead>
            <tr className="h-[46px] bg-[color-mix(in_srgb,var(--brand-50,#f2f7ff)_100%,#ffffff)]">
              <th scope="col" className="pl-3.5">
                <Check checked={allOn} indeterminate={someOn} onChange={onTogglePage} label="Select all clients on this page" />
              </th>
              {COLS.map((c) => {
                const active = c.key !== null && sort.key === c.key;
                return (
                  <th key={c.label} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={`px-1.5 text-[12.5px] font-semibold leading-[1.15] text-[var(--ent-title,#0b1445)] ${c.className}`}>
                    {c.key ? (
                      <button type="button" onClick={() => onSort(nextSort(sort, c.key as SortKey))} className="inline-flex items-center gap-1 text-left font-semibold hover:text-accent-deep" data-sort={c.key}>
                        {c.lines ? (
                          <span>
                            {c.lines[0]}
                            <br />
                            {c.lines[1]}
                          </span>
                        ) : (
                          c.label
                        )}
                        {active && (sort.dir === "asc" ? <ChevronUpIcon size={13} aria-hidden /> : <ChevronDownIcon size={13} aria-hidden />)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const open = openId === r.id;
              return (
                <tr
                  key={r.id}
                  data-row-id={r.id}
                  tabIndex={0}
                  aria-current={open ? "true" : undefined}
                  onClick={() => onOpen(r)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onOpen(r);
                    }
                  }}
                  className={`h-[47.5px] cursor-pointer border-t border-[var(--ent-table-line,#edf1f7)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${open || selected.has(r.id) ? "bg-accent-soft/50" : "hover:bg-paper-2/60"}`}
                >
                  <td className="pl-3.5">
                    <Check checked={selected.has(r.id)} onChange={() => onToggle(r.id)} label={`Select ${r.name}`} />
                  </td>
                  <td className="px-1.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <CompanyTile name={r.name} size={38} />
                      <span className="truncate text-[12.5px] font-semibold text-[var(--ent-title,#0b1445)]" data-client-name>
                        {r.name}
                      </span>
                    </span>
                  </td>
                  <td className="truncate px-1.5 text-[11.5px] text-[#46527e]">{r.industry ?? ""}</td>
                  <td className="px-1.5 text-[12.5px] font-medium tabular-nums text-accent-deep" data-open-requirements>
                    {r.openRequirements}
                  </td>
                  <td className="px-1.5 text-[12.5px] tabular-nums text-[#46527e]" data-active-consultants>
                    {r.activeConsultants}
                  </td>
                  <td className="px-1.5">
                    <Manager row={r} />
                  </td>
                  <td className="px-1.5">
                    <HealthPill level={r.health.level} />
                  </td>
                  <td className="whitespace-nowrap px-1.5 text-[12px] text-[#46527e]" data-last-activity>
                    {dayText(r.lastActivityAt)}
                  </td>
                  <td className="px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <Kebab items={rowMenu(r)} label={`Actions for ${r.name}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The grid view: one card per client (company tile, name, industry, health, the two counts, manager and last activity). */
export function ClientsGrid({ rows, openId, onOpen, rowMenu }: { rows: ClientRow[]; openId: number | null; onOpen: (r: ClientRow) => void; rowMenu: (r: ClientRow) => MenuEntry[] }) {
  return (
    <ul aria-label="Clients" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-clients-grid>
      {rows.map((r) => (
        <li
          key={r.id}
          data-row-id={r.id}
          tabIndex={0}
          aria-current={openId === r.id ? "true" : undefined}
          onClick={() => onOpen(r)}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onOpen(r);
            }
          }}
          className={`ent-card cursor-pointer p-3.5 hover:bg-paper-2/40 focus-visible:outline-2 focus-visible:outline-accent ${openId === r.id ? "!border-accent/50 bg-accent-soft/40" : ""}`}
        >
          <div className="flex items-start gap-3">
            <CompanyTile name={r.name} size={42} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-[var(--ent-title,#0b1445)]">{r.name}</p>
              <p className="truncate text-[12px] text-[#46527e]">{r.industry ?? ""}</p>
            </div>
            <span onClick={(e) => e.stopPropagation()}>
              <Kebab items={rowMenu(r)} label={`Actions for ${r.name}`} />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <HealthPill level={r.health.level} />
            <span className="text-[12px] text-[#46527e]">{dayText(r.lastActivityAt)}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--ent-table-line,#edf1f7)] pt-3 text-[12px]">
            <div>
              <dt className="text-muted">Open requirements</dt>
              <dd className="text-[16px] font-semibold text-accent-deep tabular-nums">{r.openRequirements}</dd>
            </div>
            <div>
              <dt className="text-muted">Active consultants</dt>
              <dd className="text-[16px] font-semibold text-[#46527e] tabular-nums">{r.activeConsultants}</dd>
            </div>
          </dl>
          {r.manager && (
            <p className="mt-2.5 flex items-center gap-2 text-[12px] text-[#46527e]">
              <MemberAvatar name={r.manager.name} size={22} /> {r.manager.name}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

const pageBtn = "grid h-8 min-w-8 place-items-center rounded-lg border border-[#dbe5f3] bg-white px-2 text-[12.5px] font-medium text-[#2a3667] hover:bg-paper-2 disabled:opacity-40";

/** "1-10 of 86 clients", the page numbers and the page size: the board's footer. */
export function Pagination({ page, size, total, shown, onPage, onSize, noun = "client" }: { page: number; size: number; total: number; shown: number; onPage: (p: number) => void; onSize: (s: number) => void; noun?: string }) {
  const count = pagesOf(total, size);
  return (
    <div className="mt-3 flex flex-col gap-2 text-[12.5px] text-[#46527e] sm:flex-row sm:items-center sm:justify-between" data-pagination>
      <p aria-live="polite" data-showing>
        {showingText(total, page, size, shown, noun)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {count > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)} className={pageBtn}>
              {"‹"}
            </button>
            {pageWindow(page, count).map((p, i) =>
              p === "gap" ? (
                <span key={`g${i}`} aria-hidden className="px-1 text-muted">
                  {"…"}
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  aria-label={`Page ${p + 1}`}
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => onPage(p)}
                  className={p === page ? "grid h-8 min-w-8 place-items-center rounded-lg bg-accent px-2 text-[12.5px] font-semibold text-on-accent tabular-nums" : `${pageBtn} tabular-nums`}
                >
                  {p + 1}
                </button>
              ),
            )}
            <button type="button" aria-label="Next page" title="Next page" disabled={page >= count - 1} onClick={() => onPage(page + 1)} className={pageBtn}>
              {"›"}
            </button>
          </nav>
        )}
        <div className="w-[118px]">
          <Select aria-label="Clients per page" className="!min-h-8 !rounded-lg !text-[12.5px] sm:!min-h-8" value={String(size)} onChange={(v) => onSize(Number(v))} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} />
        </div>
      </div>
    </div>
  );
}
