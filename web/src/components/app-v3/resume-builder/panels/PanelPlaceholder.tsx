import type { ReactNode } from "react";

/** The body of a left panel whose contents belong to a later story. The header is drawn by `SideSheet`. */
export default function PanelPlaceholder({ panel, comingIn, children }: { panel: string; comingIn: string; children?: ReactNode }) {
  return (
    <div
      data-panel-placeholder={panel}
      className="rounded-xl border border-dashed border-line bg-paper-2/60 p-4 text-[13.5px] leading-relaxed text-ink-soft"
    >
      <p className="font-semibold text-ink">Coming in {comingIn}</p>
      <p className="mt-1">This panel opens and closes already; its contents arrive with that story.</p>
      {children}
    </div>
  );
}
