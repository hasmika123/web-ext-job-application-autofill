"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon, PencilIcon, SourceChip, TrashIcon, cn } from "@kiwiply/ui";
import type { ItemData, ProfileItem } from "@/lib/profile-items";
import ItemForm from "./ItemForm";
import { describeItem, itemBullets, type DraftLimits, type FormSection } from "./itemSchema";

const ACTION =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-v2-ink-soft transition-colors hover:bg-paper-2 hover:text-ink max-sm:h-11 max-sm:w-11 disabled:opacity-50";

/**
 * One profile entry (R1.2): a collapsed summary (heading, dates / place, bullet count), a chip for
 * where it came from, and Edit / Hide / Delete. Edit opens the inline `ItemForm` in place of the
 * summary. A hidden entry stays on the profile but is left out of new resumes; it is dimmed and says so.
 */
export default function ItemCard({
  item,
  section,
  limits,
  onSave,
  onToggleHidden,
  onDelete,
}: {
  item: ProfileItem;
  section: FormSection;
  limits: DraftLimits;
  onSave: (id: number, data: ItemData) => Promise<void>;
  onToggleHidden: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { heading, meta } = describeItem(item.section, item.data);
  const bullets = itemBullets(item.data);

  return (
    <li className={cn("rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft", item.hidden && !editing && "bg-paper-2/50")}>
      {editing ? (
        <ItemForm
          section={section}
          initial={item.data}
          limits={limits}
          onSave={async (data) => {
            await onSave(item.id, data);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex items-start gap-3">
          <div className={cn("min-w-0 flex-1", item.hidden && "opacity-70")}>
            <h3 className="break-words text-[14.5px] font-bold leading-snug text-v2-navy">{heading}</h3>
            {meta && <p className="mt-0.5 break-words text-[12.5px] text-v2-muted">{meta}</p>}
            {bullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-v2-ink-soft">
                {bullets.slice(0, 2).map((b, i) => (
                  <li key={i} className="break-words">
                    {b.text}
                  </li>
                ))}
              </ul>
            )}
            {bullets.length > 2 && <p className="mt-1 pl-5 text-[12.5px] text-v2-muted">+{bullets.length - 2} more</p>}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <SourceChip provenance={item.provenance} />
              {item.hidden && (
                <span className="rounded-full bg-v2-amber-soft px-2 py-[2px] text-[11px] font-semibold text-v2-amber-ink">
                  Hidden from new resumes
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-none items-center">
            <button type="button" className={ACTION} aria-label={`Edit ${heading}`} onClick={() => setEditing(true)}>
              <PencilIcon size={16} aria-hidden />
            </button>
            <button
              type="button"
              className={ACTION}
              aria-label={`${item.hidden ? "Show" : "Hide"} ${heading}`}
              aria-pressed={item.hidden}
              title={item.hidden ? "Show in new resumes" : "Hide from new resumes"}
              onClick={() => onToggleHidden(item.id)}
            >
              {item.hidden ? <EyeIcon size={16} aria-hidden /> : <EyeOffIcon size={16} aria-hidden />}
            </button>
            <button type="button" className={cn(ACTION, "hover:text-danger")} aria-label={`Delete ${heading}`} onClick={() => onDelete(item.id)}>
              <TrashIcon size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
