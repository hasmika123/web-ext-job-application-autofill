"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the picker starts a search when the text changes and stores the answer */

import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Field, Input, Select, XIcon } from "@kiwiply/ui";
import { applicationsApi, errorSentence, newKey, type ApplicationDetail, type PickerItem } from "@/lib/ent/applications";

const SEARCH_DELAY_MS = 250; // config-literal-ok: how long typing rests before the picker asks the server (UI timing)

/** A search box that lists up to 20 matches from the API; choosing one shows it as a chip with a clear button. */
function SearchPicker({
  orgId,
  kind,
  label,
  placeholder,
  value,
  onChange,
}: {
  orgId: number | string;
  kind: "consultant" | "job";
  label: string;
  placeholder: string;
  value: PickerItem | null;
  onChange: (v: PickerItem | null) => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setState("loading");
    const t = setTimeout(() => {
      void applicationsApi.pickers(orgId, kind, text.trim()).then((r) => {
        if (mine !== seq.current) return;
        if (r.ok) {
          setItems(r.data.items);
          setState("idle");
        } else setState("error");
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [orgId, kind, text, open]);

  if (value) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius)] border border-line bg-paper-2/50 px-3 py-1.5 text-[13.5px]" data-picked={kind}>
        <span className="min-w-0 truncate">
          <span className="font-semibold text-ink">{value.label}</span>
          {value.sub && <span className="text-muted"> · {value.sub}</span>}
        </span>
        <button type="button" aria-label={`Change ${label.toLowerCase()}`} onClick={() => onChange(null)} className="grid h-7 w-7 flex-none place-items-center rounded-full hover:bg-paper-2">
          <XIcon size={14} aria-hidden />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        autoComplete="off"
      />
      {open && (
        <ul role="listbox" aria-label={`${label} results`} className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius)] border border-line bg-paper shadow-lg">
          {state === "loading" && <li className="px-3 py-2 text-[13px] text-muted">Searching…</li>}
          {state === "error" && <li className="px-3 py-2 text-[13px] text-danger">Couldn&apos;t load the list. Try again.</li>}
          {state === "idle" && items.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No matches.</li>}
          {state === "idle" &&
            items.map((it) => (
              <li key={it.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(it);
                    setOpen(false);
                    setText("");
                  }}
                  className="flex min-h-11 w-full flex-col items-start px-3 py-1.5 text-left hover:bg-accent-soft focus-visible:bg-accent-soft"
                >
                  <span className="text-[13.5px] font-semibold text-ink">{it.label}</span>
                  {it.sub && <span className="text-[12px] text-muted">{it.sub}</span>}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Add Application: records that a consultant is being put forward for a job. It adds a row; it does not apply anywhere. The marketer
 * defaults to the consultant's assigned marketer; ticking "already submitted" records the consultant's own submission as the first stage.
 */
export default function AddApplicationDialog({
  open,
  onClose,
  orgId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  orgId: number | string;
  onCreated: (d: ApplicationDetail) => void;
}) {
  const [consultant, setConsultant] = useState<PickerItem | null>(null);
  const [job, setJob] = useState<PickerItem | null>(null);
  const [marketers, setMarketers] = useState<PickerItem[]>([]);
  const [marketer, setMarketer] = useState("");
  const [source, setSource] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [due, setDue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());

  useEffect(() => {
    if (!open) return;
    key.current = newKey();
    setConsultant(null);
    setJob(null);
    setMarketer("");
    setSource("");
    setNextAction("");
    setDue("");
    setSubmitted(false);
    setErr(null);
    void applicationsApi.pickers(orgId, "marketer", "").then((r) => setMarketers(r.ok ? r.data.items : []));
  }, [open, orgId]);

  async function submit() {
    if (!consultant || !job || busy) return;
    setBusy(true);
    setErr(null);
    const r = await applicationsApi.create(
      orgId,
      {
        requirementId: job.id,
        consultantId: consultant.id,
        marketerMemberId: marketer ? Number(marketer) : null,
        source: source.trim() || null,
        nextAction: nextAction.trim() || null,
        nextActionDue: due || null,
        stage: submitted ? "SUBMITTED" : "ASSIGNED",
      },
      key.current,
    );
    setBusy(false);
    if (!r.ok) {
      setErr(errorSentence(r));
      return;
    }
    onCreated(r.data);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Application"
      description="Record that a consultant is being put forward for a job. This adds it to your pipeline; it doesn't apply anywhere."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!consultant || !job || busy} data-add-submit>
            Add application
          </Button>
        </>
      }
    >
      <div className="space-y-3.5" data-add-dialog>
        <Field label="Consultant" required>
          <SearchPicker orgId={orgId} kind="consultant" label="Consultant" placeholder="Search consultants" value={consultant} onChange={setConsultant} />
        </Field>
        <Field label="Job" required>
          <SearchPicker orgId={orgId} kind="job" label="Job" placeholder="Search open jobs or clients" value={job} onChange={setJob} />
        </Field>
        <Field label="Marketer" hint="Leave as is to use the consultant's assigned marketer.">
          <Select
            aria-label="Marketer"
            value={marketer}
            onChange={setMarketer}
            options={[{ value: "", label: "Their assigned marketer" }, ...marketers.map((m) => ({ value: String(m.id), label: m.label }))]}
          />
        </Field>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Source">
            <Input value={source} maxLength={40} placeholder="Company website, referral…" onChange={(e) => setSource(e.target.value)} />
          </Field>
          <Field label="Next action due">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Next action">
          <Input value={nextAction} maxLength={120} placeholder="Prepare application" onChange={(e) => setNextAction(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-[13.5px] text-ink">
          <input type="checkbox" checked={submitted} onChange={(e) => setSubmitted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand-primary,var(--color-accent))]" />
          <span>
            The consultant has already submitted it
            <span className="block text-[12px] text-muted">Records it as Submitted. Kiwiply never submits for anyone.</span>
          </span>
        </label>
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
      </div>
    </Dialog>
  );
}
