/**
 * The enterprise UI kit (X2.15; docs/enterprise-v2/16 s7, 28 s0, 38 s7). Every shared enterprise primitive lives here so the
 * org/tenant pages differ only in data. `MascotPose` is X2.8 (primitives/MascotPose); QuoteSummary and CostConfirmSheet are
 * web composites (X6.3). The doc-sync test (`kit.test.ts`) asserts this export list matches 16 s7.
 */
export { FilterBar, DataTable, SEARCH_DEBOUNCE_MS, hasActiveFilters } from "./tables";
export type { FilterBarProps, FilterDef, DataTableProps, DataTableColumn, SortDir } from "./tables";
export { ReasonSheet, ConfirmTypedSheet, HistoryDrawer, SheetFrame, REASON_MIN, REASON_MAX, reasonOk, reasonProblem, useNarrow } from "./sheets";
export type { ReasonSpec, ConfirmTypedSpec, SheetOutcome, HistoryDrawerProps, HistoryLoader, HistoryRow } from "./sheets";
export { PersonCell, MemberAvatar, StatusDot, initialsOf, statusDotTone } from "./people";
export type { PersonCellProps, MemberAvatarProps, StatusDotProps, StatusDotTone } from "./people";
export { default as StatePill, registerStateMap, hasStateMap, stateMapOf, toneOf, stateLabel, BILLING_STATE_MAP } from "./StatePill";
export type { StatePillProps, StateTone, StateMap } from "./StatePill";
export { default as QuickActionTiles } from "./QuickActionTiles";
export type { QuickAction } from "./QuickActionTiles";
export { MoneyText, PriceDelta, FeatureChip, AllowanceMeter, formatMinor, allowanceText } from "./money";
export type { MoneyTextProps, MoneyTone, MoneyBand, PriceDeltaProps, FeatureChipProps, FeatureChipState, AllowanceMeterProps } from "./money";
export { ConsentChip, ReadinessRing, SensitiveTextField, SENSITIVE_422_MESSAGE, sensitiveWarning, inCooldown } from "./talent";
export type { ConsentChipProps, ConsentLevel, ReadinessRingProps, SensitiveTextFieldProps } from "./talent";
export { KanbanBoard, WorkloadColumn, TimelineFeed, mergeTimeline, capacityDots } from "./boards";
export type { KanbanBoardProps, KanbanColumn, WorkloadColumnProps, WorkloadItem, TimelineFeedProps, TimelineEvent, TimelineSource } from "./boards";
export { FunnelChart, SourceLogo, funnelWidths, FUNNEL_COLORS } from "./funnel";
export type { FunnelStage } from "./funnel";
export { CodeBracketsIcon } from "./interviewIcons";
