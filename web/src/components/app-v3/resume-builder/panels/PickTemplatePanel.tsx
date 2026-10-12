"use client";

import { useDeferredValue, useMemo } from "react";
import type { ReactNode } from "react";
import { CheckIcon, ChoiceGroup, Select, cn, controlStates, getTemplate, hasTemplate, resolveCapabilities, sanitizeTheme } from "@kiwiply/ui";
import type { FontPair, ResumeDocument, ResumeSpacing, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config";
import type { PresentationControls } from "../usePresentation";
import { DATE_STYLE_LABELS, FONT_LABELS, SPACING_LABELS, colorName } from "../themeEdit";
import TemplateCard from "./TemplateCard";

export interface PickTemplatePanelProps {
  doc: ResumeDocument;
  templateId: string;
  theme: Partial<ResumeTheme> | null;
  /** The admin config: the enabled template list, the capability overrides and the accent palette. */
  config: ResumeBuilderConfig;
  controls: PresentationControls;
  /** Controls are off while the editor cannot save (a conflict is waiting for the user's answer). */
  disabled?: boolean;
}

/** The templates to offer: `config.templates.enabled` in order (ids the registry knows), the active one always among them. */
export function offeredTemplateIds(enabled: readonly string[], active: string): string[] {
  const ids = enabled.filter((id, i) => hasTemplate(id) && enabled.indexOf(id) === i);
  const current = getTemplate(active).meta.id;
  return ids.includes(current) ? ids : [current, ...ids];
}

function Row({ label, labelId, hint, children }: { label: string; labelId: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center">
      <span id={labelId} className="text-[13.5px] font-medium text-ink-soft">
        {label}
      </span>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1 text-[11.5px] leading-snug text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/** Round colour swatches; disabled (`aria-disabled`) when the template draws no accent colour. */
function AccentSwatches({ palette, value, enabled, onPick }: { palette: readonly string[]; value: string; enabled: boolean; onPick(hex: string): void }) {
  return (
    <div role="radiogroup" aria-labelledby="rb-tpl-accent" className="flex flex-wrap items-center gap-2.5">
      {palette.map((hex) => {
        const on = hex.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={!enabled || undefined}
            aria-label={colorName(hex)}
            title={enabled ? colorName(hex) : undefined}
            onClick={() => {
              if (enabled && !on) onPick(hex);
            }}
            className={cn(
              "relative flex h-7 w-7 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-paper transition-shadow",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              on && "ring-2 ring-ink/30",
              enabled ? "cursor-pointer hover:ring-2 hover:ring-ink/20" : "cursor-not-allowed opacity-45",
            )}
            style={{ backgroundColor: hex }}
          >
            {on && <CheckIcon className="h-3.5 w-3.5" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pick Template (board 1, DESIGN 7.4 + 10.3.2): a grid of the enabled templates, each drawn with the user's
 * own document, and Customize Template (Accent Color, Font Family, Spacing, Page Length; Date style when the
 * template renders both). Everything is data: the list from `config.templates.enabled`, the palette from
 * `config.theme.accentPalette`, which controls are on from the template's resolved capabilities
 * (`controlStates`, DESIGN 6.4). A change updates the editor at once; saving is `usePresentation`'s job.
 */
export default function PickTemplatePanel({ doc, templateId, theme, config, controls, disabled }: PickTemplatePanelProps) {
  const deferredDoc = useDeferredValue(doc);
  const stored = useMemo(() => sanitizeTheme(theme), [theme]);
  const ids = useMemo(() => offeredTemplateIds(config.templates.enabled, templateId), [config.templates.enabled, templateId]);
  const overrides = config.templates.overrides;
  const caps = useMemo<Record<string, TemplateCapabilities>>(
    () => Object.fromEntries(ids.map((id) => [id, resolveCapabilities(id, overrides)])),
    [ids, overrides],
  );
  const activeId = getTemplate(templateId).meta.id;
  const activeCaps = caps[activeId] ?? resolveCapabilities(activeId, overrides);
  const ctl = useMemo(() => controlStates(doc, activeCaps), [doc, activeCaps]);

  const fontValue: FontPair = ctl.fontPairs.includes(stored.fontPair) ? stored.fontPair : (ctl.fontPairs[0] ?? stored.fontPair);
  const fontChanged = fontValue !== stored.fontPair;
  const pages = Math.min(stored.fit.target, activeCaps.maxPages);
  const dateOptions = activeCaps.dateStyles;

  return (
    <div className="flex flex-col gap-6" data-panel="template">
      <div role="group" aria-label="Templates" className="grid grid-cols-2 gap-3">
        {ids.map((id) => (
          <TemplateCard
            key={id}
            meta={getTemplate(id).meta}
            caps={caps[id]}
            selected={id === activeId}
            doc={deferredDoc}
            theme={theme}
            disabled={disabled}
            onPick={controls.switchTemplate}
          />
        ))}
      </div>

      <section aria-labelledby="rb-tpl-customize" className="flex flex-col gap-4 border-t border-line/70 pt-5">
        <h3 id="rb-tpl-customize" className="font-display text-[15px] font-extrabold text-ink">
          Customize Template
        </h3>

        <Row label="Accent Color" labelId="rb-tpl-accent" hint={ctl.accent.enabled ? undefined : ctl.accent.hint}>
          <AccentSwatches
            palette={config.theme.accentPalette}
            value={stored.accent}
            enabled={ctl.accent.enabled && !disabled}
            onPick={(hex) => controls.changeTheme({ control: "accent", value: hex })}
          />
        </Row>

        <Row label="Font Family" labelId="rb-tpl-font" hint={fontChanged ? "Changed for this template; your choice returns with a template that allows it." : undefined}>
          <Select
            aria-label="Font Family"
            value={fontValue}
            disabled={disabled}
            options={ctl.fontPairs.map((f) => ({
              value: f,
              label: f === fontValue && fontChanged ? `${FONT_LABELS[f]} (changed for ${activeCaps.ats ? "ATS" : "this template"})` : FONT_LABELS[f],
            }))}
            onChange={(v) => controls.changeTheme({ control: "font", value: v as FontPair })}
          />
        </Row>

        <Row label="Spacing" labelId="rb-tpl-spacing" hint={ctl.spacing.enabled ? undefined : ctl.spacing.hint}>
          <ChoiceGroup
            aria-labelledby="rb-tpl-spacing"
            className="grid grid-cols-3 gap-2 [&>button]:rounded-lg [&>button]:px-2 [&>button]:text-[13px]"
            disabled={!ctl.spacing.enabled || disabled}
            value={stored.spacing}
            options={(Object.keys(SPACING_LABELS) as ResumeSpacing[]).map((s) => ({ value: s, label: SPACING_LABELS[s] }))}
            onChange={(v) => controls.changeTheme({ control: "spacing", value: v as ResumeSpacing })}
          />
        </Row>

        <Row label="Page Length" labelId="rb-tpl-pages" hint={ctl.pageLength.enabled ? undefined : ctl.pageLength.hint}>
          <ChoiceGroup
            aria-labelledby="rb-tpl-pages"
            className="grid grid-cols-2 gap-2 [&>button]:rounded-lg [&>button]:px-2 [&>button]:text-[13px]"
            disabled={!ctl.pageLength.enabled || disabled}
            value={String(pages)}
            options={[{ value: "1", label: "One Page" }, ...(ctl.pageLength.twoPages ? [{ value: "2", label: "Two Pages" }] : [])]}
            onChange={(v) => controls.changeTheme({ control: "pages", value: v === "2" ? 2 : 1 })}
          />
        </Row>

        {ctl.dateStyleControl && (
          <Row label="Date style" labelId="rb-tpl-dates">
            <ChoiceGroup
              aria-labelledby="rb-tpl-dates"
              className="grid grid-cols-2 gap-2 [&>button]:rounded-lg [&>button]:px-2 [&>button]:text-[13px]"
              disabled={disabled}
              value={dateOptions.includes(stored.dateStyle) ? stored.dateStyle : dateOptions[0]}
              options={dateOptions.map((d) => ({ value: d, label: DATE_STYLE_LABELS[d] }))}
              onChange={(v) => controls.changeTheme({ control: "dateStyle", value: v as "range" | "year" })}
            />
          </Row>
        )}
      </section>
    </div>
  );
}
