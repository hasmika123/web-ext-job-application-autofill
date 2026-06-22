"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The bio object stored as the server's opaque `payload` JSON (extension-canonical). */
export type Bio = Record<string, unknown>;

// Text fields, in the order the extension's own profile editor uses them, so the two
// surfaces feel the same and write identical keys.
const TEXT_FIELDS: { key: string; label: string; type?: string; wide?: boolean }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "preferredName", label: "Preferred name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "addressLine1", label: "Address", wide: true },
  { key: "addressLine2", label: "Address line 2", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "postalCode", label: "Postal code" },
  { key: "country", label: "Country" },
  { key: "linkedin", label: "LinkedIn URL", type: "url", wide: true },
  { key: "github", label: "GitHub URL", type: "url", wide: true },
  { key: "website", label: "Website / Portfolio", type: "url", wide: true },
];

const YESNO_FIELDS: { key: string; label: string }[] = [
  { key: "authorizedToWork", label: "Authorized to work?" },
  { key: "requireSponsorship", label: "Need sponsorship?" },
];

const EDITED_KEYS = new Set([...TEXT_FIELDS, ...YESNO_FIELDS].map((f) => f.key));

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export default function BioEditor({ initialBio }: { initialBio: Bio }) {
  const router = useRouter();
  // Seed the form from the keys we manage; everything else in initialBio is preserved
  // untouched on save (e.g. the extension's EEO answers).
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const key of EDITED_KEYS) seed[key] = asString(initialBio[key]);
    return seed;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      // Merge edits over the original object so unmanaged fields survive. Trim, and
      // drop empties to keep the payload clean.
      const merged: Bio = { ...initialBio };
      for (const key of EDITED_KEYS) {
        const val = (values[key] ?? "").trim();
        if (val) merged[key] = val;
        else delete merged[key];
      }
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: JSON.stringify(merged) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save your profile.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-foreground/15 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Contact &amp; identity</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <label key={f.key} className={`flex flex-col gap-1 text-sm font-medium ${f.wide ? "sm:col-span-2" : ""}`}>
              {f.label}
              <input
                type={f.type ?? "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground/50"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-foreground/15 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Work authorization</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {YESNO_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm font-medium">
              {f.label}
              <select
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-base outline-none focus:border-foreground/50"
              >
                <option value="">—</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        {saved && <span className="text-sm text-green-700 dark:text-green-400">Saved.</span>}
        {error && (
          <span role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
