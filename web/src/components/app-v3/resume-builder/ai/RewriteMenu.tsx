"use client";

import Link from "next/link";
import { LockIcon, Menu, MoreVerticalIcon, Popover, SparklesIcon, cn, iconButtonClass } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { COPY, REWRITE_MODES, type RewriteMode } from "@/lib/resume-ai";

export interface RewriteMenuProps {
  /** The plan has no builder AI: the button is a lock with the Pro chip that leads to the plans, never a dead control. */
  locked: boolean;
  /** "section": the "✦ Rewrite with AI" pill in a block header; "bullet": the small control at the end of a bullet. */
  variant: "section" | "bullet";
  /** What the button acts on, for its accessible name ("Summary", "Experience", "bullet 2"). */
  subject: string;
  /** Nothing to rewrite (an empty block): the pill stays, off, and says why. */
  disabledHint?: string;
  onPick: (mode: RewriteMode) => void;
  /** A locked button was pressed (the analytics event). */
  onLockedClick?: () => void;
  className?: string;
}

const PILL =
  "inline-flex min-h-8 flex-none items-center gap-1.5 rounded-lg bg-v2-green-soft px-3 text-[13px] font-semibold text-v2-green-ink transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 max-sm:min-h-11";

/** The lock card in a popover: what Pro adds and the way there. */
function LockPopover({ variant, subject, onLockedClick, className }: Pick<RewriteMenuProps, "variant" | "subject" | "onLockedClick" | "className">) {
  const bullet = variant === "bullet";
  return (
    <Popover
      label="AI rewriting is part of Pro"
      align="end"
      className={className}
      panelClassName="w-[260px] p-3"
      trigger={(t) => (
        <button
          type="button"
          ref={t.ref}
          {...t.props}
          onClick={(e) => {
            t.props.onClick?.(e);
            onLockedClick?.();
          }}
          aria-label={bullet ? `Rewrite ${subject} with AI (Pro)` : `Rewrite with AI: ${subject} (Pro)`}
          title="Rewrite with AI is part of Pro"
          data-ai-locked
          className={bullet ? cn(iconButtonClass, "text-v2-muted max-sm:h-11 max-sm:w-11") : cn(PILL, "bg-paper-2 text-ink-soft")}
        >
          <LockIcon className={bullet ? "h-4 w-4" : "h-3.5 w-3.5"} />
          {!bullet && (
            <>
              Rewrite with AI
              <span className="rounded bg-v2-violet-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-v2-violet-ink">Pro</span>
            </>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <div className="text-[13px]">
          <p className="font-bold text-ink">{COPY.locked}</p>
          <p className="mt-1 text-ink-soft">{COPY.lockedBody}</p>
          <Link href="/pricing" onClick={close} className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-accent px-3 font-bold text-on-accent hover:brightness-95 max-sm:min-h-11">
            See Pro
          </Link>
        </div>
      )}
    </Popover>
  );
}

/**
 * "Rewrite with AI" (DESIGN 13.4 / 13.7): the block header's pill and the per-bullet control. Pro: a menu of the five
 * modes (Stronger, Shorter, More formal, Plain language, Fix grammar) that starts the rewrite the moment one is
 * chosen, with a line saying what gets sent. Free: the same button with a lock glyph and the Pro chip, opening a card
 * with "See Pro". The caller supplies the lines; this only picks the mode.
 */
export default function RewriteMenu({ locked, variant, subject, disabledHint, onPick, onLockedClick, className }: RewriteMenuProps) {
  if (locked) return <LockPopover variant={variant} subject={subject} onLockedClick={onLockedClick} className={className} />;

  if (disabledHint) {
    return (
      <button type="button" disabled title={disabledHint} aria-label={`Rewrite with AI: ${subject}. ${disabledHint}`} className={cn(PILL, className)}>
        <SparklesIcon className="h-3.5 w-3.5" /> Rewrite with AI
      </button>
    );
  }

  const bullet = variant === "bullet";
  const entries: MenuEntry[] = [
    { heading: bullet ? "Rewrite this bullet" : "Rewrite as" },
    ...REWRITE_MODES.map<MenuEntry>((m) => ({
      label: (
        <span className="flex flex-col leading-tight">
          <span>{m.label}</span>
          <span className="text-[11.5px] font-normal text-muted">{m.hint}</span>
        </span>
      ),
      onSelect: () => onPick(m.value),
    })),
    { separator: true },
    { heading: "Sends your resume text to Kiwiply AI" },
  ];

  return (
    <Menu
      items={entries}
      align={bullet ? "end" : "start"}
      className={className}
      trigger={
        bullet ? (
          <button type="button" aria-label={`Rewrite ${subject} with AI`} title="Rewrite this bullet with AI" className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
            <MoreVerticalIcon className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" aria-label={`Rewrite with AI: ${subject}`} className={PILL}>
            <SparklesIcon className="h-3.5 w-3.5" /> Rewrite with AI
          </button>
        )
      }
    />
  );
}
