/**
 * One import point for the org pages. Shared primitives come from `app-v2/common` (A1); what the
 * org boards need beyond them is local (see the header comments in primitives.tsx, DataTable.tsx,
 * Tabs.tsx and blocks.tsx). QA folds the local ones into `common` and shrinks this file.
 */
export {
  CompanyTile,
  Donut,
  InitialsAvatar,
  MascotCard,
  Progress,
  SearchInput,
  SectionCard,
  Sparkline,
  StatTile,
  StatusChip,
  TONE,
} from "@/components/app-v2/common";
export type { DonutSegment, Tone } from "@/components/app-v2/common";

export { PageHero, Pagination } from "./primitives";
export { default as DataTable } from "./DataTable";
export type { Column } from "./DataTable";
export { PillTabs } from "./Tabs";
export type { TabDef } from "./Tabs";
export {
  ActivityTimeline,
  DonutLegend,
  FilterSelect,
  QuickActionTiles,
  RailLayout,
  StatRow,
  ToolbarButton,
} from "./blocks";
export type { QuickAction } from "./blocks";
