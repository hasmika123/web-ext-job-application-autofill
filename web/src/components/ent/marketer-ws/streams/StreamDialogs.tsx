"use client";

import { useState } from "react";
import { Button, Dialog, Field, Input, Select, Switch, Textarea } from "@kiwiply/ui";
import { RULE_COPY, SCHEDULE_CHOICES, scheduleLabel, type RuleRow, type StreamInput, type StreamRow } from "@/lib/ent/marketer-ws/streams";

/**
 * The two forms of the Job Streams page. Both only RECORD settings (E1: nothing here connects to a site or submits for a consultant);
 * the API validates, scans for sensitive text and answers with the saved row, which the page then shows.
 */

export function StreamDialog({ stream, onClose, onSave }: { stream: StreamRow | null; onClose: () => void; onSave: (input: StreamInput) => Promise<string | null> }) {
  const [label, setLabel] = useState(stream?.sourceLabel ?? "");
  const [subtitle, setSubtitle] = useState(stream?.subtitle ?? "");
  const [every, setEvery] = useState(String(stream?.syncEveryMinutes ?? 60));
  const [keywords, setKeywords] = useState(stream?.keywords.join(", ") ?? "");
  const [scope, setScope] = useState(stream?.clientScope ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = stream !== null;
  const minutes = Number(every);
  const choices = SCHEDULE_CHOICES.includes(minutes) ? SCHEDULE_CHOICES : [...SCHEDULE_CHOICES, minutes].sort((a, b) => a - b);

  async function submit() {
    if (!label.trim()) {
      setError("Give the stream a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await onSave({ sourceLabel: label, subtitle, syncEveryMinutes: minutes, keywords, clientScope: scope });
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? `Configure ${stream.sourceLabel}` : "Add source"}
      description="Set where openings come from, how often to check, and which keywords to look for."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" onClick={() => void submit()} disabled={busy}>
            {editing ? "Save changes" : "Add source"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Source name" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="LinkedIn Jobs" />
        </Field>
        <Field label="Description">
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={160} placeholder="Global Talent Solutions" />
        </Field>
        <Field label="Sync schedule">
          <Select value={every} onChange={setEvery} options={choices.map((m) => ({ value: String(m), label: scheduleLabel(m) }))} aria-label="Sync schedule" />
        </Field>
        <Field label="Keywords" hint="Separate with commas.">
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Java, AWS, Data Engineer" />
        </Field>
        <Field label="Client scope" hint="Leave empty to serve every client.">
          <Input value={scope} onChange={(e) => setScope(e.target.value)} maxLength={160} placeholder="ACME Clients" />
        </Field>
        <p className="text-[12.5px] text-muted">This saves the stream&apos;s settings. Openings start to appear once the connector for this source is switched on.</p>
        {error ? (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

export function RuleDialog({ rule, onClose, onSave }: { rule: RuleRow; onClose: () => void; onSave: (input: { enabled: boolean; value: string }) => Promise<string | null> }) {
  const copy = RULE_COPY[rule.key];
  const [enabled, setEnabled] = useState(rule.enabled);
  const [value, setValue] = useState(rule.value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const problem = await onSave({ enabled, value });
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      description={copy.blurb}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" onClick={() => void submit()} disabled={busy}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Switch label="Rule is on" checked={enabled} onCheckedChange={setEnabled} />
        <Field label={rule.key === "DEFAULT_KEYWORDS" ? "Keywords" : "How it works"} hint={rule.key === "DEFAULT_KEYWORDS" ? "Separate with commas." : undefined}>
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={2000} />
        </Field>
        {error ? (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
