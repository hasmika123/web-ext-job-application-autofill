"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, Input, PlusIcon, Textarea, XCircleIcon, cn } from "@kiwiply/ui";
import { checkMonth, checkText } from "@/lib/ent/consultant-ws/profile";

/**
 * The small inline editors My Career Profile uses. Each one validates the same rules the API enforces (so the form refuses early),
 * hands the value to `onSave`, and shows the API's own refusal (including the "we never store that" PII message) under the field.
 * `onSave` resolves to an error message, or null when the value was saved.
 */
export type SaveFn<A extends unknown[] = [string]> = (...args: A) => Promise<string | null>;

export const FIELD_ERROR = "mt-1.5 text-[12.5px] font-medium text-v2-coral-ink";
export const EDIT_LINK = "inline-flex min-h-8 flex-none items-center gap-1 rounded-md px-1.5 text-[13px] font-semibold text-accent-deep hover:underline";

export function Chip({ children, onRemove, label }: { children: ReactNode; onRemove?: () => void; label?: string }) {
  return (
    <span data-chip className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-paper-2/60 px-3.5 text-[13px] font-medium text-ink">
      {children}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={label} className="-mr-1.5 grid h-6 w-6 place-items-center rounded-full text-muted hover:text-v2-coral-ink">
          <XCircleIcon size={15} />
        </button>
      ) : null}
    </span>
  );
}

/** A wrapped list of chips with remove buttons while `editing`, and an inline "+ Add" that opens a one-line form. */
export function ChipList({
  idBase,
  items,
  editing,
  adding,
  setAdding,
  addLabel,
  noun,
  placeholder,
  maxLength,
  onAdd,
  onRemove,
  empty,
}: {
  idBase: string;
  items: { id: number; label: string }[];
  editing: boolean;
  adding: boolean;
  setAdding: (v: boolean) => void;
  addLabel: string;
  noun: string;
  placeholder: string;
  maxLength: number;
  onAdd: SaveFn;
  onRemove: SaveFn<[number]>;
  empty: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local = checkText(value, maxLength);
    if (local) return setError(local);
    setBusy(true);
    const err = await onAdd(value.trim());
    setBusy(false);
    if (err) return setError(err);
    setValue("");
    setError(null);
    ref.current?.focus();
  }

  return (
    <div>
      {items.length === 0 && !adding ? <p className="mb-2 text-[13px] text-muted">{empty}</p> : null}
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <Chip key={i.id} onRemove={editing ? () => void onRemove(i.id) : undefined} label={`Remove ${i.label}`}>
            {i.label}
          </Chip>
        ))}
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--brand-border,var(--color-line))] bg-paper px-3.5 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft"
          >
            <PlusIcon size={14} />
            {addLabel}
          </button>
        ) : null}
      </div>
      {adding ? (
        <form onSubmit={submit} className="mt-3" aria-label={`Add ${noun}`}>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[10rem] flex-1">
              <label htmlFor={`${idBase}-input`} className="sr-only">
                {noun}
              </label>
              <Input id={`${idBase}-input`} ref={ref} autoFocus value={value} maxLength={maxLength} placeholder={placeholder} aria-invalid={error ? true : undefined} aria-describedby={error ? `${idBase}-err` : undefined} onChange={(e) => setValue(e.target.value)} />
            </div>
            <Button type="submit" size="sm" variant="accent" disabled={busy}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setValue("");
                setError(null);
              }}
            >
              Done
            </Button>
          </div>
          {error ? (
            <p id={`${idBase}-err`} role="alert" className={FIELD_ERROR}>
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

/** A textarea that saves on "Save" (and clears the field when saved empty). */
export function TextEditor({ idBase, label, initial, max, rows = 5, onSave, onClose }: { idBase: string; label: string; initial: string; max: number; rows?: number; onSave: SaveFn; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local = checkText(value, max, false);
    if (local) return setError(local);
    setBusy(true);
    const err = await onSave(value.trim());
    setBusy(false);
    if (err) return setError(err);
    onClose();
  }

  return (
    <form onSubmit={submit} aria-label={`Edit ${label.toLowerCase()}`}>
      <label htmlFor={`${idBase}-text`} className="sr-only">
        {label}
      </label>
      <Textarea id={`${idBase}-text`} autoFocus rows={rows} value={value} maxLength={max + 50} aria-invalid={error ? true : undefined} aria-describedby={`${idBase}-count${error ? ` ${idBase}-err` : ""}`} onChange={(e) => setValue(e.target.value)} />
      <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-muted">
        <span id={`${idBase}-count`} className={cn(value.trim().length > max && "font-semibold text-v2-coral-ink")}>
          {value.trim().length}/{max}
        </span>
        <span>Please don&apos;t include ID numbers or dates of birth.</span>
      </div>
      {error ? (
        <p id={`${idBase}-err`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button type="submit" size="sm" variant="accent" disabled={busy}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Name, optional issuer and optional month: the inline "Add Certification" form. */
export function CertificationForm({ onSave, onClose }: { onSave: SaveFn<[string, string, string]>; onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [month, setMonth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const bad = checkText(name, 160) ?? checkText(issuer, 120, false) ?? checkMonth(month);
    if (bad) return setError(bad);
    setBusy(true);
    const err = await onSave(name.trim(), issuer.trim(), month);
    setBusy(false);
    if (err) return setError(err);
    onClose();
  }

  return (
    <form onSubmit={submit} aria-label="Add certification" className="mt-3 rounded-xl border border-line bg-paper-2/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-name`} className="mb-1 block text-[12.5px] font-semibold text-ink-soft">
            Certification name
          </label>
          <Input id={`${id}-name`} autoFocus value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-issuer`} className="mb-1 block text-[12.5px] font-semibold text-ink-soft">
            Issued by (optional)
          </label>
          <Input id={`${id}-issuer`} value={issuer} maxLength={120} onChange={(e) => setIssuer(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-month`} className="mb-1 block text-[12.5px] font-semibold text-ink-soft">
            Month issued (optional)
          </label>
          <Input id={`${id}-month`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>
      {error ? (
        <p role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" variant="accent" disabled={busy}>
          Add certification
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
