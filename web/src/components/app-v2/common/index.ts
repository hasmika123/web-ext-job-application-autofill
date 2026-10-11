/**
 * App v2 shared primitives (spec: web/APP-V2-SPEC.md section 2). Used by the signed-in app and the
 * org admin. Dependency-free, token utilities only, no inline SVG (glyphs come from @kiwiply/ui).
 * This is the ONLY home for these: page folders import from here, never grow a local copy.
 */
export { TONE, toneFor } from "./tones";
export type { Tone, ToneClasses } from "./tones";

// Layout + cards
export { default as PageHero } from "./PageHero";
export { default as SectionCard } from "./SectionCard";
export { default as RailLayout } from "./RailLayout";
export { default as MascotCard } from "./MascotCard";
export { default as AppArt } from "./AppArt";
export type { AppArtName } from "./AppArt";
export { default as HeroArt } from "./HeroArt";

// Stats + data display
export { default as StatTile } from "./StatTile";
export type { StatDelta } from "./StatTile";
export { default as StatRow } from "./StatRow";
export { default as StatusChip } from "./StatusChip";
export { default as DataTable } from "./DataTable";
export type { DataColumn, DataTableProps } from "./DataTable";
export { default as Pagination } from "./Pagination";
export { default as ActivityTimeline } from "./ActivityTimeline";
export { default as QuickActionTiles } from "./QuickActionTiles";
export type { QuickAction } from "./QuickActionTiles";
export { default as CheckList } from "./CheckList";
export { default as IconTile } from "./IconTile";
export { default as BrandTile } from "./BrandTile";

// Charts
export { default as Donut } from "./Donut";
export type { DonutSegment } from "./Donut";
export { default as BarGroupChart } from "./BarGroupChart";
export type { BarGroup, ChartSeries } from "./BarGroupChart";
export { default as LineChart, LegendDots } from "./LineChart";
export type { LineSeries } from "./LineChart";
export { default as Funnel } from "./Funnel";
export { default as Sparkline } from "./Sparkline";
export { default as Progress } from "./Progress";
export { default as ProgressRing } from "./ProgressRing";

// People + companies
export { default as InitialsAvatar, initialsOf } from "./InitialsAvatar";
export { default as CompanyTile } from "./CompanyTile";

// Controls
export { default as SearchInput } from "./SearchInput";
export type { SearchInputProps } from "./SearchInput";
export { default as FilterSelect } from "./FilterSelect";
export { default as UnderlineTabs } from "./UnderlineTabs";
export type { UnderlineTab } from "./UnderlineTabs";
export { default as PillTabs } from "./PillTabs";
export type { TabDef } from "./tabs-shared";
export { KebabMenu } from "./KebabMenu";
export { default as ToolbarButton, IconSquareButton } from "./ToolbarButton";
export { Toggle } from "./Toggle";
export type { ToggleProps } from "./Toggle";
