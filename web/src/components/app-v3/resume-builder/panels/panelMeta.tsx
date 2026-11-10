import type { ReactNode } from "react";
import { FileTextIcon, PlusIcon, SparklesIcon, SwapIcon } from "@kiwiply/ui";
import type { LeftPanel } from "../state/ui";

/** The header of each left panel (DESIGN 10.3.1-10.3.4) and the top-bar button's label + shortcut. */
export interface PanelMeta {
  /** The top-bar button label AND the sheet title (the boards use the same words for both). */
  title: string;
  description: string;
  icon: ReactNode;
  /** `Alt+<n>` toggles the panel. */
  shortcut: string;
  /** The story that fills the body; shown by the placeholder. */
  comingIn: string;
}

const ICON = "h-5 w-5";

export const PANEL_ORDER: readonly LeftPanel[] = ["add", "template", "swap", "tailor"];

export const PANEL_META: Record<LeftPanel, PanelMeta> = {
  add: {
    title: "Add Section",
    description: "Choose a section to add to your resume",
    icon: <PlusIcon className={ICON} />,
    shortcut: "1",
    comingIn: "R2.12",
  },
  template: {
    title: "Pick Template",
    description: "Choose the best layout for your resume",
    icon: <FileTextIcon className={ICON} />,
    shortcut: "2",
    comingIn: "R2.4",
  },
  swap: {
    title: "Swap Section",
    description: "Drag to reorder sections or items",
    icon: <SwapIcon className={ICON} />,
    shortcut: "3",
    comingIn: "R2.2",
  },
  tailor: {
    title: "Tailor to Job",
    description: "Pick the job this resume is for",
    icon: <SparklesIcon className={ICON} />,
    shortcut: "4",
    comingIn: "R5.8",
  },
};
