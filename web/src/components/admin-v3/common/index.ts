/**
 * Admin v3 shared primitives (ADMIN-A). Every admin page is: <AdminHero/> -> <AdminStatTiles/> ->
 * <AdminPanel/> sections. Reuse `@/components/app-v2/common` (DataTable, Pagination, SearchInput,
 * FilterSelect, KebabMenu, PillTabs, UnderlineTabs, Donut, StatusChip, Progress, IconTile ...) for
 * everything not listed here. Icons come from `@kiwiply/ui` only. Server-component safe (no hooks)
 * except AdminTabs.
 *
 * AdminHero      { eyebrow?="PLATFORM ADMIN", title, subtitle?, note? (handwritten, md+), actions? }
 * AdminStatTiles { stats: AdminStat[] }  AdminStat = { label, value, icon, tone, caption? ("vs last 30 days"),
 *                  delta?: { value:"12%", dir:"up"|"down", good?: boolean (default dir==="up") }, sparkline?: number[] }
 * AdminPanel     { title, description?, icon?, link?: {label,href}, right?: ReactNode, className?, bodyClassName? }
 *                  white card, wrapper of SectionCard (h-full so panels in a grid row match height)
 * AdminLinkTile  { href, icon, tone, title, description?, badge?, bordered? }  tinted icon + title + chevron link
 * PersonCell     { name (node ok), avatarName, sub?, size?=34 }  initials avatar + name + muted sub
 * RoleChip       { role: Admin|Manager|Member|User|Viewer }   PlanChip { plan: Enterprise|Autopilot|Pro|Team|Free }
 * StatusDot      { status, tone? }  dot+text (Active/Healthy/Completed green, Pending/Paused amber, Suspended/Error/Failed/Blocked coral)
 * SampleTag      {}  amber "Sample data" marker: put it on any panel/page showing illustrative numbers
 * LivePill       { soon? }  LIVE / SOON micro pill
 * LegendList     { items: {label, tone, value?, pct?}[] }  legend rows; pair with <Donut legend={false} />
 * HBarList       { items: {label, icon?, value, tone, display?, pct?}[], max? }  horizontal bars
 * BarLineChart   { bars, line, max, xLabels, yLabels (bottom->top), barLabel, lineLabel, height? }  bars + line combo
 * AdminTabs      { tabs: {id,label,icon?}[], value, onChange }  full-width pill tab bar card (client)
 *
 * Tone = "blue"|"green"|"amber"|"violet"|"teal"|"coral"|"pink"|"lime"|"slate" (from app-v2/common).
 * An admin page component never imports a `sample-data.ts` (ESLint `no-restricted-imports`; the pages not yet
 * converted carry a per-file `eslint-disable` naming the story that removes it).
 *
 * ── The page kit (E2E-A15.0; docs/ADMIN-E2E-PLAN.md section 3.6): what every page story imports ──────────────────────
 * AdminStatTiles { stats: AdminStat[] }  AdminStat = { label, value, icon, tone, caption?, delta?: { value:number, previous?:number|null,
 *                  mode?:"relative"|"points", lowerIsBetter?, label? } }  the delta chip is COMPUTED and absent without `previous`
 * AdminFilterBar { list (a useListQuery result), search?: {placeholder?,label?}|false, filters?: {name,label,options:{value,label}[],allLabel?}[],
 *                  actions? }  search + dropdowns bound to the list: server-driven, URL-synced, debounced; "Clear filters" while any is set
 * AdminTable<T>  { list, columns: (DataColumn + sub?)[], rowKey, label, what, empty?, onRowClick?, rowActions?, details?, sheetTitle? }
 *                  skeleton -> rows -> empty -> error, Pagination wired; cards + details BottomSheet below `md`
 * ReasonSheet    { spec: ReasonSpec|null, onClose }   ReasonSpec = { title, body, confirmLabel, tone?, placeholder?, forceLabel?/forceCode?, run(reason,force) }
 *                  reason 10-500 chars; Dialog from `md`, BottomSheet below
 * ConfirmTypedSheet { spec: ConfirmTypedSpec|null, onClose }   ReasonSpec + { expected, expectedLabel? }: type the login/name AND give a reason
 * HistoryDrawer  { open, onClose, load(limit), returnFocusTo?, id?, title?, description?, formatKey?, empty*?, what? }  who changed what and why
 * useAdminSave() / <AdminSaveProvider fetcher?>  save({ key, row, method, path, body, optimistic?, onSaved?, undoTitle?, undo? }) -> optimistic + ✓ + undo + inline
 *                  error, serialised per row; shown(key, actual) busy(key) error(key) flash askReason(spec) askConfirmTyped(spec)
 * Tick { k }  FieldError { k, local? }  SourceTag  AutosaveInput  LabeledField   the autosave controls (read useAdminSave)
 * AttentionBadge { count, label, tone? }  nav count pill; nothing for 0 / null
 * useNarrow() / useWide()  phone (< md) / wide (>= xl) switches for the decisions CSS cannot make
 * Client side: `adminFetch` (lib/admin-client.ts).  BFF side: `forward`/`passthrough`/`readObject`/`onlyFields` (lib/admin-proxy.ts).
 */
export { default as AdminHero } from "./AdminHero";
export { default as AdminStatTiles } from "./AdminStatTiles";
export type { AdminStat, StatDelta } from "./AdminStatTiles";
export { default as AdminFilterBar, clearFilters, hasActiveFilters, SEARCH_DEBOUNCE_MS } from "./AdminFilterBar";
export type { AdminFilterBarProps, FilterDef, FilterableList } from "./AdminFilterBar";
export { default as AdminTable } from "./AdminTable";
export type { AdminColumn, AdminTableProps } from "./AdminTable";
export { default as ReasonSheet, REASON_MIN, REASON_MAX, reasonOk, reasonProblem } from "./ReasonSheet";
export type { ReasonSpec } from "./ReasonSheet";
export { default as ConfirmTypedSheet } from "./ConfirmTypedSheet";
export type { ConfirmTypedSpec } from "./ConfirmTypedSheet";
export { default as HistoryDrawer } from "./HistoryDrawer";
export type { HistoryDrawerProps, HistoryLoader } from "./HistoryDrawer";
export { AdminSaveProvider, AdminSaveContext, useAdminSave, useAdminSaveEngine } from "./useAdminSave";
export type { AdminSave, AdminSaveOutcome, AdminSaveRequest, AdminFetcher } from "./useAdminSave";
export { Tick, FieldError, SourceTag, AutosaveInput, LabeledField } from "./controls";
export { default as AttentionBadge } from "./AttentionBadge";
export { useNarrow, useWide } from "./useNarrow";
export { default as AdminPanel } from "./AdminPanel";
export { default as AdminLinkTile } from "./AdminLinkTile";
export { default as PersonCell } from "./PersonCell";
export { RoleChip, PlanChip, StatusDot, SampleTag, LivePill } from "./chips";
export { default as LegendList } from "./LegendList";
export type { LegendItem } from "./LegendList";
export { default as HBarList } from "./HBarList";
export type { HBarItem } from "./HBarList";
export { default as BarLineChart } from "./BarLineChart";
export { default as AdminTabs } from "./AdminTabs";
