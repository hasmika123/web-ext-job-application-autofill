"use client";

import { IconButton, Menu, MoreHorizontalIcon, Select, useNarrow } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { footText, formatDay, pageCount as pagesOf, PAGE_SIZES, rateText, type PlacementRow } from "@/lib/ent/placements";
import { ClientTile, ConsultantCell, ManagerCell, NextPill, StatusPill } from "./parts";

export interface TableProps {
  rows: PlacementRow[];
  /** The row whose drawer is open (kept highlighted). */
  openId: number | null;
  onOpen: (row: PlacementRow) => void;
  rowMenu: (row: PlacementRow) => MenuEntry[];
  checked: ReadonlySet<number>;
  onCheck: (id: number, on: boolean) => void;
  onCheckAll: (on: boolean) => void;
  mode: "list" | "grid";
  showRates: boolean;
}

const HEAD = "px-2 py-2.5 text-left text-[12px] font-bold text-[color:var(--ent-title)]";
const CELL = "px-2 py-2";

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-[18px] w-[18px] cursor-pointer rounded-[5px] border-[color:var(--pl-check-line)] accent-[var(--brand-solid,var(--color-accent))]"
    />
  );
}

function Kebab({ items, name }: { items: MenuEntry[]; name: string }) {
  return (
    <Menu
      trigger={
        <IconButton aria-label={`Actions for ${name}`} title="Row actions" className="!h-8 !w-8 !rounded-lg border border-[color:var(--pl-btn-line)] bg-white text-accent-deep">
          <MoreHorizontalIcon size={16} />
        </IconButton>
      }
      items={items}
    />
  );
}

export function PlacementsTable(p: TableProps) {
  const narrow = useNarrow();
  const allChecked = p.rows.length > 0 && p.rows.every((r) => p.checked.has(r.id));

  if (narrow || p.mode === "grid") {
    return (
      <ul aria-label="Placements" className={p.mode === "grid" && !narrow ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2.5"} data-placement-cards={p.mode}>
        {p.rows.map((r) => (
          <li key={r.id} data-row-id={r.id} className={`rounded-[14px] border bg-white ${p.openId === r.id ? "border-accent bg-accent-soft/40" : "border-[color:var(--ent-card-border)]"}`}>
            <div className="flex items-start gap-2 p-3">
              <button type="button" onClick={() => p.onOpen(r)} className="min-h-11 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <ConsultantCell consultant={r.consultant} />
              </button>
              <StatusPill status={r.status} />
              <Kebab items={p.rowMenu(r)} name={r.consultant.name} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 border-t border-[color:var(--ent-table-line)] px-3 py-2.5 text-[12.5px]">
              <dt className="text-[color:var(--pl-link-soft)]">Client</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <ClientTile client={r.client} size={22} />
                <span className="truncate">{r.client.name}</span>
              </dd>
              <dt className="text-[color:var(--pl-link-soft)]">Role</dt>
              <dd className="min-w-0 truncate">{r.roleTitle}</dd>
              <dt className="text-[color:var(--pl-link-soft)]">Dates</dt>
              <dd>{formatDay(r.startDate)} to {r.endDate ? formatDay(r.endDate) : "open-ended"}</dd>
              <dt className="text-[color:var(--pl-link-soft)]">Manager</dt>
              <dd className="min-w-0"><ManagerCell name={r.accountManager?.name ?? null} size={22} /></dd>
              {p.showRates && (
                <>
                  <dt className="text-[color:var(--pl-link-soft)]">Bill rate</dt>
                  <dd>{rateText(r.billRateMinor, r.rateUnit, r.currency) || "—"}</dd>
                </>
              )}
              <dt className="text-[color:var(--pl-link-soft)]">Next action</dt>
              <dd><NextPill next={r.nextAction} /></dd>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto" data-placement-table-wrap>
      <table aria-label="Placements" className="w-full min-w-[820px] border-collapse text-[12px]" data-placement-table>
        <thead className="bg-[color:var(--ent-table-head-bg)]">
          <tr>
            <th scope="col" className="w-[38px] rounded-l-[10px] py-2.5 pl-3 pr-1">
              <Checkbox checked={allChecked} onChange={p.onCheckAll} label="Select all placements on this page" />
            </th>
            <th scope="col" className={HEAD}>Consultant</th>
            <th scope="col" className={HEAD}>Client</th>
            <th scope="col" className={HEAD}>Role</th>
            <th scope="col" className={HEAD}>Start Date</th>
            <th scope="col" className={HEAD}>End Date</th>
            <th scope="col" className={HEAD}>Account Manager</th>
            <th scope="col" className={HEAD}>Status</th>
            {p.showRates && <th scope="col" className={HEAD}>Bill Rate</th>}
            <th scope="col" className={HEAD}>Next Action</th>
            <th scope="col" className={`${HEAD} rounded-r-[10px] text-center`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => {
            const open = p.openId === r.id;
            const on = p.checked.has(r.id);
            return (
              <tr
                key={r.id}
                data-row-id={r.id}
                data-status={r.status}
                tabIndex={0}
                aria-selected={open}
                onClick={() => p.onOpen(r)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    p.onOpen(r);
                  }
                }}
                className={`cursor-pointer border-b border-[color:var(--ent-table-line)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${open || on ? "bg-[color:var(--ent-field-bg)]" : "hover:bg-[color:var(--pl-row-hover)]"}`}
              >
                <td className="py-2 pl-3 pr-1" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={on || open} onChange={(v) => p.onCheck(r.id, v)} label={`Select ${r.consultant.name}`} />
                </td>
                <td className={`${CELL} min-w-[9.5rem]`}>
                  <ConsultantCell consultant={r.consultant} />
                </td>
                <td className={`${CELL} min-w-[7.2rem]`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <ClientTile client={r.client} size={26} />
                    <span className="min-w-0 text-[12px] leading-tight text-[color:var(--pl-body)]">{r.client.name}</span>
                  </span>
                </td>
                <td className={`${CELL} min-w-[5.6rem] text-[12px] leading-[1.3] text-[color:var(--pl-soft)]`}>{r.roleTitle}</td>
                <td className={`${CELL} whitespace-nowrap text-[color:var(--pl-soft)]`}>{formatDay(r.startDate)}</td>
                <td className={`${CELL} whitespace-nowrap text-[color:var(--pl-soft)]`}>{r.endDate ? formatDay(r.endDate) : <span className="text-muted">Open-ended</span>}</td>
                <td className={`${CELL} min-w-[7.4rem]`}>
                  <ManagerCell name={r.accountManager?.name ?? null} />
                </td>
                <td className={CELL}>
                  <StatusPill status={r.status} />
                </td>
                {p.showRates && <td className={`${CELL} whitespace-nowrap text-[color:var(--pl-soft)]`}>{rateText(r.billRateMinor, r.rateUnit, r.currency) || <span className="text-muted">{"—"}</span>}</td>}
                <td className={CELL}>
                  <NextPill next={r.nextAction} />
                </td>
                <td className="px-2 text-center" onClick={(e) => e.stopPropagation()}>
                  <Kebab items={p.rowMenu(r)} name={r.consultant.name} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 1 2 3 … 15 with the current page and its neighbours; the ends always show. Pure, for the tests. */
export function pageWindow(page: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const out: (number | "gap")[] = [0];
  const from = Math.max(1, Math.min(page - 1, count - 5));
  const to = Math.min(count - 2, Math.max(page + 1, 4));
  if (from > 1) out.push("gap");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < count - 2) out.push("gap");
  out.push(count - 1);
  return out;
}

const PAGE_BTN = "grid h-9 min-w-9 place-items-center rounded-lg border border-[color:var(--pl-btn-line)] bg-white px-2 text-[13px] font-medium text-[color:var(--pl-body)] hover:bg-[color:var(--ent-field-bg)] disabled:opacity-40";

export function Pagination({ page, size, total, shown, onPage, onSize }: { page: number; size: number; total: number; shown: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const count = pagesOf(total, size);
  return (
    <div className="mt-3 flex flex-col gap-2 text-[12.5px] text-[color:var(--pl-soft)] sm:flex-row sm:items-center sm:justify-between" data-pagination>
      <p aria-live="polite" data-showing>{footText(total, page, size, shown)}</p>
      <div className="flex flex-wrap items-center gap-2">
        {count > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" title="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)} className={PAGE_BTN}>
              {"‹"}
            </button>
            {pageWindow(page, count).map((n, i) =>
              n === "gap" ? (
                <span key={`g${i}`} aria-hidden className="grid h-9 min-w-9 place-items-center rounded-lg border border-[color:var(--pl-btn-line)] text-muted">
                  {"…"}
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  aria-label={`Page ${n + 1}`}
                  aria-current={n === page ? "page" : undefined}
                  onClick={() => onPage(n)}
                  className={n === page ? "grid h-9 min-w-9 place-items-center rounded-lg bg-accent px-2 text-[13px] font-semibold tabular-nums text-on-accent" : `${PAGE_BTN} tabular-nums`}
                >
                  {n + 1}
                </button>
              ),
            )}
            <button type="button" aria-label="Next page" title="Next page" disabled={page >= count - 1} onClick={() => onPage(page + 1)} className={PAGE_BTN}>
              {"›"}
            </button>
          </nav>
        )}
        <div className="w-[7.6rem]">
          <Select aria-label="Rows per page" value={String(size)} onChange={(v) => onSize(Number(v))} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} per page` }))} className="!h-9 !rounded-lg !border-[color:var(--pl-btn-line)] !py-0 !text-[12.5px]" />
        </div>
      </div>
    </div>
  );
}

