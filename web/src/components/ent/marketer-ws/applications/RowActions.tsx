"use client";

import { useState } from "react";
import { Button, Dialog, IconButton, Input, Menu, MoreVerticalIcon, Select, Textarea } from "@kiwiply/ui";
import { addNote, markFollowUpDone, recordStage, setNextAction, STAGE_KEYS, STAGE_LABELS, type Row, type StageKey } from "@/lib/ent/marketer-ws/applications";

/**
 * The kebab of a tracker row. Four RECORDS a marketer may write (E1): add a note, set the next action + due date, mark the follow-up
 * done, and record the stage the consultant's application reached. None of them submits anything or acts as the consultant; the
 * dialog for the stage says so in words. A row the consultant shares only a summary of has no actions (the API answers 404 for it).
 */

type Mode = "note" | "next" | "done" | "stage";
const NOT_SELECTED_REASONS = [
  { value: "REJECTED", label: "Rejected" },
  { value: "NO_RESPONSE", label: "No response" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

export default function RowActions({ orgId, row, perms, onChanged }: { orgId: number; row: Row; perms: { followups: boolean; record: boolean }; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [action, setAction] = useState(row.nextAction ?? "");
  const [due, setDue] = useState(row.nextActionDue ?? "");
  const [stage, setStage] = useState<StageKey>(row.stage.key);
  const [reason, setReason] = useState("REJECTED");

  const icon = <MoreVerticalIcon size={16} aria-hidden />;
  const name = row.consultant.name;
  if (row.consultant.consent !== "FULL" || (!perms.followups && !perms.record)) {
    return <MoreVerticalIcon size={16} aria-label={`More for ${name}`} className="text-muted" />;
  }

  const items = [
    ...(perms.followups
      ? [
          { label: "Add a note", onSelect: () => open("note") },
          { label: "Set next action", onSelect: () => open("next") },
          ...(row.nextAction ? [{ label: "Mark follow-up done", onSelect: () => open("done") }] : []),
        ]
      : []),
    ...(perms.record ? [{ label: "Record stage change", onSelect: () => open("stage") }] : []),
  ];

  function open(m: Mode) {
    setError(null);
    setNote("");
    setAction(row.nextAction ?? "");
    setDue(row.nextActionDue ?? "");
    setStage(row.stage.key);
    setMode(m);
  }
  function close() {
    if (!busy) setMode(null);
  }
  async function submit(clear = false) {
    if (!mode) return;
    setBusy(true);
    setError(null);
    const r =
      mode === "note" ? await addNote(orgId, row.id, note)
      : mode === "next" ? await setNextAction(orgId, row.id, clear ? "" : action, clear || !due ? null : due)
      : mode === "done" ? await markFollowUpDone(orgId, row.id)
      : await recordStage(orgId, row.id, stage, stage === "not_selected" ? reason : undefined);
    setBusy(false);
    if (r.ok) {
      setMode(null);
      onChanged();
    } else setError(r.message);
  }

  const title = mode === "note" ? "Add a note" : mode === "next" ? "Set next action" : mode === "done" ? "Mark follow-up done" : "Record stage change";
  const detail = [row.role, row.client].filter(Boolean).join(" at ");
  return (
    <>
      <Menu
        trigger={
          <IconButton aria-label={`More for ${name}`} data-row-menu={row.id}>
            {icon}
          </IconButton>
        }
        items={items}
      />
      <Dialog
        open={mode !== null}
        onClose={close}
        title={title}
        description={`${name}${detail ? ` - ${detail}` : ""}`}
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {mode === "next" && row.nextAction ? (
              <Button variant="ghost" size="sm" onClick={() => void submit(true)} disabled={busy}>
                Clear next action
              </Button>
            ) : null}
            <Button variant="accent-soft" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={busy || (mode === "note" && !note.trim()) || (mode === "next" && !action.trim())}>
              {mode === "note" ? "Add note" : mode === "next" ? "Save" : mode === "done" ? "Mark done" : "Record stage"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-[14px]">
          {mode === "note" ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-semibold text-ink-soft">Note</span>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={4} placeholder="What happened, what is next..." />
            </label>
          ) : null}
          {mode === "next" ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold text-ink-soft">Next action</span>
                <Input value={action} onChange={(e) => setAction(e.target.value)} maxLength={120} placeholder="Follow up with hiring manager" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold text-ink-soft">Due date</span>
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </label>
            </>
          ) : null}
          {mode === "done" ? <p className="text-ink-soft">Mark &ldquo;{row.nextAction}&rdquo; as done? It leaves a line on the application&apos;s timeline.</p> : null}
          {mode === "stage" ? (
            <>
              <p className="text-ink-soft">This records where the consultant&apos;s application stands. The consultant submits; nothing is sent to the client from here.</p>
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold text-ink-soft">Stage</span>
                <Select value={stage} onChange={(v) => setStage(v as StageKey)} options={STAGE_KEYS.map((k) => ({ value: k, label: STAGE_LABELS[k] }))} aria-label="Stage" />
              </label>
              {stage === "not_selected" ? (
                <label className="flex flex-col gap-1.5">
                  <span className="font-semibold text-ink-soft">Reason</span>
                  <Select value={reason} onChange={setReason} options={NOT_SELECTED_REASONS} aria-label="Reason" />
                </label>
              ) : null}
            </>
          ) : null}
          {error ? (
            <p role="alert" className="text-[13px] font-semibold text-danger-text">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
