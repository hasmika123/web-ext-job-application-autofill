"use client";

import { ArrowRightIcon, Button, ChevronDownIcon, Field, Input, inputClass } from "@kiwiply/ui";
import type { Identity, IdentityKey } from "@/lib/profile-setup/draft";
import type { IdentityConflict } from "@/lib/profile-setup/import";
import { StepFooter, StepHeading } from "./parts";

const FIELDS: { key: IdentityKey; label: string; wide?: boolean; type?: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", wide: true, type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "headline", label: "Headline", wide: true },
  { key: "linkedin", label: "LinkedIn", wide: true, type: "url" },
  { key: "github", label: "GitHub", wide: true, type: "url" },
  { key: "website", label: "Website", wide: true, type: "url" },
];

/**
 * `you`: the one confirm card for who you are, prefilled from what the resume said (Onboarding v2 R1.10, ONBOARDING-V2-DESIGN
 * 5.8) and the core confirm point: "Save my profile" is the ONE labelled write of the flow (one import + one profile PUT),
 * so it is not called Continue. A value your profile already has is never replaced silently: where the resume disagrees the
 * card shows both and keeps yours until you choose the resume's. On a failure the alert says why and the button becomes
 * "Try again" (the import is not repeated).
 */
export default function IdentityStep({
  values,
  conflicts,
  onChange,
  onSave,
  saving,
  retry,
  error,
}: {
  values: Identity;
  conflicts: Partial<Record<IdentityKey, IdentityConflict>>;
  onChange: (key: IdentityKey, value: string) => void;
  /** The core confirm. */
  onSave: () => void;
  saving: boolean;
  /** The import already went through and only the rest failed: the button reads "Try again". */
  retry: boolean;
  error: string | null;
}) {
  return (
    <div>
      <StepHeading title="Last check — is this you?" sub="Forms ask these on every page." />

      <div className="mt-5 grid gap-x-4 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const conflict = conflicts[f.key];
          const value = values[f.key] ?? "";
          return (
            <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
              <Field label={f.label}>
                <Input type={f.type} value={value} onChange={(e) => onChange(f.key, e.target.value)} />
              </Field>
              {conflict && (
                <p className="-mt-2 mb-[15px] text-[12.5px] text-v2-ink-soft">
                  {value === conflict.parsed ? (
                    <>
                      Using the resume&apos;s. Your profile had <strong className="break-all">{conflict.existing}</strong>.{" "}
                      <Button variant="ghost" size="sm" className="ml-1 max-sm:min-h-11" onClick={() => onChange(f.key, conflict.existing)}>
                        Keep mine
                      </Button>
                    </>
                  ) : (
                    <>
                      Your resume says <strong className="break-all">{conflict.parsed}</strong>. Your profile keeps what you have.{" "}
                      <Button variant="ghost" size="sm" className="ml-1 max-sm:min-h-11" onClick={() => onChange(f.key, conflict.parsed)}>
                        Use the resume&apos;s
                      </Button>
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
        <details className="group sm:col-span-2" open={!!values.summary && !!conflicts.summary}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-semibold text-v2-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <ChevronDownIcon size={16} className="-rotate-90 text-v2-muted transition-transform group-open:rotate-0" aria-hidden /> Summary{values.summary ? " (from your resume)" : ""}
          </summary>
          <Field label="Short summary" hint="Optional. A line or two about you; it can lead your resumes." className="mt-1">
            <textarea rows={4} value={values.summary ?? ""} onChange={(e) => onChange("summary", e.target.value)} className={`${inputClass} resize-y`} />
          </Field>
        </details>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[14px] font-medium text-danger">
          {error}
        </p>
      )}

      <StepFooter>
        <Button variant="accent" size="lg" onClick={onSave} disabled={saving} className="w-full max-sm:min-h-11">
          {saving ? "Saving…" : retry ? "Try again" : "Save my profile"} {!saving && <ArrowRightIcon size={16} aria-hidden />}
        </Button>
        <p className="mt-1 text-center text-[12.5px] text-v2-muted max-sm:pr-14">Nothing above is shared with anyone. Edit it anytime.</p>
      </StepFooter>
    </div>
  );
}
