"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, Button, cn } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { useBuilderEnv } from "../builderEnv";
import { thumbFor } from "../list/templateThumbs";
import { capabilityChips, galleryCapabilities, galleryTemplates, templateHref } from "./model";

const CHIP_TONE: Record<string, string> = {
  ats: "bg-v2-green-soft text-v2-green-ink",
  photo: "bg-v2-blue-soft text-v2-blue-ink",
  columns: "bg-v2-blue-soft text-v2-blue-ink",
  marks: "bg-paper-2 text-ink-soft",
};

/**
 * The template gallery (`/resume-builder/templates`, DESIGN 10.17, R3.13): every ENABLED template as a card with its
 * picture, name, description and capability chips (ATS Friendly, Photo, 2 columns, Bold only / Rich text), each with
 * "Use this template", which goes to My Resumes and opens the start chooser with that template preselected (the plan's
 * cap is checked there, before the chooser opens). The list and the chips come from the registry, the admin's enabled
 * list and the admin's capability overrides, never from names written here.
 */
export default function TemplateGallery({ config }: { config: ResumeBuilderConfig }) {
  const listHref = useBuilderEnv().listHref;
  const router = useRouter();
  const templates = galleryTemplates(config.templates.enabled, config.templates.default);

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

      <ul aria-label="Templates" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {templates.map((t) => {
          const th = thumbFor(t.id);
          const chips = capabilityChips(galleryCapabilities(t.id, config.templates.overrides));
          return (
            <li key={t.id} data-template-id={t.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft">
              <div className="mx-auto aspect-[240/340] w-full max-w-[200px] overflow-hidden rounded-lg border border-v2-line bg-paper-2">
                <Image src={th.src} width={th.width} height={th.height} alt={`${t.name} template`} unoptimized className="h-full w-full object-cover object-top" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold text-ink">{t.name}</h2>
                <p className="mt-1 text-[13.5px] leading-snug text-ink-soft">{t.description}</p>
              </div>
              <ul aria-label={`${t.name} features`} className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <li key={c.id} data-chip={c.id} className={cn("rounded-md px-2 py-1 text-[12px] font-medium leading-none", CHIP_TONE[c.id])}>
                    {c.label}
                  </li>
                ))}
              </ul>
              <Button
                variant="accent"
                className="mt-auto min-h-11 w-full"
                onClick={() => {
                  track("resume_template_picked", { id: t.id });
                  router.push(templateHref(t.id));
                }}
                aria-label={`Use the ${t.name} template`}
              >
                Use this template
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
