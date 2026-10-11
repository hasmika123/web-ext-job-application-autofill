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
 * Sample numbers belong in `../sample-data.ts` with a SAMPLE comment.
 */
export { default as AdminHero } from "./AdminHero";
export { default as AdminStatTiles } from "./AdminStatTiles";
export type { AdminStat } from "./AdminStatTiles";
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
