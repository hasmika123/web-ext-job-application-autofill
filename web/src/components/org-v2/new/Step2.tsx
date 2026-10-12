"use client";

import { useMemo } from "react";
import { ChoiceGroup, Field, Select, cn } from "@kiwiply/ui";
import { countryOptions } from "@/lib/countries";
import { SIZE_OPTIONS, attestationRequired, type CreateDraft, type CreateFailure, type StepErrors } from "./create-logic";

/**
 * Screen 2: "About your people". How many people the workspace will support (sales data only), the country (it drives tax
 * later), and, for a school or bootcamp, the one attestation the consent design asks for: everyone invited is 16 or older.
 * Nothing here is personal data about a person.
 */
export default function Step2({
  draft,
  onChange,
  errors,
  failure,
}: {
  draft: CreateDraft;
  onChange: (next: CreateDraft) => void;
  errors: StepErrors;
  failure: CreateFailure | null;
}) {
  const countries = useMemo(() => countryOptions(), []);
  const attest = attestationRequired(draft.type);
  const sizeError = errors.sizeBand ?? (failure?.field === "sizeBand" ? failure.message : undefined);
  const countryError = errors.country ?? (failure?.field === "country" ? failure.message : undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold leading-tight text-ink">About your people</h1>
        <p className="mt-1.5 text-[14.5px] text-ink-soft">Two quick answers so we set things up the right size.</p>
      </div>

      <div>
        <p id="org-size-label" className="mb-2 text-[12.5px] font-semibold text-ink-soft">
          How many people will you support this year?
        </p>
        <ChoiceGroup aria-labelledby="org-size-label" options={SIZE_OPTIONS} value={draft.sizeBand} onChange={(v) => onChange({ ...draft, sizeBand: v })} />
        {sizeError && (
          <p role="alert" className="mt-2 text-[12.5px] font-medium text-danger-text">
            {sizeError}
          </p>
        )}
      </div>

      <Field label="Country" error={countryError}>
        <Select
          aria-label="Country"
          placeholder="Choose a country"
          options={countries}
          value={draft.country}
          onChange={(v) => onChange({ ...draft, country: v })}
        />
      </Field>

      {attest && (
        <div>
          <label
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 text-[14px] leading-snug text-ink",
              draft.attest16 ? "border-accent bg-accent-soft" : "border-line bg-paper",
            )}
          >
            <input
              type="checkbox"
              checked={draft.attest16}
              onChange={(e) => onChange({ ...draft, attest16: e.target.checked })}
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-accent-deep)]"
            />
            <span>Everyone we invite is 16 or older.</span>
          </label>
          {errors.attest16 && (
            <p role="alert" className="mt-2 text-[12.5px] font-medium text-danger-text">
              {errors.attest16}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
