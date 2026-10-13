import "@kiwiply/ui/styles/resume.css";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ResumePreview, applyCapabilities, fitToPages, sanitizeTheme } from "@kiwiply/ui";
import type { FitResult, ResumeDocument, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";
import { contentHeightOf, drawnTheme, paginate } from "./paginate";

export interface FitInput {
  doc: ResumeDocument;
  /** The STORED theme (the ladder step is chosen here, not read from it). */
  theme: Partial<ResumeTheme> | null;
  templateId: string;
  caps: TemplateCapabilities;
  photoSrc?: string | null;
}

/**
 * Renders the document once, off-screen, at `theme` (already resolved to a ladder step) and returns the
 * pages it needs. Synchronous (`flushSync`), so the fit ladder can walk its seven steps in one click
 * without a server call; the frame is removed again before returning. Call it from an event handler,
 * never from a render or an effect.
 */
export function measurePages(input: FitInput, resolved: ResumeTheme): number {
  const { doc, templateId, caps, photoSrc } = input;
  const drawn = drawnTheme(resolved, caps);
  const frame = document.createElement("div");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:${paginate(0, resolved, caps).pageWidthPx}px`;
  document.body.appendChild(frame);
  const root = createRoot(frame);
  try {
    flushSync(() => root.render(<ResumePreview doc={doc} theme={resolved} templateId={templateId} caps={caps} photoSrc={photoSrc} />));
    const sheet = frame.querySelector<HTMLElement>(".rz-page");
    const sheetPx = sheet ? sheet.offsetHeight : 0;
    return paginate(contentHeightOf(sheetPx, drawn.margin), resolved, caps).pages;
  } finally {
    root.unmount();
    frame.remove();
  }
}

/**
 * "Fit to one page": the fit ladder (`fit.ts#fitToPages`, the same seven steps the preview and the PDF
 * route use) run from the Spacing preset, measuring each step by an off-screen render. The result's
 * `step` is what to store; `fits` is false when the ladder ended and the resume is still too long.
 */
export function runFitLadder(input: FitInput): FitResult {
  const base = applyCapabilities(sanitizeTheme(input.theme), input.caps);
  return fitToPages(base, base.fit.target, (resolved) => measurePages(input, resolved), 0);
}
