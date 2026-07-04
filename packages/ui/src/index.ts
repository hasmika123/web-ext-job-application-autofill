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

export { default as Tabs, TabList, Tab, TabPanel } from "./primitives/Tabs";
export type { TabsProps } from "./primitives/Tabs";

export { ToastProvider, useToast } from "./primitives/Toast";
export type { ToastOptions, ToastVariant } from "./primitives/Toast";

export { default as Skeleton } from "./primitives/Skeleton";
export { default as Spinner } from "./primitives/Spinner";
export type { SpinnerProps } from "./primitives/Spinner";

export { default as EmptyState } from "./primitives/EmptyState";
export type { EmptyStateProps } from "./primitives/EmptyState";

export { default as Dialog } from "./primitives/Dialog";
export type { DialogProps } from "./primitives/Dialog";

export { default as SidePanel } from "./primitives/SidePanel";
export type { SidePanelProps } from "./primitives/SidePanel";

export { default as Tooltip } from "./primitives/Tooltip";
export type { TooltipProps, TooltipSide } from "./primitives/Tooltip";

export { default as Menu } from "./primitives/Menu";
export type { MenuProps, MenuItem, MenuHeading, MenuSeparator, MenuEntry } from "./primitives/Menu";

export { Mark, Wordmark, BrandLockup, Check } from "./primitives/Brand";
export type { MarkProps, WordmarkProps, BrandLockupProps } from "./primitives/Brand";

export * from "./primitives/icons";

export { cn } from "./primitives/cn";

/* ── The portable ResumeUpload form + its types ───────────────────────────────────── */
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
