"use client";

import { useState } from "react";
import { ChoiceGroup, Field, Input, cn } from "@kiwiply/ui";
import { cleanSlugInput } from "@/lib/org-slug";
import { SITE_URL } from "@/lib/site";
import { NAME_MAX, TYPE_OPTIONS, withName, type CreateDraft, type CreateFailure, type StepErrors } from "./create-logic";
import type { OrgType } from "@/lib/org-types";

const HOST = new URL(SITE_URL).host;

/** Screen 1: "What's your organization?" The name, its join-link address (derived, editable inline) and the type, as chips. */
export default function Step1({
  draft,
  onChange,
  errors,
  failure,
}: {
  draft: CreateDraft;
  onChange: (next: CreateDraft) => void;
  /** Errors to show now (only after the person has tried to continue, so a first keystroke is never scolded). */
  errors: StepErrors;
  /** The API refused the create for something on this screen. */
  failure: CreateFailure | null;
}) {
  const [editing, setEditing] = useState(false);
  const nameError = errors.name ?? (failure?.field === "name" ? failure.message : undefined);
  const typeError = errors.type ?? (failure?.field === "type" ? failure.message : undefined);
  const slugError = errors.slug ?? (failure?.field === "slug" ? failure.message : undefined);
  const suggestion = failure?.field === "slug" ? failure.suggestion : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold leading-tight text-ink">What&apos;s your organization?</h1>
        <p className="mt-1.5 text-[14.5px] text-ink-soft">Takes about a minute. You can change the details later.</p>
      </div>

      <div>
        <Field label="Organization name" error={nameError} className="mb-2">
          <Input
            value={draft.name}
            maxLength={NAME_MAX + 20}
            autoComplete="organization"
            autoFocus
            enterKeyHint="next"
            onChange={(e) => onChange(withName(draft, e.target.value))}
          />
        </Field>

        {draft.name.trim() && (
          <div className="text-[13px] text-muted">
            {editing ? (
              <Field label="Join link address" error={slugError} hint={`${HOST}/join/${draft.slug || "…"}/CODE`} className="mb-0">
                <Input
                  value={draft.slug}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => onChange({ ...draft, slug: cleanSlugInput(e.target.value), slugEdited: true })}
                />
              </Field>
            ) : (
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="min-w-0 break-all">
                  {HOST}/join/<strong className="font-semibold text-ink-soft">{draft.slug}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="min-h-11 rounded-md px-1 font-semibold text-accent-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0"
                >
                  Edit
                </button>
              </p>
            )}
            {!editing && slugError && <p className="mt-1 text-[12.5px] font-medium text-danger-text">{slugError}</p>}
            {suggestion && (
              <button
                type="button"
                onClick={() => onChange({ ...draft, slug: suggestion, slugEdited: true })}
                className="mt-1.5 min-h-11 rounded-full border border-line bg-paper px-3 text-[13px] font-semibold text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0 sm:py-1"
              >
                Use {suggestion}
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <p id="org-type-label" className="mb-2 text-[12.5px] font-semibold text-ink-soft">
          Type
        </p>
        <ChoiceGroup aria-labelledby="org-type-label" options={TYPE_OPTIONS} value={draft.type} onChange={(v) => onChange({ ...draft, type: v as OrgType })} />
        <p className={cn("mt-2 text-[12.5px] font-medium text-danger-text", !typeError && "hidden")} role={typeError ? "alert" : undefined}>
          {typeError}
        </p>
      </div>
    </div>
  );
}
