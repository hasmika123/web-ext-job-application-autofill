"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  EyeIcon,
  FileTextIcon,
  GearIcon,
  LayersIcon,
  LockIcon,
  PencilIcon,
  RestoreIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  cn,
} from "@kiwiply/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { KebabMenu, StatusChip, type Tone } from "@/components/app-v2/common";
import { formatDate, type DateDisplay } from "@/lib/dates";
import type { ResumeCardModel } from "./adapter";
import type { CardActions } from "./actions";
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

/**
 * The card's picture (R3.13, DESIGN 8.10): the first page of the resume's own render, made by the PDF job
 * (`/api/resumes/:id/thumbnail?v=<thumbHash>`, so a new render is a new address). Until the first one exists - and if it
 * cannot be loaded - the template's static thumbnail stands in. The previous picture stays while the PDF is being
 * remade (the server keeps it until a newer one lands). An uploaded file has no render: a plain file tile.
 */
function Thumbnail({ m, className }: { m: ResumeCardModel; className?: string }) {
  const [broken, setBroken] = useState(false);
  const box = cn("relative flex-none overflow-hidden rounded-lg border border-v2-line bg-paper-2 shadow-v2-soft", className);
  if (!m.templateId) {
    return (
      <div className={cn(box, "grid place-items-center text-v2-muted")} aria-hidden>
        <FileTextIcon size={28} />
      </div>
    );
  }
  if (m.thumbHash && !broken) {
    return (
      <div className={box} data-thumb="render">
        <Image
          src={`/api/resumes/${m.id}/thumbnail?v=${encodeURIComponent(m.thumbHash)}`}
          // config-literal-ok: the intrinsic size of a thumbnail at its default width (resume.thumb.width = 240) and Letter's aspect; display only
          width={240}
          // config-literal-ok: Letter's aspect at the default thumbnail width; display only
          height={310}
          alt={`${m.name} preview`}
          unoptimized
          onError={() => setBroken(true)}
          className="h-full w-full object-cover object-top"
        />
      </div>
    );
  }
  const t = thumbFor(m.templateId);
  return (
    <div className={box} data-thumb="template">
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
  actions: CardActions;
  /** Rename and Delete ask first, in dialogs the page owns. */
  onRename: (m: ResumeCardModel) => void;
  onDelete: (m: ResumeCardModel) => void;
  /** The plan has builder AI (`config.aiAllowed`); without it the AI action is a lock that leads to the plans. */
  aiAllowed: boolean;
  /** Scores from here up read as good (green): `config.score.passThreshold` as a percentage. */
  goodScore: number;
}

export default function ResumeCard({ model: m, layout, display, onManage, actions, onRename, onDelete, aiAllowed, goodScore }: ResumeCardProps) {
  const router = useRouter();
  const chip = statusChip(m);
  const list = layout === "list";
  const built = m.kind === "BUILT";
  const archived = m.status === "Archived";
  const busy = actions.busyId === m.id;

  const chips = (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusChip tone={chip.tone} className="gap-1 rounded-md px-2 py-1 text-[12px]">
        {chip.icon}
        {chip.label}
      </StatusChip>
      {m.score !== null && (
        <StatusChip tone={m.score >= goodScore ? "green" : "amber"} className="rounded-md px-2 py-1 text-[12px]">
          <span data-score-badge>{`${m.score}% score`}</span>
        </StatusChip>
      )}
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
      items={
        archived
          ? // Archived cards offer Unarchive and Delete only (DESIGN 10.17).
            [
              { label: "Unarchive", icon: <RestoreIcon size={15} />, onSelect: () => void actions.restore(m) },
              { label: "Delete", icon: <TrashIcon size={15} />, onSelect: () => onDelete(m), danger: true },
            ]
          : [
              built
                ? { label: "Open", icon: <PencilIcon size={15} />, onSelect: () => router.push(`/resume-builder/${m.id}`) }
                : { label: "Manage resume", icon: <FileTextIcon size={15} />, onSelect: onManage },
              ...(built
                ? [{ label: "Settings", icon: <GearIcon size={15} />, onSelect: () => router.push(`/resume-builder/${m.id}?view=settings`) }]
                : [{ label: "Open in builder", icon: <LayersIcon size={15} />, onSelect: () => void actions.openInBuilder(m) }]),
              { label: "Duplicate", icon: <CopyIcon size={15} />, onSelect: () => void actions.duplicate(m) },
              { separator: true as const },
              { label: "Rename", icon: <PencilIcon size={15} />, onSelect: () => onRename(m) },
              ...(m.isPrimary ? [] : [{ label: "Set as Primary", icon: <StarIcon size={15} />, onSelect: () => void actions.setPrimary(m) }]),
              { label: "Archive", icon: <ArchiveIcon size={15} />, onSelect: () => void actions.archive(m) },
              { label: "Delete", icon: <TrashIcon size={15} />, onSelect: () => onDelete(m), danger: true },
            ]
      }
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

  const hasTags = m.target !== null || m.tags.length > 0 || m.atsFriendly || m.type === "Tailored";
  const tags = hasTags && (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {m.target && <li className="rounded-md bg-v2-blue-soft px-2 py-1 text-[12px] font-semibold leading-none text-v2-blue-ink">{m.target}</li>}
      {m.type === "Tailored" && <li className="rounded-md bg-v2-amber-soft px-2 py-1 text-[12px] font-medium leading-none text-v2-amber-ink">Tailored</li>}
      {m.tags.map((t) => (
        <li key={t} className="rounded-md bg-v2-blue-soft/70 px-2 py-1 text-[12px] font-medium leading-none text-v2-blue-ink">
          {t}
        </li>
      ))}
      {m.atsFriendly && <li className="rounded-md bg-v2-green-soft px-2 py-1 text-[12px] font-medium leading-none text-v2-green-ink">ATS Friendly</li>}
    </ul>
  );

  const actionRow = (
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
      {!archived && (
        <button type="button" onClick={() => void actions.duplicate(m)} disabled={busy} className={ICON_BTN} aria-label={`Duplicate ${m.name}`} title="Duplicate">
          <CopyIcon size={16} />
        </button>
      )}
      {built ? (
        <Link href={`/resume-builder/${m.id}?view=pdf`} className={ICON_BTN} aria-label={`View ${m.name}`} title="View">
          <EyeIcon size={16} />
        </Link>
      ) : (
        // An uploaded file is its own PDF/DOCX: View opens the stored file.
        <a href={`/api/resumes/${m.id}/file`} target="_blank" rel="noreferrer" className={ICON_BTN} aria-label={`View ${m.name}`} title="View">
          <EyeIcon size={16} />
        </a>
      )}
      {built &&
        (aiAllowed ? (
          <Link href={`/resume-builder/${m.id}?tab=ai`} className={cn(ICON_BTN, "text-v2-violet")} aria-label={`AI tools for ${m.name}`} title="AI">
            <SparklesIcon size={16} />
          </Link>
        ) : (
          <Link href="/pricing" className={cn(ICON_BTN, "text-v2-muted")} aria-label={`AI tools for ${m.name} (Pro)`} title="AI suggestions are part of Pro">
            <LockIcon size={16} />
          </Link>
        ))}
    </div>
  );

  if (list) {
    return (
      <li data-resume-id={m.id} data-archived={archived || undefined} className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-v2-line/70 bg-paper p-3 shadow-v2-soft sm:p-3.5", archived && "opacity-70", busy && "pointer-events-none opacity-60")}>
        <Thumbnail key={m.thumbHash ?? "none"} m={m} className="h-[68px] w-12" />
        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <h3 className="truncate text-[15px] font-bold text-ink">{m.name}</h3>
          {chips}
        </div>
        <div className="hidden md:block">{dates}</div>
        <div className="hidden min-w-0 max-w-[14rem] lg:block">{tags}</div>
        <div className="ml-auto flex items-center gap-2">
          {actionRow}
          {menu}
        </div>
      </li>
    );
  }

  return (
    <li data-resume-id={m.id} data-archived={archived || undefined} className={cn("flex min-w-0 gap-3.5 rounded-2xl border border-v2-line/70 bg-paper p-3.5 shadow-v2-soft", archived && "opacity-70", busy && "pointer-events-none opacity-60")}>
      <Thumbnail key={m.thumbHash ?? "none"} m={m} className="h-[104px] w-[72px] sm:h-[190px] sm:w-[134px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-start justify-between gap-1">
          {chips}
          <span className="-mr-1.5 -mt-1">{menu}</span>
        </div>
        <h3 className="line-clamp-2 text-[17px] font-bold leading-snug text-ink">{m.name}</h3>
        {dates}
        {tags}
        <div className="mt-auto pt-1">{actionRow}</div>
      </div>
    </li>
  );
}
