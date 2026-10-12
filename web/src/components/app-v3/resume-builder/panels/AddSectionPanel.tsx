import type { ResumeSectionKind } from "@kiwiply/ui";
import PanelPlaceholder from "./PanelPlaceholder";
import { PANEL_META } from "./panelMeta";

/**
 * Add Section (board 3). Shell until R2.12. `focusKind` is the R2.10 hook: a section tab for a kind the
 * document lacks opens this panel with that row focused (R2.12 reads it).
 */
export default function AddSectionPanel({ focusKind }: { focusKind?: ResumeSectionKind | null }) {
  return (
    <div data-focus-kind={focusKind ?? undefined}>
      <PanelPlaceholder panel="add" comingIn={PANEL_META.add.comingIn} />
    </div>
  );
}
