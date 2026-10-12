import PanelPlaceholder from "./PanelPlaceholder";
import { PANEL_META } from "./panelMeta";

/** Swap Section (board 2). Shell until R2.2. */
export default function SwapSectionPanel() {
  return (
    <PanelPlaceholder panel="swap" comingIn={PANEL_META.swap.comingIn}>
      <p className="mt-2 text-[12.5px] text-muted">Rearrange your resume structure. Changes update in the resume inline.</p>
    </PanelPlaceholder>
  );
}
