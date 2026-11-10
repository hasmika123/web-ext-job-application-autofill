"use client";

import { useMemo } from "react";
import { EyeOffIcon, Tooltip, cn, hiddenContent, sanitizeTheme } from "@kiwiply/ui";
import type { HiddenItem, HiddenKind, ResumeDocument, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";

/** The one-line "Why?" for each kind of hidden thing (DESIGN 6.5); short, because the tooltip does not wrap. */
export function whyHidden(kind: HiddenKind, ats: boolean): string {
  switch (kind) {
    case "photo":
      return ats ? "ATS parsers can't read photos" : "This template has no photo";
    case "marks":
      return "This template doesn't draw that formatting";
    case "lists":
      return "This template draws plain lines, not lists";
    case "section":
      return ats ? "ATS parsers only read standard sections" : "This template has no place for it";
    case "custom":
      return ats ? "ATS templates allow few custom sections" : "Over this template's custom section limit";
    case "headingOverride":
      return "This template uses the standard heading";
    case "accent":
      return ats ? "ATS templates are single-colour" : "This template has no accent colour";
    case "font":
      return "This template allows other fonts only";
    case "pages":
      return "This template is limited to one page";
  }
}

/** `photo`, `italic (3)`, `Interests`: the label with its count. */
export function hiddenChipText(item: HiddenItem): string {
  return item.count && item.count > 1 ? `${item.label} (${item.count})` : item.label;
}

export interface HiddenContentBarProps {
  doc: ResumeDocument;
  theme: Partial<ResumeTheme> | null;
  /** The ACTIVE template's resolved capabilities. */
  caps: TemplateCapabilities;
  className?: string;
}

/**
 * The persistent notice under the section tabs (DESIGN 6.5): while the active template hides anything the
 * document or theme contains - nothing is deleted - a chip row says what, with a "Why?" tooltip per chip.
 * Renders nothing when everything is shown. Switching to a capable template makes the chips go away.
 */
export default function HiddenContentBar({ doc, theme, caps, className }: HiddenContentBarProps) {
  const items = useMemo(() => hiddenContent(doc, sanitizeTheme(theme), caps), [doc, theme, caps]);
  if (items.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Hidden in this template"
      data-hidden-content
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-v2-line/70 bg-paper px-4 py-2.5 text-[13px] shadow-v2-soft", className)}
    >
      <EyeOffIcon className="h-4 w-4 flex-none text-ink-soft" aria-hidden />
      <span className="font-semibold text-ink">Hidden in this template:</span>
      <ul className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const text = hiddenChipText(item);
          const why = whyHidden(item.kind, caps.ats);
          return (
            <li key={`${item.kind}-${i}`}>
              <Tooltip content={`Why? ${why}`} side="bottom">
                <span
                  tabIndex={0}
                  aria-label={`${text}. Why: ${why}`}
                  className="inline-flex cursor-help items-center rounded-md bg-paper-2 px-2 py-0.5 text-[12.5px] font-medium text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {text}
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      <span className="text-[12px] text-muted">Still saved: switch template to show it again.</span>
    </div>
  );
}
