"use client";

import { useState } from "react";
import { Button, PlusIcon, TrashIcon } from "@kiwiply/ui";
import { AdminHero, AdminPanel, AdminSaveProvider, AutosaveInput, LabeledField, useAdminSave } from "../common";
import { EMPTY_ENTRY, slotId, toValue } from "@/lib/subprocessors-admin";
import type { SubprocessorEntry, SubprocessorSlot } from "@/lib/subprocessors-admin";

type Field = keyof SubprocessorEntry;

const FIELDS: Array<{ field: Field; label: string; placeholder: string; hint?: string }> = [
  { field: "name", label: "Name", placeholder: "Company name" },
  { field: "purpose", label: "What it does for us", placeholder: "Stores uploaded files" },
  { field: "data", label: "Data it can reach", placeholder: "E-mail address" },
  { field: "location", label: "Location", placeholder: "Country or region" },
  { field: "link", label: "Link to its privacy terms", placeholder: "https://", hint: "Must start with https://" },
  { field: "dpaStatus", label: "DPA status (only you see this)", placeholder: "To be confirmed", hint: "Your own tracker; it is not shown on the public page." },
];

/** The inline check before anything is sent; the API checks again (and is the one that decides). */
function validate(field: Field, draft: string): string | null {
  if (field === "name" && !draft) return "A name is needed. Use Remove to drop the entry.";
  if (field === "link" && draft && !/^https:\/\/\S+$/i.test(draft)) return "Use a link that starts with https://";
  return null;
}

/**
 * /admin/subprocessors (T1.5): the subprocessor register behind the public /legal/subprocessors page. Every field saves on blur or Enter through the audited
 * settings route (no Save button, a tick after each change); Remove has an undo toast. The DPA status is the admin's own tracker and is never published.
 */
export default function SubprocessorsAdmin({ initial }: { initial: SubprocessorSlot[] | null }) {
  return (
    <AdminSaveProvider>
      <Body initial={initial} />
    </AdminSaveProvider>
  );
}

function Body({ initial }: { initial: SubprocessorSlot[] | null }) {
  const a = useAdminSave();
  const [slots, setSlots] = useState<SubprocessorSlot[] | null>(initial);

  if (!slots) {
    return (
      <div className="space-y-5">
        <AdminHero title="Subprocessors" subtitle="Who processes personal data on our behalf." />
        <p role="alert" className="rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm text-ink-soft">
          The register could not be loaded. Reload the page in a moment.
        </p>
      </div>
    );
  }

  const used = slots.filter((s) => !s.empty);
  const firstFree = slots.find((s) => s.empty);

  function apply(slot: number, entry: SubprocessorEntry) {
    setSlots((cur) => cur && cur.map((s) => (s.slot === slot ? { slot, entry, empty: !entry.name } : s)));
  }

  async function saveEntry(slot: number, entry: SubprocessorEntry, key: string, undoTitle?: string, previous?: SubprocessorEntry) {
    const id = slotId(slot);
    return a.save({
      key,
      row: `sp:${id}`,
      method: "PUT",
      path: `/subprocessors/${id}`,
      body: { value: toValue(entry) },
      onSaved: () => apply(slot, entry),
      undoTitle,
      undo: previous ? { method: "PUT", path: `/subprocessors/${id}`, body: { value: toValue(previous) } } : undefined,
    });
  }

  return (
    <div className="space-y-5">
      <AdminHero
        title="Subprocessors"
        subtitle="The companies that process personal data for us. This is the list behind the public page; changes show there within minutes."
        actions={
          <a href="/legal/subprocessors" target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold text-v2-blue-ink hover:underline">
            View the public page
          </a>
        }
      />

      <AdminPanel title={`Register (${used.length} of ${slots.length} slots in use)`} description="Edit a field and click away: it saves by itself. Removing an entry can be undone for a few seconds." fit>
        <ul className="space-y-4" data-testid="subprocessor-admin-list">
          {used.map((s) => {
            const id = slotId(s.slot);
            return (
              <li key={s.slot} className="rounded-2xl border border-v2-line bg-paper p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-[16px] font-bold text-ink">{s.entry.name}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${s.entry.name}`}
                    onClick={() => void saveEntry(s.slot, { ...EMPTY_ENTRY }, `sp:${id}:remove`, `${s.entry.name} removed`, s.entry)}
                  >
                    <TrashIcon size={15} /> Remove
                  </Button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {FIELDS.map((f) => (
                    <LabeledField key={f.field} label={f.label} hint={f.hint}>
                      <AutosaveInput
                        k={`sp:${id}:${f.field}`}
                        label={`${s.entry.name} ${f.label}`}
                        value={s.entry[f.field]}
                        placeholder={f.placeholder}
                        inputMode={f.field === "link" ? "url" : "text"}
                        validate={(draft) => validate(f.field, draft)}
                        onCommit={(next) => saveEntry(s.slot, { ...s.entry, [f.field]: next }, `sp:${id}:${f.field}`)}
                      />
                    </LabeledField>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        {firstFree ? (
          <div className="mt-5 rounded-2xl border border-dashed border-v2-line p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <PlusIcon size={14} /> Add a subprocessor
            </p>
            <AutosaveInput
              k={`sp:${slotId(firstFree.slot)}:name`}
              label="New subprocessor name"
              value=""
              placeholder="Company name, then press Enter"
              validate={(draft) => validate("name", draft)}
              onCommit={(next) => saveEntry(firstFree.slot, { ...EMPTY_ENTRY, name: next, dpaStatus: "To be confirmed" }, `sp:${slotId(firstFree.slot)}:name`)}
            />
            <p className="mt-1 text-[12px] text-v2-muted">It appears above with its other fields to fill in. Until its purpose is written it is on the public page with just the name.</p>
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-ink-soft">All twelve slots are in use. Remove one to add another.</p>
        )}
      </AdminPanel>
    </div>
  );
}
