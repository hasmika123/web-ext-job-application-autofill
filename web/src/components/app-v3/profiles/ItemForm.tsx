"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Button, Field, Input, inputClass, cn } from "@kiwiply/ui";
import { ItemApiError, type ItemBullet, type ItemData } from "@/lib/profile-items";
import {
  SECTION_DEFS,
  cleanDraft,
  emptyDraft,
  itemBullets,
  sensitiveMessage,
  validateDraft,
  type DraftErrors,
  type DraftLimits,
  type FieldDef,
  type FormSection,
} from "./itemSchema";

const MIN_TARGET = "max-sm:min-h-11";

/**
 * The inline editor for one profile item (R1.2): opens inside its card, no modal. Fields come from
 * `SECTION_DEFS`. In a bullet, Enter starts the next bullet and Backspace in an empty one removes it.
 * Save validates first (required fields, YYYY-MM dates, bullet limits from the builder settings, and
 * the never-collected values); the API's own refusals (`SENSITIVE_CONTENT`, `ITEM_TOO_LARGE`,
 * `ITEM_LIMIT`) are shown the same way, on the field when the API names one.
 */
export default function ItemForm({
  section,
  initial,
  limits,
  onSave,
  onCancel,
}: {
  section: FormSection;
  /** The stored item to edit, or null for a new one. */
  initial: ItemData | null;
  limits: DraftLimits;
  /** Resolve when saved; reject (an `ItemApiError` ideally) to keep the form open with the message. */
  onSave: (data: ItemData) => Promise<void>;
  onCancel: () => void;
}) {
  const def = SECTION_DEFS[section];
  const [draft, setDraft] = useState<ItemData>(() => {
    const base = initial ? { ...initial } : emptyDraft(section);
    // Always show at least one bullet box for kinds that have bullets.
    if (def.fields.some((f) => f.kind === "bullets") && itemBullets(base).length === 0) base.bullets = [{ text: "", src: "user" }];
    return base;
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const focusBullet = useRef<number | null>(null);

  const set = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const submit = async () => {
    const found = validateDraft(section, draft, limits);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await onSave(cleanDraft(section, draft));
    } catch (e) {
      setErrors(apiErrors(e, def.fields));
      setSaving(false);
    }
  };

  const bullets = itemBullets(draft);
  const setBullets = (next: ItemBullet[]) => set("bullets", next);

  const onBulletKey = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (bullets.length >= limits.bullets) return;
      const next = [...bullets.slice(0, i + 1), { text: "", src: "user" }, ...bullets.slice(i + 1)];
      focusBullet.current = i + 1;
      setBullets(next);
    } else if (e.key === "Backspace" && bullets[i].text === "" && bullets.length > 1) {
      e.preventDefault();
      focusBullet.current = Math.max(0, i - 1);
      setBullets(bullets.filter((_, j) => j !== i));
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-3 rounded-xl border border-v2-line bg-paper-2/40 p-3 sm:p-4"
      aria-label={`${initial ? "Edit" : "Add"} ${def.noun}`}
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        {def.fields.map((f) => (
          <div key={f.key} className={cn((f.wide || f.kind === "bullets") && "sm:col-span-2")}>
            {f.kind === "bullets" ? (
              <fieldset className="mb-[15px]">
                <legend className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">{f.label}</legend>
                <ol className="flex flex-col gap-2">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span aria-hidden className="mt-3 h-1.5 w-1.5 flex-none rounded-full bg-v2-muted" />
                      <textarea
                        ref={(el) => {
                          if (el && focusBullet.current === i) {
                            focusBullet.current = null;
                            el.focus();
                          }
                        }}
                        aria-label={`Bullet ${i + 1}`}
                        aria-invalid={errors[f.key] ? true : undefined}
                        rows={2}
                        value={b.text}
                        onChange={(e) => setBullets(bullets.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                        onKeyDown={(e) => onBulletKey(e, i)}
                        className={cn(inputClass, "min-h-[3.25rem] resize-y")}
                      />
                    </li>
                  ))}
                </ol>
                <button
                  type="button"
                  disabled={bullets.length >= limits.bullets}
                  onClick={() => {
                    focusBullet.current = bullets.length;
                    setBullets([...bullets, { text: "", src: "user" }]);
                  }}
                  className={cn("mt-2 text-[13px] font-semibold text-v2-blue hover:underline disabled:opacity-50", MIN_TARGET)}
                >
                  + Add bullet
                </button>
                <p className="mt-1 text-[12px] text-v2-muted">Press Enter for the next bullet.</p>
                {errors[f.key] && (
                  <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-danger-text">
                    {errors[f.key]}
                  </p>
                )}
              </fieldset>
            ) : f.kind === "checkbox" ? (
              <label className={cn("mb-[15px] flex items-center gap-2 text-[13.5px] text-ink", MIN_TARGET)}>
                <input
                  type="checkbox"
                  checked={draft[f.key] === true}
                  onChange={(e) => set(f.key, e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-v2-green)]"
                />
                {f.label}
              </label>
            ) : (
              <Field label={f.label} required={f.required} error={errors[f.key] || undefined}>
                {f.kind === "textarea" ? (
                  <textarea
                    rows={3}
                    value={typeof draft[f.key] === "string" ? (draft[f.key] as string) : ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    className={cn(inputClass, "resize-y")}
                  />
                ) : (
                  <Input
                    value={typeof draft[f.key] === "string" ? (draft[f.key] as string) : ""}
                    placeholder={f.placeholder}
                    inputMode={f.kind === "date" ? "numeric" : f.kind === "url" ? "url" : undefined}
                    disabled={f.key === "end" && draft.current === true}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
        ))}
      </div>

      {errors._ && (
        <p role="alert" className="mb-3 text-[13px] font-medium text-danger-text">
          {errors._}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving} className={MIN_TARGET}>
          Cancel
        </Button>
        <Button variant="accent" size="sm" type="submit" disabled={saving} className={MIN_TARGET}>
          {saving ? "Saving…" : initial ? "Save changes" : `Add ${def.noun}`}
        </Button>
      </div>
    </form>
  );
}

/** Turns a refusal from the API into field messages (`dataJson.title` -> `title`) or a form-level one. */
function apiErrors(e: unknown, fields: FieldDef[]): DraftErrors {
  if (!(e instanceof ItemApiError)) return { _: "Couldn't save that entry. Try again." };
  if (e.code === "SENSITIVE_CONTENT") {
    const msg = sensitiveMessage(e.cls ?? "");
    const key = fields.find((f) => e.path !== null && new RegExp(`(^|[.\\[])${f.key}([.\\[]|$)`).test(e.path))?.key;
    return { [key ?? "_"]: msg };
  }
  if (e.code === "ITEM_LIMIT") return { _: e.limit ? `Your profile can hold ${e.limit} entries. Delete one to add another.` : e.message };
  if (e.code === "ITEM_TOO_LARGE") return { _: "That entry is too long. Shorten the text and try again." };
  return { _: e.message };
}
