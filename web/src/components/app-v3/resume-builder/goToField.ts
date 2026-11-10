/**
 * "Go to" for a tip (DESIGN 10.7 TipsSheet): scroll the field a score rule points at into view and put
 * the caret there. A ref is a `data-field` id of the canvas (`state/paths.ts`): `basics.email`, a section
 * id (`s_...`), an item id (`i_...`), `<itemId>.text`, a bullet id (`b_...`). A block (section / item row)
 * is not itself a control, so focus lands on its first control. Returns whether anything was found.
 */
const FOCUSABLE = 'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),[contenteditable="true"],a[href]';

export function goToField(ref: string, root: ParentNode = document): boolean {
  const esc = (v: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&"));
  const el =
    root.querySelector<HTMLElement>(`[data-field="${esc(ref)}"]`) ??
    // a ref to something the canvas only shows below the row ("i_x" -> "i_x.title"), or the section's first field
    root.querySelector<HTMLElement>(`[data-field^="${esc(ref)}."]`);
  if (!el) return false;
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
  if (target) {
    target.focus({ preventScroll: true });
    return true;
  }
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  return true;
}
