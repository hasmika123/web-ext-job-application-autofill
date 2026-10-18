"use client";

import { createContext, useContext, useEffect, useLayoutEffect, type ReactNode } from "react";

/**
 * What a page tells the shell (X2.16):
 *  - `<PageHeader title subtitle />`: the page's own title and subtitle, drawn in the top bar (and above the content on a
 *    phone). Until the page has mounted the shell shows the active menu item's label, so the first paint already has a title.
 *  - `<ClaimsMascot />`: the page shows a bee of its own; the sidebar's "Need help?" card then drops its bee for that view
 *    (one mascot per viewport, doc 11 s6).
 */
export interface PageHeaderValue {
  title: string;
  subtitle?: string | null;
}

export interface ShellSlot {
  setHeader(value: PageHeaderValue | null): void;
  claimMascot(on: boolean): void;
  /** The page draws its own "Need help?" card (the dashboard board does): the sidebar card hides, the help panel stays reachable. */
  claimHelp?(on: boolean): void;
}

export const ShellSlotContext = createContext<ShellSlot | null>(null);

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function PageHeader({ title, subtitle }: PageHeaderValue): ReactNode {
  const slot = useContext(ShellSlotContext);
  useIsoLayoutEffect(() => {
    slot?.setHeader({ title, subtitle: subtitle ?? null });
    return () => slot?.setHeader(null);
  }, [slot, title, subtitle]);
  return null;
}

export function ClaimsMascot(): ReactNode {
  const slot = useContext(ShellSlotContext);
  useIsoLayoutEffect(() => {
    slot?.claimMascot(true);
    return () => slot?.claimMascot(false);
  }, [slot]);
  return null;
}

/** The page shows its own "Need help?" card; the sidebar one steps aside (X2.17). Open the shared panel with `openHelpPanel()`. */
export function ClaimsHelpCard(): ReactNode {
  const slot = useContext(ShellSlotContext);
  useIsoLayoutEffect(() => {
    slot?.claimHelp?.(true);
    return () => slot?.claimHelp?.(false);
  }, [slot]);
  return null;
}

export const OPEN_HELP_EVENT = "kiwiply:open-help";
export const openHelpPanel = (): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_HELP_EVENT));
};
