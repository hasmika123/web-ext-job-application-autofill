"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArchiveIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  EyeIcon,
  FileTextIcon,
  PencilIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  cn,
} from "@kiwiply/ui";
import type { ReactNode } from "react";
import { KebabMenu, StatusChip, type Tone } from "@/components/app-v2/common";
import { formatDate, type DateDisplay } from "@/lib/dates";
import type { ResumeCardModel } from "./adapter";
import type { ViewMode } from "./constants";
import { thumbFor } from "./templateThumbs";

const ICON_BTN =
  "inline-flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-[10px] border border-v2-line bg-paper text-ink " +
  "transition-colors hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue sm:h-9 sm:w-9";

const fmt = (iso: string, display: DateDisplay) => formatDate(iso, { month: "short", day: "numeric", year: "numeric" }, display);

/** The status chip: Primary wins over Active (the board shows one chip). */
function statusChip(m: ResumeCardModel): { label: string; tone: Tone; icon: ReactNode } {
  if (m.status === "Archived") return { label: "Archived", tone: "slate", icon: <ArchiveIcon size={12} /> };
  if (m.status === "Draft") return { label: "Draft", tone: "blue", icon: <PencilIcon size={12} /> };
  if (m.isPrimary) return { label: "Primary", tone: "green", icon: <StarIcon size={12} /> };
  return { label: "Active", tone: "green", icon: <CheckCircleIcon size={12} /> };
}

/** The template's static thumbnail (uploaded files have no template: a plain file tile). */
function Thumbnail({ m, className }: { m: ResumeCardModel; className?: string }) {
  const box = cn("relative flex-none overflow-hidden rounded-lg border border-v2-line bg-paper-2 shadow-v2-soft", className);
  if (!m.templateId) {
    return (
      <div className={cn(box, "grid place-items-center text-v2-muted")} aria-hidden>
        <FileTextIcon size={28} />
      </div>
    );
  }
  const t = thumbFor(m.templateId);
  return (
    <div className={box}>
      <Image src={t.src} width={t.width} height={t.height} alt={`${m.name} preview`} unoptimized className="h-full w-full object-cover object-top" />
    </div>
  );
}

export interface ResumeCardProps {
  model: ResumeCardModel;
  layout: ViewMode;
  display: DateDisplay;
  /** Opens the existing "manage resumes" side panel (uploaded files are edited there). */
  onManage: () => void;
  /** Unbuilt controls: `soon("Duplicate")` returns the click handler that shows "Coming soon". */
  soon: (what: string) => () => void;
}

export default function ResumeCard({ model: m, layout, display, onManage, soon }: ResumeCardProps) {
  const chip = statusChip(m);
  const list = layout === "list";
  const built = m.kind === "BUILT";

  const chips = (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusChip tone={chip.tone} className="gap-1 rounded-md px-2 py-1 text-[12px]">
        {chip.icon}
        {chip.label}
      </StatusChip>
      {m.pdfState === "outOfDate" && (
        <StatusChip tone="amber" dot className="rounded-md px-2 py-1">
          PDF out of date
        </StatusChip>
      )}
      {m.pdfState === "updating" && (
        <StatusChip tone="amber" dot className="rounded-md px-2 py-1">
          PDF updating…
        </StatusChip>
      )}
      {m.pdfState === "failed" && (
        <StatusChip tone="coral" dot className="rounded-md px-2 py-1">
          PDF failed
        </StatusChip>
      )}
    </span>
  );

  const menu = (
    <KebabMenu
      label={`More actions for ${m.name}`}
      items={[
        // Real: uploaded + built resumes can still be archived / deleted / re-uploaded from the side panel.
        { label: "Manage resume", icon: <FileTextIcon size={15} />, onSelect: onManage },
        { separator: true },
        // DESIGN-PENDING (R-list): rename / set primary / archive / delete move into the resume metadata model.
        { label: "Rename", icon: <PencilIcon size={15} />, onSelect: soon("Renaming from the list") },
        { label: "Set as Primary", icon: <StarIcon size={15} />, onSelect: soon("Setting a primary resume from the list") },
        { label: m.status === "Archived" ? "Restore" : "Archive", icon: <ArchiveIcon size={15} />, onSelect: soon("Archiving from the list") },
        { label: "Delete", icon: <TrashIcon size={15} />, onSelect: soon("Deleting from the list"), danger: true },
      ]}
    />
  );

  const dates = (
    <ul className={cn("space-y-1 text-[13px] text-v2-ink-soft", list && "min-w-[11rem]")}>
      {m.createdAt && (
        <li className="flex items-center gap-2">
          <CalendarIcon size={15} className="flex-none text-v2-muted" aria-hidden />
          <span>{`Created ${fmt(m.createdAt, display)}`}</span>
        </li>
      )}
      {m.modifiedAt && (
        <li className="flex items-center gap-2">
          <ClockIcon size={15} className="flex-none text-v2-muted" aria-hidden />
          <span>{`Modified ${fmt(m.modifiedAt, display)}`}</span>
        </li>
      )}
    </ul>
  );

  const tags = (m.tags.length > 0 || m.atsFriendly) && (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {m.tags.map((t) => (
        <li key={t} className="rounded-md bg-v2-blue-soft/70 px-2 py-1 text-[12px] font-medium leading-none text-v2-blue-ink">
          {t}
        </li>
      ))}
      {m.atsFriendly && <li className="rounded-md bg-v2-green-soft px-2 py-1 text-[12px] font-medium leading-none text-v2-green-ink">ATS Friendly</li>}
    </ul>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {built ? (
        <Link href={`/resume-builder/${m.id}`} className={ICON_BTN} aria-label={`Edit ${m.name}`} title="Edit">
          <PencilIcon size={16} />
        </Link>
      ) : (
        <button type="button" onClick={onManage} className={ICON_BTN} aria-label={`Edit ${m.name}`} title="Edit">
          <PencilIcon size={16} />
        </button>
      )}
      {/* DESIGN-PENDING (R-list): duplicate / view / AI have no behaviour until the resume metadata + start-chooser designs land. */}
      <button type="button" onClick={soon("Duplicating a resume")} className={ICON_BTN} aria-label={`Duplicate ${m.name}`} title="Duplicate">
        <CopyIcon size={16} />
      </button>
      <button type="button" onClick={soon("Viewing a resume")} className={ICON_BTN} aria-label={`View ${m.name}`} title="View">
        <EyeIcon size={16} />
      </button>
      <button type="button" onClick={soon("AI tools for a resume")} className={cn(ICON_BTN, "text-v2-violet")} aria-label={`AI tools for ${m.name}`} title="AI">
        <SparklesIcon size={16} />
      </button>
    </div>
  );

  if (list) {
    return (
      <li data-resume-id={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-v2-line/70 bg-paper p-3 shadow-v2-soft sm:p-3.5">
        <Thumbnail m={m} className="h-[68px] w-12" />
        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <h3 className="truncate text-[15px] font-bold text-ink">{m.name}</h3>
          {chips}
        </div>
        <div className="hidden md:block">{dates}</div>
        <div className="hidden min-w-0 max-w-[14rem] lg:block">{tags}</div>
        <div className="ml-auto flex items-center gap-2">
          {actions}
          {menu}
        </div>
      </li>
    );
  }

  return (
    <li data-resume-id={m.id} className="flex min-w-0 gap-3.5 rounded-2xl border border-v2-line/70 bg-paper p-3.5 shadow-v2-soft">
      <Thumbnail m={m} className="h-[150px] w-[100px] sm:h-[190px] sm:w-[134px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-start justify-between gap-1">
          {chips}
          <span className="-mr-1.5 -mt-1">{menu}</span>
        </div>
        <h3 className="line-clamp-2 text-[17px] font-bold leading-snug text-ink">{m.name}</h3>
        {dates}
        {tags}
        <div className="mt-auto pt-1">{actions}</div>
      </div>
    </li>
  );
}
