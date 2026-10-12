"use client";

import "@kiwiply/ui/styles/resume.css";
import { memo } from "react";
import { CheckIcon, PAGE_DIMENSIONS, PageFrame, ResumePreview, cn, hiddenContent, sanitizeTheme } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme, TemplateCapabilities, TemplateMeta } from "@kiwiply/ui";

/** The live thumbnail scale (DESIGN 7.4: the user's own document through the template at `PageFrame` scale 0.22). */
const THUMB_SCALE = 0.22;

export interface TemplateCardProps {
  meta: TemplateMeta;
  /** The template's resolved capabilities (registry + admin overrides): the "ATS Friendly" chip and what a switch hides. */
  caps: TemplateCapabilities;
  selected: boolean;
  doc: ResumeDocument;
  theme: Partial<ResumeTheme> | null;
  disabled?: boolean;
  onPick(templateId: string): void;
}

/**
 * One template in the Pick Template grid (board 1, DESIGN 7.4): the live thumbnail, the name bottom-left,
 * `✓ Selected` (green) on the active one else `ATS Friendly` when the template says so, and - before the
 * click - a "Hides: ..." line when switching would hide content (DESIGN 6.5), so the choice is informed.
 */
function TemplateCard({ meta, caps, selected, doc, theme, disabled, onPick }: TemplateCardProps) {
  const base = sanitizeTheme(theme);
  const pageWidth = Math.round(PAGE_DIMENSIONS[base.pageSize].widthIn * 96);
  const hides = selected ? [] : hiddenContent(doc, base, caps);
  const hidesId = `rb-tpl-hides-${meta.id}`;

  return (
    <button
      type="button"
      data-template={meta.id}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      aria-describedby={hides.length > 0 ? hidesId : undefined}
      onClick={() => {
        if (!disabled && !selected) onPick(meta.id);
      }}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-paper p-2 text-left transition-[border-color,box-shadow]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected ? "border-2 border-accent shadow-v2-soft" : "border-line hover:border-accent",
        disabled ? "cursor-not-allowed opacity-70" : selected ? "cursor-default" : "cursor-pointer",
      )}
    >
      {/* the user's own document through this template; decorative (the name and chip say what it is) */}
      <div aria-hidden className="pointer-events-none h-36 overflow-hidden rounded-md bg-paper-2">
        <PageFrame pageWidth={pageWidth} maxScale={THUMB_SCALE} label={`${meta.name} preview`}>
          <ResumePreview doc={doc} theme={theme} templateId={meta.id} caps={caps} />
        </PageFrame>
      </div>

      <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{meta.name}</span>
        {selected ? (
          <span className="inline-flex flex-none items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[11.5px] font-semibold text-on-accent">
            <CheckIcon className="h-3 w-3" aria-hidden /> Selected
          </span>
        ) : caps.ats ? (
          <span className="flex-none rounded-md bg-paper-2 px-2 py-0.5 text-[11.5px] font-semibold text-ink-soft">ATS Friendly</span>
        ) : null}
      </div>

      {hides.length > 0 && (
        <p id={hidesId} className="mt-1 text-[11.5px] leading-snug text-ink-soft">
          Hides: {hides.map((h) => h.label).join(", ")}
        </p>
      )}
    </button>
  );
}

export default memo(TemplateCard);
