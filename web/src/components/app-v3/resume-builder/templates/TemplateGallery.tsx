"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, Button, cn } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { useBuilderEnv } from "../builderEnv";
import { thumbFor } from "../list/templateThumbs";
import type { TemplateCategory } from "@kiwiply/ui";
import { ATS_RATING_LABEL, atsRating, capabilityChips, galleryCapabilities, galleryTemplates, groupByCategory, templateHref, type AtsRating } from "./model";

const CHIP_TONE: Record<string, string> = {
  ats: "bg-v2-green-soft text-v2-green-ink",
  photo: "bg-v2-blue-soft text-v2-blue-ink",
  columns: "bg-v2-blue-soft text-v2-blue-ink",
  marks: "bg-paper-2 text-ink-soft",
};

const RATING_TONE: Record<AtsRating, string> = {
  strict: "bg-v2-green-soft text-v2-green-ink",
  mostly: "bg-v2-amber-soft text-v2-amber-ink",
  design: "bg-paper-2 text-ink-soft",
};

/**
 * The template gallery (`/resume-builder/templates`, DESIGN 10.17, R3.13): every ENABLED template as a card with its
 * picture, name, description and capability chips (ATS Friendly, Photo, 2 columns, Bold only / Rich text), each with
 * "Use this template", which goes to My Resumes and opens the start chooser with that template preselected (the plan's
 * cap is checked there, before the chooser opens). The list and the chips come from the registry, the admin's enabled
 * list and the admin's capability overrides, never from names written here.
 * Cards are grouped by category (ATS-safe, Employer formats, Styled) under filter chips; each carries an honest ATS
 * rating line (from the RESOLVED capabilities) and the template's own `atsNote` (TEMPLATES-DESIGN section 9).
 */
export default function TemplateGallery({ config }: { config: ResumeBuilderConfig }) {
  const listHref = useBuilderEnv().listHref;
  const router = useRouter();
  const templates = galleryTemplates(config.templates.enabled, config.templates.default);
  const [filter, setFilter] = useState<TemplateCategory | "all">("all");
  const groups = groupByCategory(templates);
  // a filter whose group vanished (the admin disabled it) falls back to All
  const active = filter !== "all" && groups.some((g) => g.category === filter) ? filter : "all";
  const shown = active === "all" ? groups : groups.filter((g) => g.category === active);
  const pick = (id: string) => {
    track("resume_template_picked", { id });
    router.push(templateHref(id));
  };
  const choose = (next: TemplateCategory | "all") => {
    setFilter(next);
    track("resume_template_gallery_filter", { category: next });
  };

  useEffect(() => {
    track("resume_template_gallery_viewed");
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <div>
        <Link href={listHref} className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-v2-blue hover:underline sm:min-h-0">
          <ArrowLeftIcon size={15} aria-hidden />
          My Resumes
        </Link>
        <h1 className="mt-1 font-display text-[28px] font-extrabold leading-tight text-ink sm:text-[32px]">Templates</h1>
        <p className="mt-1 max-w-[40rem] text-[14.5px] leading-relaxed text-ink-soft">
          Pick the look of a new resume. You can change the template any time in the editor, and your content moves with you.
        </p>
      </div>

      <div role="group" aria-label="Filter templates" className="flex flex-wrap gap-2">
        {[{ key: "all" as const, label: "All", count: templates.length }, ...groups.map((g) => ({ key: g.category, label: g.label, count: g.templates.length }))].map((c) => (
          <button
            key={c.key}
            type="button"
            data-filter={c.key}
            aria-pressed={active === c.key}
            onClick={() => choose(c.key)}
            className={cn(
              "min-h-11 rounded-full border px-4 text-[13.5px] font-semibold transition-colors sm:min-h-9",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active === c.key ? "border-accent bg-accent text-on-accent" : "border-line bg-paper text-ink-soft hover:border-accent",
            )}
          >
            {c.label} ({c.count})
          </button>
        ))}
      </div>

      {shown.map((g) => (
        <section key={g.category} data-category={g.category} aria-labelledby={`tpl-group-${g.category}`} className="flex flex-col gap-3">
          <div>
            <h2 id={`tpl-group-${g.category}`} className="text-[20px] font-bold text-ink">
              {g.label}
            </h2>
            <p className="text-[13.5px] text-ink-soft">{g.caption}</p>
          </div>
          <ul aria-label={g.label} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.templates.map((t) => {
              const th = thumbFor(t.id);
              const caps = galleryCapabilities(t.id, config.templates.overrides);
              const chips = capabilityChips(caps);
              const rating = atsRating(caps);
              return (
                <li key={t.id} data-template-id={t.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft">
                  <div className="mx-auto aspect-[240/340] w-full max-w-[200px] overflow-hidden rounded-lg border border-v2-line bg-paper-2">
                    <Image src={th.src} width={th.width} height={th.height} alt={`${t.name} template`} unoptimized className="h-full w-full object-cover object-top" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-bold text-ink">{t.name}</h3>
                    <p className="mt-1 text-[13.5px] leading-snug text-ink-soft">{t.description}</p>
                  </div>
                  <ul aria-label={`${t.name} features`} className="flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                      <li key={c.id} data-chip={c.id} className={cn("rounded-md px-2 py-1 text-[12px] font-medium leading-none", CHIP_TONE[c.id])}>
                        {c.label}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-1">
                    <span data-rating={rating} className={cn("w-fit rounded-md px-2 py-1 text-[12px] font-semibold leading-none", RATING_TONE[rating])}>
                      {ATS_RATING_LABEL[rating]}
                    </span>
                    <p data-ats-note className="text-[12px] leading-snug text-ink-soft">
                      {t.atsNote}
                    </p>
                  </div>
                  <Button variant="accent" className="mt-auto min-h-11 w-full" onClick={() => pick(t.id)} aria-label={`Use the ${t.name} template`}>
                    Use this template
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
