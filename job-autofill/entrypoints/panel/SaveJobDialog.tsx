/**
 * Save-a-job confirmation modal. The old "Save this job" button pushed a SAVED entry silently;
 * now the user first sees the captured details in editable fields and confirms before it lands on
 * their board. Built on the shared @kiwiply/ui <Dialog> (renders inline/fixed, so it works inside
 * the drawer iframe). When the page doesn't strongly look like a job posting (`signal` false) a
 * non-blocking warning shows — the user can still save.
 */
import { useState } from "react";
import { Button, Dialog, Input } from "@kiwiply/ui";
import { commitSaveJob } from "./home-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Capture = Record<string, any>;

const FIELDS: { key: string; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
  { key: "location", label: "Location" },
  { key: "salary", label: "Salary" },
  { key: "jobUrl", label: "Job URL" },
];

export function SaveJobDialog({
  capture,
  signal,
  onCancel,
  onSaved,
}: {
  capture: Capture;
  signal: boolean;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  // Seed editable fields from the capture; the untouched capture keys (externalJobId,
  // atsPlatform, jobDescription…) ride along on save via the spread below.
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, capture[f.key] != null ? String(capture[f.key]) : ""])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setFields((m) => ({ ...m, [k]: v }));

  async function onSave() {
    setBusy(true);
    setError(null);
    const edited: Capture = { ...capture };
    for (const f of FIELDS) edited[f.key] = fields[f.key].trim() || undefined;
    const res = await commitSaveJob(edited);
    if (res.ok) {
      onSaved(res.message);
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={busy ? () => {} : onCancel}
      dismissable={!busy}
      title="Save this job"
      description="Review the details, then save it to your board."
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" disabled={busy} onClick={onSave}>
            {busy ? "Saving…" : "Save to board"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!signal && (
          <div className="rounded-[var(--radius)] border border-brown-2 bg-brown-soft px-3 py-2.5 text-[12.5px] leading-snug text-brown-deep">
            This doesn’t look like a job posting — you can still save it if you like.
          </div>
        )}
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{f.label}</span>
            <Input value={fields[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder={`Add ${f.label.toLowerCase()}`} />
          </label>
        ))}
        {error && (
          <p role="alert" className="text-[12.5px] font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
