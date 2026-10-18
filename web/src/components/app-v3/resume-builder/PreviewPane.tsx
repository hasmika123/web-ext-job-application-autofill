"use client";

import "@kiwiply/ui/styles/resume.css";
import { useDeferredValue, useState } from "react";
import { PAGE_DIMENSIONS, PageFrame, ResumePreview, pageCount, resolveTheme, sanitizeTheme, cn } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";

/**
 * The live preview: the real template (`ResumePreview`, the same markup the PDF will print) inside
 * a `PageFrame` that scales the sheet to the pane. The document is deferred so typing stays
 * responsive while the page re-renders at lower priority.
 */
export default function PreviewPane({
  doc,
  theme,
  templateId,
  className,
}: {
  doc: ResumeDocument;
  theme: Partial<ResumeTheme> | null;
  templateId: string;
  className?: string;
}) {
  const deferred = useDeferredValue(doc);
  const base = sanitizeTheme(theme);
  const resolved = resolveTheme(base, base.fit.step);
  const pageWidth = Math.round(PAGE_DIMENSIONS[base.pageSize].widthIn * 96);
  const [contentHeight, setContentHeight] = useState(0);
  const pages = contentHeight > 0 ? pageCount(contentHeight - 2 * resolved.margin * 96, base.pageSize, resolved.margin) : 1;

  return (
    <section aria-label="Live preview" className={cn("min-w-0 rounded-2xl border border-v2-line/70 bg-paper-2 p-3 shadow-v2-soft sm:p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px] text-ink-soft">
        <span className="font-semibold text-ink">Preview</span>
        <span aria-live="polite">
          {pages} {pages === 1 ? "page" : "pages"} {"·"} {base.pageSize === "a4" ? "A4" : "Letter"}
        </span>
      </div>
      <PageFrame pageWidth={pageWidth} onMeasure={(m) => setContentHeight((h) => (Math.abs(h - m.contentHeight) < 1 ? h : m.contentHeight))}>
        <ResumePreview doc={deferred} theme={theme} templateId={templateId} />
      </PageFrame>
    </section>
  );
}
