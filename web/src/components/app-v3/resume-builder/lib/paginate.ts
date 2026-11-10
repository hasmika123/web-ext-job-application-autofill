/**
 * Client-side pagination for the Print layout view (DESIGN 10.8). Pure: the view renders the document
 * ONCE in a measuring frame (the template's `.rz-page`, a tall sheet), reports how tall it is, and this
 * turns that height into the number of pages and the offsets the view clips the same render at - no
 * server call. The page-count rule itself is `fit.ts#pageCount`, the same one the fit ladder and the
 * preview badge use, so the three can never disagree.
 */
import { PAGE_DIMENSIONS, applyCapabilities, pageCount, resolveTheme, sanitizeTheme } from "@kiwiply/ui";
import type { ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";

/** CSS px per inch (the unit `fit.ts` and `@page` both use). */
// config-literal-ok: CSS unit conversion (px per inch), not a tunable
export const PX_PER_IN = 96;

export interface Pagination {
  /** Pages the content needs (>= 1). */
  pages: number;
  /** Pages the document may use: the stored Page Length, capped by the template's `maxPages`. */
  limit: 1 | 2;
  /** `pages > limit`. */
  over: boolean;
  /** The sheet in CSS px (Letter 816 x 1056, A4 794 x 1123). */
  pageWidthPx: number;
  pageHeightPx: number;
  /** Page margin in px (from the spacing preset + the stored ladder step). */
  marginPx: number;
  /** Content that fits on one page: page height minus both margins. */
  perPagePx: number;
  /** Where each page's content starts in the measured sheet's content box (page i shows `[offsets[i], offsets[i] + perPagePx)`). */
  offsets: number[];
}

/** The theme as the template draws it at its stored ladder step (what `ResumePreview` renders). */
export function drawnTheme(theme: Partial<ResumeTheme> | null | undefined, caps: TemplateCapabilities): ResumeTheme {
  const base = sanitizeTheme(theme);
  return applyCapabilities(resolveTheme(base, base.fit.step), caps);
}

/**
 * The content-box height of a measured `.rz-page` (its `offsetHeight` includes the padding the margin
 * draws on every side, and a minimum of one page).
 */
export function contentHeightOf(sheetHeightPx: number, marginIn: number): number {
  return Math.max(0, sheetHeightPx - 2 * marginIn * PX_PER_IN);
}

/** How the content of `contentHeightPx` (the sheet's content box) falls onto pages at `theme`'s stored step. */
export function paginate(contentHeightPx: number, theme: Partial<ResumeTheme> | null | undefined, caps: TemplateCapabilities): Pagination {
  const drawn = drawnTheme(theme, caps);
  const dims = PAGE_DIMENSIONS[drawn.pageSize];
  const pageWidthPx = Math.round(dims.widthIn * PX_PER_IN);
  const pageHeightPx = Math.round(dims.heightIn * PX_PER_IN);
  const marginPx = drawn.margin * PX_PER_IN;
  const perPagePx = (dims.heightIn - 2 * drawn.margin) * PX_PER_IN;
  const pages = pageCount(contentHeightPx, drawn.pageSize, drawn.margin);
  const limit = drawn.fit.target;
  return {
    pages,
    limit,
    over: pages > limit,
    pageWidthPx,
    pageHeightPx,
    marginPx,
    perPagePx,
    offsets: Array.from({ length: pages }, (_, i) => i * perPagePx),
  };
}
