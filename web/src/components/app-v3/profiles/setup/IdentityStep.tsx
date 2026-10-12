"use client";

import { Button, Field, Input, inputClass } from "@kiwiply/ui";
import type { Identity, IdentityKey } from "@/lib/profile-setup/draft";
import type { IdentityConflict } from "@/lib/profile-setup/import";

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
 * One confirm card for who you are, prefilled from what the resume said. A value your profile already
 * has is never replaced silently: where the resume disagrees the card shows both and keeps yours until
 * you choose the resume's.
 */
export default function IdentityStep({
  values,
  conflicts,
  onChange,
}: {
  values: Identity;
  conflicts: Partial<Record<IdentityKey, IdentityConflict>>;
  onChange: (key: IdentityKey, value: string) => void;
}) {
  return (
    <div>
      <h2 className="font-display text-[20px] font-extrabold text-v2-navy">Is this you?</h2>
      <p className="mt-1 text-[14px] text-v2-ink-soft">Check your details. Anything blank you can leave, and fill in later.</p>

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
        <div className="sm:col-span-2">
          <Field label="Short summary" hint="Optional. A line or two about you; it can lead your resumes.">
            <textarea rows={4} value={values.summary ?? ""} onChange={(e) => onChange("summary", e.target.value)} className={`${inputClass} resize-y`} />
          </Field>
        </div>
      </div>
    </div>
  );
}
