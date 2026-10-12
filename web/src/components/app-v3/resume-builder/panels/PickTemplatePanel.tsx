import PanelPlaceholder from "./PanelPlaceholder";
import { PANEL_META } from "./panelMeta";

/** Pick Template (board 1). Shell until R2.4. */
export default function PickTemplatePanel() {
  return <PanelPlaceholder panel="template" comingIn={PANEL_META.template.comingIn} />;
}
