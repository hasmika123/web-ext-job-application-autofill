/**
 * LOCAL page-level primitives (spec section 2 names). StatusChip, CompanyTile, InitialsAvatar, Progress and the tones come from A1 `common/`;
 * the rest differ in props from `common/` (icon+subtitle SectionCard, count-style Donut, value-keyed UnderlineTabs, hero art+sticky) - QA dedupes.
 */
export { default as PageHero } from "./PageHero";
export { default as HeroArt } from "./HeroArt";
export { default as StatTile } from "./StatTile";
export { default as DataTable } from "./DataTable";
export type { DataColumn } from "./DataTable";
export { default as Donut } from "./Donut";
export type { DonutSegment } from "./Donut";
export { default as SectionCard } from "./SectionCard";
export { default as MascotCard } from "./MascotCard";
export { default as SearchInput } from "./SearchInput";
export { default as UnderlineTabs } from "./UnderlineTabs";
export type { UnderlineTab } from "./UnderlineTabs";
export { default as AppArt } from "./AppArt";
export { KebabMenu, CheckList, FilterSelect, IconTile } from "./parts";
// Adopted from A1 `common/` (API-compatible): tones, StatusChip, CompanyTile, InitialsAvatar, Progress.
export { TONE, StatusChip, CompanyTile, InitialsAvatar, Progress } from "../common";
export type { Tone } from "../common";
