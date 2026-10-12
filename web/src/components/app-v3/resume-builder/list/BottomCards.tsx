"use client";

import Image from "next/image";
import { CheckCircleIcon, LayersIcon, LightbulbIcon, cn, getTemplate, listTemplates, type TemplateMeta } from "@kiwiply/ui";
import { SectionCard } from "@/components/app-v2/common";
import { QUICK_TIPS } from "./constants";
import { thumbFor } from "./templateThumbs";

/** The template gallery page (R3.13). */
export const TEMPLATES_HREF = "/resume-builder/templates";

/**
 * The templates the strip shows (DESIGN 10.17): the registry's templates that are enabled
 * (`config.templates.enabled`), those named in `resume.templates.popular` first and in that order, then the
 * rest in enabled order. If the settings and the registry share nothing, the default template is shown rather than an empty strip.
 */
export function popularTemplates(enabled: readonly string[], popular: readonly string[], defaultId: string): TemplateMeta[] {
  const registry = listTemplates();
  const byId = new Map(registry.map((t) => [t.id, t]));
  const ids: string[] = [];
  for (const id of [...popular, ...enabled]) {
    if (byId.has(id) && enabled.includes(id) && !ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) ids.push(getTemplate(defaultId).meta.id);
  return ids.map((id) => byId.get(id) as TemplateMeta);
}

/**
 * "Popular Templates": each template as its static thumbnail + name (+ an "ATS Friendly" dot when its
 * capabilities say so). Clicking one opens the new-resume chooser with that template preselected.
 * "View all" goes to the template gallery (`/resume-builder/templates`, R3.13).
 */
export function PopularTemplates({ templates, onPick }: { templates: TemplateMeta[]; onPick: (id: string) => void }) {
  return (
    <SectionCard
      title="Popular Templates"
      icon={<LayersIcon size={18} className="text-v2-blue" aria-hidden />}
      action={{ label: "View all", href: TEMPLATES_HREF }}
      className="h-full"
    >
      <ul className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {templates.map((t, i) => {
          const th = thumbFor(t.id);
          return (
            <li key={t.id} className="w-[88px] flex-none snap-start sm:w-[96px]">
              <button
                type="button"
                onClick={() => onPick(t.id)}
                aria-label={`Use the ${t.name} template`}
                className="group flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue"
              >
                <span
                  className={cn(
                    "block aspect-[240/340] w-full overflow-hidden rounded-lg border bg-paper-2 transition-shadow group-hover:shadow-v2-soft",
                    i === 0 ? "border-2 border-v2-blue" : "border-v2-line",
                  )}
                >
                  <Image src={th.src} width={th.width} height={th.height} alt={`${t.name} template`} unoptimized className="h-full w-full object-cover object-top" />
                </span>
                <span className={cn("text-[13px] font-medium", i === 0 ? "text-v2-blue-ink" : "text-ink-soft")}>{t.name}</span>
                {t.capabilities.ats && (
                  <span className="flex items-center gap-1 text-[11px] text-v2-green-ink">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-v2-green" />
                    ATS Friendly
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

/** "Quick Tips": the lines of the `resume.list.quickTips` setting (the board's four when the API cannot be reached). */
export function QuickTips({ tips = QUICK_TIPS }: { tips?: readonly string[] }) {
  return (
    <SectionCard
      title="Quick Tips"
      icon={<LightbulbIcon size={18} className="text-v2-amber" aria-hidden />}
      className="h-full bg-[linear-gradient(135deg,#FFFFFF_0%,#F3F9EA_100%)]"
    >
      <ul className="space-y-2.5">
        {tips.map((tip) => (
          <li key={tip} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink">
            <CheckCircleIcon size={18} className="mt-px flex-none text-v2-green" aria-hidden />
            {tip}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
