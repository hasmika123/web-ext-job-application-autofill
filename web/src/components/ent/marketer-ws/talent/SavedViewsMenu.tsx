"use client";

import { useState } from "react";
import { ChevronDownIcon, Popover, TrashIcon, cn } from "@kiwiply/ui";
import { hasFilters, type SavedView, type TalentFilters } from "@/lib/ent/marketer-ws/talent";

/**
 * "Saved Views": the marketer's own named filter sets (stored per member by the API, `mkt_saved_view`). Choosing one applies its
 * filters; the box at the bottom saves the filters that are on screen right now under a name. Filters only; no consultant data.
 */
export default function SavedViewsMenu({
  views, current, onApply, onSave, onDelete,
}: {
  views: SavedView[];
  current: TalentFilters;
  onApply: (v: SavedView) => void;
  onSave: (name: string) => Promise<string | null>;
  onDelete: (v: SavedView) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSave = hasFilters(current);

  return (
    <Popover
      label="Saved views"
      align="end"
      panelClassName="w-72 p-2"
      trigger={(t) => (
        <button
          type="button"
          {...t.props}
          ref={t.ref}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft"
        >
          Saved views
          <ChevronDownIcon size={14} aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col gap-2 text-[13px]">
          {views.length === 0 ? (
            <p className="px-2 py-2 text-muted">No saved views yet. Set some filters, then name them below.</p>
          ) : (
            <ul className="flex max-h-56 flex-col overflow-y-auto">
              {views.map((v) => (
                <li key={v.id} data-saved-view={v.id} className="flex items-center gap-1 rounded-lg hover:bg-accent-soft">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(v);
                      close();
                    }}
                    className="min-w-0 flex-1 truncate px-2 py-2 text-left font-semibold text-ink"
                  >
                    {v.name}
                  </button>
                  <button type="button" aria-label={`Delete view ${v.name}`} onClick={() => onDelete(v)} className="grid h-8 w-8 flex-none place-items-center rounded-md text-muted hover:text-ink">
                    <TrashIcon size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-1.5 border-t border-line pt-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!canSave || !name.trim() || busy) return;
              setBusy(true);
              const err = await onSave(name.trim());
              setBusy(false);
              setError(err);
              if (!err) setName("");
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="px-1 text-[12px] font-semibold text-ink-soft">Save the current filters as</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="View name"
                className="h-9 rounded-lg border border-line bg-paper px-2.5 text-[13px] text-ink outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            {!canSave ? <p className="px-1 text-[12px] text-muted">Choose at least one filter first.</p> : null}
            {error ? <p role="alert" className="px-1 text-[12px] text-v2-pink-ink">{error}</p> : null}
            <button
              type="submit"
              disabled={!canSave || !name.trim() || busy}
              className={cn("h-9 rounded-lg bg-accent px-3 text-[13px] font-semibold text-white", (!canSave || !name.trim() || busy) && "cursor-not-allowed opacity-60")}
            >
              Save view
            </button>
          </form>
        </div>
      )}
    </Popover>
  );
}
