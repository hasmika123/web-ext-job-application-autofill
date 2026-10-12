import "@kiwiply/ui/styles/resume.css";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, PAGE_DIMENSIONS, PageFrame, ResumePreview, sanitizeTheme } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";
import { serverApiFetch } from "@/lib/api";
import DownloadSharedPdf from "./DownloadSharedPdf";

export const metadata: Metadata = { title: "Shared resume", robots: { index: false, follow: false } };

interface SharedDocDto {
  resumeId: number;
  label: string;
  doc: ResumeDocument;
  templateId: string;
  theme: Partial<ResumeTheme> | null;
}

/**
 * A resume someone shared with me, read-only (R3.11, DESIGN 9.7): the owner's resume drawn by its own template,
 * with no editor, no autosave and no AI. Spring decides who may read it and answers 404 to everyone else (a
 * resume that is not shared with me looks exactly like one that does not exist); each open writes a view event
 * the owner can see.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const res = await serverApiFetch(`/api/profile/resumes/shared/${id}/doc`);
  if (res.status === 401 || res.status === 403) redirect("/login");
  if (res.status === 404 || res.status === 400) notFound();
  if (!res.ok) throw new Error(`Couldn't load the shared resume (${res.status}).`);
  const dto = (await res.json()) as SharedDocDto;

  const theme = sanitizeTheme(dto.theme);
  const pageWidth = Math.round(PAGE_DIMENSIONS[theme.pageSize].widthIn * 96);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/resume-builder" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink">
            <ArrowLeftIcon size={14} aria-hidden /> My Resumes
          </Link>
          <h1 className="mt-1 truncate font-display text-[22px] font-bold text-ink">{dto.label}</h1>
          <p className="text-[13px] text-ink-soft">Shared with you {"·"} read-only</p>
        </div>
        <DownloadSharedPdf resumeId={dto.resumeId} />
      </div>
      <PageFrame pageWidth={pageWidth} label="Shared resume">
        <ResumePreview doc={dto.doc} theme={dto.theme} templateId={dto.templateId} />
      </PageFrame>
    </div>
  );
}
