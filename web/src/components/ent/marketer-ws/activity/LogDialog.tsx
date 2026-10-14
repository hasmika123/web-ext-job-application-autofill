"use client";

import { useState } from "react";
import { Button, Dialog, Input, Select, Textarea } from "@kiwiply/ui";
import type { ActivityOptions, LogInput } from "@/lib/ent/marketer-ws/activity";

/**
 * "Log Activity": records ONE manual activity for one of the marketer's consultants. It only RECORDS (E1): nothing is sent to the client or the consultant, nothing
 * is submitted for anyone, and the system-only types (a candidate submitted to a client, a confirmed placement) are not offered.
 */

const LABEL = "block text-[13px] font-semibold text-ink-soft";

export default function LogDialog({
  open, options, busy, error, onClose, onSubmit,
}: { open: boolean; options: ActivityOptions; busy: boolean; error: string | null; onClose: () => void; onSubmit: (input: LogInput) => void }) {
  const [consultant, setConsultant] = useState("");
  const [type, setType] = useState(options.manualTypes[0]?.key ?? "FOLLOWUP_LOGGED");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [client, setClient] = useState("");
  const [tags, setTags] = useState("");
  const [when, setWhen] = useState("");

  const valid = consultant !== "" && title.trim().length > 0 && type !== "";
  const submit = () => {
    if (!valid || busy) return;
    const at = when ? new Date(when) : null;
    onSubmit({
      consultantId: Number(consultant), clientAccountId: client ? Number(client) : null, type, title: title.trim(), detail: detail.trim() || undefined, tags: tags.trim() || undefined,
      occurredAt: at && !Number.isNaN(at.getTime()) ? at.toISOString() : undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Log Activity"
      description="Record work you did for one of your consultants. This only records it: nothing is sent to the client or the consultant, and nothing is submitted."
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} disabled={!valid || busy}>
            {busy ? "Saving..." : "Log activity"}
          </Button>
        </div>
      }
    >
      <div data-log-dialog className="flex flex-col gap-3.5">
        <label className={LABEL}>
          Consultant
          <Select
            className="mt-1.5"
            aria-label="Consultant"
            value={consultant}
            onChange={setConsultant}
            placeholder="Choose a consultant"
            options={[{ value: "", label: "Choose a consultant", disabled: true }, ...options.consultants.map((c) => ({ value: String(c.id), label: c.name }))]}
          />
        </label>
        <label className={LABEL}>
          Activity type
          <Select className="mt-1.5" aria-label="Activity type" value={type} onChange={setType} options={options.manualTypes.map((t) => ({ value: t.key, label: t.label }))} />
        </label>
        <label className={LABEL}>
          Title
          <Input className="mt-1.5" aria-label="Title" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What did you do?" />
        </label>
        <label className={LABEL}>
          Details (optional)
          <Textarea className="mt-1.5" aria-label="Details" rows={3} maxLength={200} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={LABEL}>
            Client (optional)
            <Select
              className="mt-1.5"
              aria-label="Client"
              value={client}
              onChange={setClient}
              options={[{ value: "", label: "No client" }, ...options.clients.map((c) => ({ value: String(c.id), label: c.name }))]}
            />
          </label>
          <label className={LABEL}>
            When (optional)
            <Input className="mt-1.5" type="datetime-local" aria-label="When" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
        </div>
        <label className={LABEL}>
          Tags (optional, comma separated)
          <Input className="mt-1.5" aria-label="Tags" maxLength={100} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Client, Call" />
        </label>
        <p className="text-[12px] text-muted">Leave &quot;When&quot; empty to log it as done now; a future time plans it under Upcoming Activities. Do not enter personal identifiers.</p>
        {error ? (
          <p role="alert" className="text-[13px] font-medium text-v2-coral-ink">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
