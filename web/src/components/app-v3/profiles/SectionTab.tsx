"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, PlusIcon } from "@kiwiply/ui";
import type { ItemData } from "@/lib/profile-items";
import ItemCard from "./ItemCard";
import ItemForm from "./ItemForm";
import { SECTION_DEFS, type DraftLimits, type FormSection } from "./itemSchema";
import type { ProfileItemsApi } from "./useProfileItems";

/**
 * One list of profile entries (R1.2): a heading with `+ Add`, the entries as `ItemCard`s and an
 * empty state that points at the Resume Builder when nothing is there yet. The "+ Add" form opens at
 * the top of the list. `atCap` (the per-user limit from the builder settings) disables Add with the
 * reason instead of letting the API refuse it.
 */
export default function SectionTab({
  api,
  section,
  title,
  icon,
  empty,
  limits,
  atCap,
  maxItems,
  loadFailed,
  hideHeading,
}: {
  api: ProfileItemsApi;
  section: FormSection;
  title: string;
  icon?: ReactNode;
  empty: string;
  limits: DraftLimits;
  atCap: boolean;
  maxItems: number;
  loadFailed: boolean;
  /** The More tab shows several of these under one page heading. */
  hideHeading?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const rows = api.bySection(section);
  const def = SECTION_DEFS[section];
  const addDisabled = atCap || loadFailed;
  // The three career lists fill through the two-minute setup flow (R1.4 / Onboarding v2); the rest point at the builder.
  const fromResume = section === "EXPERIENCE" || section === "EDUCATION" || section === "PROJECT";

  return (
    <section aria-label={title} className="rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        {!hideHeading && (
          <h2 className="flex items-center gap-2 font-display text-[17px] font-extrabold text-v2-navy">
            {icon}
            {title}
          </h2>
        )}
        {hideHeading && <h3 className="flex items-center gap-2 text-[15px] font-bold text-v2-navy">{icon}{title}</h3>}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto max-sm:min-h-11"
          disabled={addDisabled || adding}
          onClick={() => setAdding(true)}
          aria-label={`Add ${def.noun}`}
        >
          <PlusIcon size={14} aria-hidden /> Add
        </Button>
      </div>

      {loadFailed && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          We couldn&apos;t load your entries. Refresh the page to try again.
        </p>
      )}
      {atCap && !loadFailed && (
        <p className="mt-3 text-[13px] text-v2-ink-soft">
          Your profile holds {maxItems} entries, the most it can. Delete one to add another.
        </p>
      )}

      {adding && (
        <ItemForm
          section={section}
          initial={null}
          limits={limits}
          onSave={async (data: ItemData) => {
            await api.add(section, data);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {rows.length === 0 && !adding && !loadFailed ? (
        <p className="mt-4 text-[13.5px] text-v2-ink-soft">
          {empty}{" "}
          <Link href={fromResume ? "/profiles/setup?entry=profiles" : "/resume-builder"} className="font-semibold text-v2-blue hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">
            {fromResume ? "Set up in 2 min" : "Go to Resume Builder"}
          </Link>
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              section={section}
              limits={limits}
              onSave={async (id, data) => {
                await api.save(id, data);
              }}
              onToggleHidden={(id) => void api.toggleHidden(id)}
              onDelete={api.remove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
