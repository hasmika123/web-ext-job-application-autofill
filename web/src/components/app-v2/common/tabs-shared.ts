import type { ReactNode } from "react";

/** One tab. `id` (or `value`, the older spelling) is the key `onChange` reports. */
export interface TabDef {
  id?: string;
  value?: string;
  label: string;
  /** Rendered as "Label (n)" (or a count pill, see UnderlineTabs `counts`). */
  count?: number;
  icon?: ReactNode;
  /** A trailing chevron (e.g. "Departments ▾"). */
  menu?: boolean;
}

/** The tab's key, whichever of `id` / `value` was given. */
export const tabKey = (t: TabDef): string => t.id ?? t.value ?? t.label;
