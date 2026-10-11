/**
 * App v2 shared primitives (spec: web/APP-V2-SPEC.md section 2). Used by the signed-in app and the
 * org admin. Dependency-free, token utilities only, no inline SVG (glyphs come from @kiwiply/ui).
 */
export { TONE, toneFor } from "./tones";
export type { Tone, ToneClasses } from "./tones";

export { default as PageHero } from "./PageHero";
export { default as StatTile } from "./StatTile";
export type { StatDelta } from "./StatTile";
export { default as StatusChip } from "./StatusChip";
export { default as DataTable } from "./DataTable";
export type { DataColumn, DataTableProps } from "./DataTable";
export { default as Pagination } from "./Pagination";
export { default as Donut } from "./Donut";
export type { DonutSegment } from "./Donut";
export { default as BarGroupChart } from "./BarGroupChart";
export type { BarGroup, ChartSeries } from "./BarGroupChart";
export { default as LineChart } from "./LineChart";
export type { LineSeries } from "./LineChart";
export { default as Sparkline } from "./Sparkline";
export { default as Progress } from "./Progress";
export { default as ProgressRing } from "./ProgressRing";
export { default as InitialsAvatar, initialsOf } from "./InitialsAvatar";
export { default as CompanyTile } from "./CompanyTile";
export { default as SectionCard } from "./SectionCard";
export { default as MascotCard } from "./MascotCard";
export { default as SearchInput } from "./SearchInput";
export type { SearchInputProps } from "./SearchInput";
export { default as UnderlineTabs } from "./UnderlineTabs";
export type { UnderlineTab } from "./UnderlineTabs";
export { Toggle } from "./Toggle";
export type { ToggleProps } from "./Toggle";
