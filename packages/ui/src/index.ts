/**
 * @kiwiply/ui — shared UI, consumed as source by web (Next, via transpilePackages) and the
 * extension (Vite/WXT). Design tokens live in `./styles/tokens.css` (imported separately by
 * each consumer's Tailwind entry). This barrel exposes the design-system primitives + the
 * portable ResumeUpload form.
 */

/* ── Primitives (the design system, W5.1) ─────────────────────────────────────────── */
export { default as Button, buttonVariants } from "./primitives/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./primitives/Button";

export { default as IconButton, iconButtonClass } from "./primitives/IconButton";
export type { IconButtonProps } from "./primitives/IconButton";

export { default as Input, inputClass } from "./primitives/Input";
export type { InputProps } from "./primitives/Input";

export { default as Textarea } from "./primitives/Textarea";
export type { TextareaProps } from "./primitives/Textarea";

export { default as Select, selectClass } from "./primitives/Select";
export type { SelectProps, SelectOption } from "./primitives/Select";

export { default as Field } from "./primitives/Field";
export type { FieldProps } from "./primitives/Field";

export { default as Card, CardHeader, CardTitle, CardDescription, CardFooter, cardClass } from "./primitives/Card";
export type { CardProps } from "./primitives/Card";

export { default as Badge, Pill, Tag } from "./primitives/Badge";
export type { BadgeProps, BadgeVariant } from "./primitives/Badge";

export { default as Switch } from "./primitives/Switch";
export type { SwitchProps } from "./primitives/Switch";

export { default as ChoiceGroup } from "./primitives/ChoiceGroup";
export type { ChoiceGroupProps } from "./primitives/ChoiceGroup";

export { default as MonthPicker, isMonthValue } from "./primitives/MonthPicker";
export type { MonthPickerProps } from "./primitives/MonthPicker";

export { default as Meter } from "./primitives/Meter";
export type { MeterProps } from "./primitives/Meter";

export { default as ProgressBar } from "./primitives/ProgressBar";
export type { ProgressBarProps } from "./primitives/ProgressBar";

export { default as useReducedMotion, prefersReducedMotion } from "./primitives/useReducedMotion";

export { default as useMediaQuery } from "./primitives/useMediaQuery";

export { default as useBottomBar, bottomInsetOf, BOTTOM_INSET_VAR } from "./primitives/useBottomBar";

export { default as Tabs, TabList, Tab, TabPanel } from "./primitives/Tabs";
export type { TabsProps, TabsVariant } from "./primitives/Tabs";

export { ToastProvider, useToast } from "./primitives/Toast";
export type { ToastOptions, ToastVariant } from "./primitives/Toast";

export { default as ChipInput } from "./primitives/ChipInput";
export type { ChipInputProps } from "./primitives/ChipInput";

export { default as SourceChip, SOURCE_LABELS, sourceKind } from "./primitives/SourceChip";
export type { SourceChipProps, SourceKind } from "./primitives/SourceChip";

export { default as Stepper } from "./primitives/Stepper";
export type { StepperProps, StepperStep } from "./primitives/Stepper";

export { default as SwipeCard } from "./primitives/SwipeCard";
export type { SwipeCardProps } from "./primitives/SwipeCard";

export { default as ConfettiBurst } from "./primitives/ConfettiBurst";

export { default as CardStack, FLING_MS, FLING_STILL_MS } from "./primitives/CardStack";
export type { CardStackProps } from "./primitives/CardStack";

export { default as AnimatedNumber, FLIP_MS } from "./primitives/AnimatedNumber";
export type { AnimatedNumberProps } from "./primitives/AnimatedNumber";

export { default as SparkleBurst, SPARKLE_MS } from "./primitives/SparkleBurst";
export type { SparkleBurstProps } from "./primitives/SparkleBurst";

export { default as SpeechBubble } from "./primitives/SpeechBubble";
export type { SpeechBubbleProps } from "./primitives/SpeechBubble";

/* ── Charts (X2.17): Sparkline, BarChart, DonutChart. They draw only the data they are given ── */
export { Sparkline, BarChart, DonutChart, CHART_COLORS, chartColor, sparkPoints, niceMax, shares } from "./primitives/Charts";
export type { SparklineProps, BarChartProps, BarSeries, DonutChartProps, DonutSlice } from "./primitives/Charts";

export { default as Skeleton } from "./primitives/Skeleton";
export { default as Spinner } from "./primitives/Spinner";
export type { SpinnerProps } from "./primitives/Spinner";

export { default as EmptyState } from "./primitives/EmptyState";
export type { EmptyStateProps } from "./primitives/EmptyState";

/* ── The page kit (E2E-U0.0): the pieces every page story shares ─────────────────────── */
export { default as SaveStatusChip, savedAgo, statusLabel, chipTone, OFFLINE_LABEL } from "./primitives/SaveStatusChip";
export type { SaveStatus, ChipTone } from "./primitives/SaveStatusChip";

export { default as BottomSheet, snapAfterDrag, SNAP_DRAG_PX, SNAP_PARTIAL_RATIO } from "./primitives/BottomSheet";
export type { BottomSheetProps, BottomSheetSnap } from "./primitives/BottomSheet";

export { default as ListSkeleton, TileSkeleton, TableSkeleton } from "./primitives/ListSkeleton";
export type { ListSkeletonProps, TableSkeletonProps } from "./primitives/ListSkeleton";

export { default as ErrorState } from "./primitives/ErrorState";
export type { ErrorStateProps } from "./primitives/ErrorState";

export { default as Dialog } from "./primitives/Dialog";
export type { DialogProps } from "./primitives/Dialog";

export { default as SidePanel } from "./primitives/SidePanel";
export type { SidePanelProps } from "./primitives/SidePanel";

export { default as SideSheet, SIDE_SHEET_MS, SIDE_SHEET_REDUCED_MS } from "./primitives/SideSheet";
export type { SideSheetProps } from "./primitives/SideSheet";

export { default as DragHandle, dragHandleClass } from "./primitives/DragHandle";
export type { DragHandleProps } from "./primitives/DragHandle";

export { default as Tooltip, TOOLTIP_DELAY_MS } from "./primitives/Tooltip";
export type { TooltipProps, TooltipSide } from "./primitives/Tooltip";

/* ── The admin page kit's shared bits (E2E-A15.0): a delta computed from a real previous value, never typed in ── */
export { default as DeltaChip, deltaOf } from "./primitives/DeltaChip";
export type { Delta, DeltaDir, DeltaOptions, DeltaChipProps } from "./primitives/DeltaChip";

export { default as SavedTick, useSavedFlash, SAVED_TICK_MS } from "./primitives/SavedTick";
export type { SavedTickProps, SavedFlash } from "./primitives/SavedTick";

export { default as PageFrame, fitScale } from "./primitives/PageFrame";
export type { PageFrameProps } from "./primitives/PageFrame";

export { default as Popover } from "./primitives/Popover";
export type { PopoverProps, PopoverTriggerApi } from "./primitives/Popover";

export { default as AiDisclosure, AI_DISCLOSURE_LINE, AI_SENT_DEFAULT, AI_CHIP_TEXT } from "./primitives/AiDisclosure";
export type { AiDisclosureProps } from "./primitives/AiDisclosure";

export { default as DiffText } from "./primitives/DiffText";
export type { DiffTextProps, DiffPart, DiffPartType } from "./primitives/DiffText";

export { default as Menu } from "./primitives/Menu";
export type { MenuProps, MenuItem, MenuHeading, MenuSeparator, MenuEntry } from "./primitives/Menu";

export { Mark, Wordmark, BrandLockup, Check } from "./primitives/Brand";
export type { MarkProps, WordmarkProps, BrandLockupProps } from "./primitives/Brand";

/* ── The ENTERPRISE bee (X2.8): never the regular Kiwiply mascot; not for (marketing)/(app)/(org)/(admin) pages ── */
export { default as MascotPose, MascotProvider, useMascotBase, MASCOT_POSES, POSE_KEYS, MASCOT_HEIGHT, DEFAULT_MASCOT_BASE, poseUrl, poseSize, celebrate } from "./primitives/MascotPose";
export type { EnterprisePose, MascotPoseProps, MascotSize, PoseDef } from "./primitives/MascotPose";

/* ── The enterprise kit (X2.15): FilterBar, DataTable, ReasonSheet, StatePill, MoneyText, KanbanBoard, ... ── */
export * from "./enterprise";

export * from "./primitives/icons";
export * from "./primitives/doodles";

export { cn } from "./primitives/cn";

/* ── Tenant brand colours (Enterprise V2 X2.12): two hex colours -> a contrast-safe variable set ─ */
export {
  AA_BODY,
  AA_LARGE,
  DARK_SURFACE,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  LIGHT_SURFACE,
  STEPS as BRAND_STEPS,
  brandScale,
  contrastRatio,
  isHex as isHexColor,
  onColor,
  rolesFor as brandRoles,
  tenantThemeCss,
  tenantThemeVars,
  whiteTextCheck,
} from "./color/brand";
export type { BrandRoles, Scale as BrandScale, Step as BrandStep } from "./color/brand";

/* ── Never-collected values detector (Resume Builder R1.1; twin of the API's SensitivePatterns) ─ */
/* Aliased with a "Sensitive" tag because `scan` / `redact` are too generic for a package barrel. */
export {
  scan as scanSensitive,
  scanField as scanSensitiveField,
  redact as redactSensitive,
  redactField as redactSensitiveField,
  SENSITIVE_LABELS,
  REDACTED as SENSITIVE_REDACTED,
} from "./sensitive-patterns";
export type { SensitiveClass, Hit as SensitiveHit } from "./sensitive-patterns";

/* ── The portable ResumeUpload form + its types ───────────────────────────────────── */
/* ── The job-fit report (13.3): shared by the extension drawer and the web board ─────── */
export { default as JobFitReport } from "./JobFitReport";
export type { JobFitData, JobFitReportProps } from "./JobFitReport";

export { default as AtsReport } from "./AtsReport";
export type { AtsCheck, AtsKeywords, AtsReportData, AtsReportProps } from "./AtsReport";

export { default as ResumeUpload } from "./ResumeUpload";
export type {
  EditTarget,
  SaveInput,
  SaveResult,
  ResumeToast,
  ResumeUploadServices,
} from "./ResumeUpload";
export type {
  StructuredResume,
  ParsedBio,
  ResumeExperience,
  ResumeEducation,
  ResumeLanguage,
  ResumeProject,
} from "./parser-core-types";

/* ── Resume templates (Resume Builder R0.4): document contract, registry, projection, preview ─ */
/* Import the stylesheet separately: `@kiwiply/ui/styles/resume.css` (fonts: `fonts/`). */
export { default as ResumePreview } from "./resume/ResumePreview";
export type { ResumePreviewProps } from "./resume/ResumePreview";
export {
  SCHEMA_VERSION as RESUME_DOC_SCHEMA_VERSION,
  SECTION_KINDS as RESUME_SECTION_KINDS,
  DEFAULT_SECTION_TITLES as RESUME_DEFAULT_SECTION_TITLES,
} from "./resume/types";
export type {
  ResumeDocument,
  Section as ResumeSection,
  SectionKind as ResumeSectionKind,
  Bullet as ResumeBullet,
  Src as ResumeSrc,
  DocMeta as ResumeDocMeta,
  DocBasics as ResumeDocBasics,
  DocLink as ResumeDocLink,
  SummaryItem,
  ExperienceItem,
  EducationItem,
  SkillsItem,
  ProjectItem,
  CertificationItem,
  LanguageItem,
  AchievementItem,
  CustomItem,
  Theme as ResumeTheme,
  FitState,
  FontPair,
  PageSize,
  DateStyle,
  TemplateMeta,
  TemplateProps,
  TemplateDefinition,
  TemplateCapabilities,
  Spacing as ResumeSpacing,
  CustomMode as ResumeCustomMode,
  HeadingsMode as ResumeHeadingsMode,
  Mark as ResumeMark,
  MarkType as ResumeMarkType,
  ListStyle as ResumeListStyle,
  InterestsItem,
  DocPhoto as ResumeDocPhoto,
  JobRef as ResumeJobRef,
  TailoredFrom as ResumeTailoredFrom,
  ResumeDocumentV1,
  ResumeDocumentAnySchema,
} from "./resume/types";
export { MARK_TYPES as RESUME_MARK_TYPES } from "./resume/types";
export { upgradeDocument as upgradeResumeDocument } from "./resume/upgrade";
export { toggleMark, shiftMarks, isCovered, sortMarks, isLinkHref, clearMark, markAt } from "./resume/marks";
export { RichText as ResumeRichText } from "./resume/templates/shared";
export { TEMPLATES, TEMPLATE_IDS, DEFAULT_TEMPLATE_ID, getTemplate, hasTemplate, listTemplates, resolveCapabilities } from "./resume/registry";
export {
  ATS_STRICT,
  DESIGN_FREE,
  isAtLeastAsStrictAs,
  tightenCapabilities,
  allowedMarks,
  planSections,
  headingFor,
  photoShown,
  hiddenContent,
  hiddenNotice,
  controlStates,
  LIMITED_CUSTOM_TITLE,
} from "./resume/capabilities";
export type { HiddenItem, HiddenKind, EditorControls, ControlState, ToolbarButton, PlannedSection } from "./resume/capabilities";
export { scoreResume, failingRules, toPersistedScore } from "./resume/score";
export type {
  ScoreContext as ResumeScoreContext,
  ScoreReport as ResumeScoreReport,
  ScoreGroupReport as ResumeScoreGroup,
  ScoreRuleReport as ResumeScoreRule,
  PersistedScore as ResumePersistedScore,
  JdExtract as ResumeJdExtract,
} from "./resume/score";
export { DEFAULT_SCORE_CONFIG, GROUPS as SCORE_GROUPS, RULES as SCORE_RULES, RULESET_VERSION as SCORE_RULESET_VERSION, ADD_REF_PREFIX as SCORE_ADD_REF_PREFIX } from "./resume/score-rules";
export type { ScoreConfig as ResumeScoreConfig, ScoreBand as ResumeScoreBand, GroupId as ResumeScoreGroupId, RuleId as ResumeScoreRuleId } from "./resume/score-rules";
export { toStructured, toStructuredJson, toStructuredPretty } from "./resume/project";
export { renderText as renderResumeText } from "./resume/text";
export { writeJson, canonicalJson, contentHash as resumeContentHash, renderHash as resumeRenderHash } from "./resume/json";
export type { WriteOptions } from "./resume/json";
export { FIT_LADDER, SPACING_PRESETS, MAX_FIT_STEP, PAGE_DIMENSIONS, clampStep, resolveTheme, stepValues, pageCount, fitToPages } from "./resume/fit";
export type { FitStep, FitDelta, FitResult } from "./resume/fit";
export { DEFAULT_THEME, FONT_STACKS, INK, applyCapabilities, sanitizeTheme, themeCss, themeScope } from "./resume/theme";
