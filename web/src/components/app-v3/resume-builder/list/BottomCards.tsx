"use client";

import Image from "next/image";
import { CheckCircleIcon, LayersIcon, LightbulbIcon, cn, listTemplates } from "@kiwiply/ui";
import { SectionCard } from "@/components/app-v2/common";
import { QUICK_TIPS } from "./constants";
import { thumbFor } from "./templateThumbs";

/**
 * "Popular Templates": the templates in the `@kiwiply/ui` registry (only Modern exists today; the
 * board's other names are placeholders, not specs), each as its static thumbnail + name.
 *
 * // DESIGN-PENDING (R-list): "View all" belongs to the template gallery, which is not designed yet.
 */
export function PopularTemplates({ onViewAll }: { onViewAll: () => void }) {
  const templates = listTemplates();
  return (
    <SectionCard
      title="Popular Templates"
      icon={<LayersIcon size={18} className="text-v2-blue" aria-hidden />}
      action={{ label: "View all", onClick: onViewAll }}
      className="h-full"
    >
      <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {templates.map((t, i) => {
          const th = thumbFor(t.id);
          return (
            <li key={t.id} className="flex w-[88px] flex-none flex-col items-center gap-1.5 sm:w-[96px]">
              <span
                className={cn(
                  "block aspect-[240/340] w-full overflow-hidden rounded-lg border bg-paper-2",
                  i === 0 ? "border-2 border-v2-blue" : "border-v2-line",
                )}
              >
                <Image src={th.src} width={th.width} height={th.height} alt={`${t.name} template`} unoptimized className="h-full w-full object-cover object-top" />
              </span>
              <span className={cn("text-[13px] font-medium", i === 0 ? "text-v2-blue-ink" : "text-ink-soft")}>{t.name}</span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

/** "Quick Tips": the board's four ticked lines (copy lives in `constants.ts`). */
export function QuickTips() {
  return (
    <SectionCard
      title="Quick Tips"
      icon={<LightbulbIcon size={18} className="text-v2-amber" aria-hidden />}
      className="h-full bg-[linear-gradient(135deg,#FFFFFF_0%,#F3F9EA_100%)]"
    >
      <ul className="space-y-2.5">
        {QUICK_TIPS.map((tip) => (
          <li key={tip} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink">
            <CheckCircleIcon size={18} className="mt-px flex-none text-v2-green" aria-hidden />
            {tip}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
