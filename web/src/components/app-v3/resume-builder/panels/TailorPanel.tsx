import PanelPlaceholder from "./PanelPlaceholder";
import { PANEL_META } from "./panelMeta";

/** Tailor to Job (DESIGN 10.3.4). Shell until R5.8. */
export default function TailorPanel() {
  return <PanelPlaceholder panel="tailor" comingIn={PANEL_META.tailor.comingIn} />;
}
