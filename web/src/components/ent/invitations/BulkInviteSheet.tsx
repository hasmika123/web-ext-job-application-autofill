"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { Button, Field, Select, StatePill, Textarea, UploadIcon } from "@kiwiply/ui";
import { ROW_LABEL, invitationsApi, parseEntries, problemText, rowProblem, type FormOptions, type InviteRow } from "@/lib/ent/invitations";
import RoleSelect from "./RoleSelect";
import Sheet from "./Sheet";
import { MESSAGE_MAX } from "./InvitePanel";

const TONE: Record<InviteRow["status"], string> = { INVITED: "ok", INVALID: "bad", DUPLICATE: "bad", ALREADY_MEMBER: "warn" };

/** Lines that are a header row of a pasted spreadsheet, not people. */
const HEADER = /^(e-?mails?|e-?mail address(es)?|name|full name)$/i;

/** Pasting or uploading a list: the same roles and department for everyone, then one result row per entry (what worked, what did not and why). */
export default function BulkInviteSheet({
  open,
  onClose,
  orgId,
  options,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  orgId: number | string;
  options: FormOptions | null;
  /** Called when at least one person was invited (the page refreshes the list and offers nothing more). */
  onDone: (invited: number) => void;
}) {
  const uid = useId();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [dept, setDept] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InviteRow[] | null>(null);

  const entries = parseEntries(text).filter((e) => !HEADER.test(e));
  const departments = options?.departments ?? [];
  const needsDept = departments.length > 0;

  async function send() {
    setError(null);
    if (entries.length === 0) return setError("Paste at least one email address.");
    if (roleIds.length === 0) return setError("Pick at least one role.");
    if (needsDept && !dept) return setError("Pick a department.");
    setBusy(true);
    const r = await invitationsApi.invite(orgId, {
      emails: entries,
      roleIds,
      ...(dept ? { departmentGroupId: Number(dept) } : {}),
      ...(message.trim() ? { message: message.trim() } : {}),
    });
    setBusy(false);
    if (!r.ok) return setError(problemText(r));
    const result = r.data.rows?.length ? r.data.rows : [];
    setRows(result);
    const invited = result.filter((x) => x.status === "INVITED").length || r.data.invited?.length || 0;
    if (invited > 0) onDone(invited);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 512 * 1024) return setError("That file is too big. Paste the list instead (up to a few hundred addresses).");
    setText(await f.text());
    setError(null);
    setRows(null);
  }

  /** Keep only what failed, so the next send retries just those. */
  function fixRest() {
    if (!rows) return;
    setText(rows.filter((r) => r.status !== "INVITED").map((r) => r.entry).join("\n"));
    setRows(null);
  }

  function close() {
    onClose();
    // let the sheet slide away before the form resets
    setTimeout(() => {
      setText("");
      setRows(null);
      setError(null);
      setMessage("");
    }, 250);
  }

  const failed = rows?.filter((r) => r.status !== "INVITED").length ?? 0;
  return (
    <Sheet id="invitations-bulk-sheet" open={open} onClose={close} title="Bulk Invite" description="Invite several people at once. They all get the same roles.">
      {rows ? (
        <div data-bulk-result className="flex flex-col gap-3">
          <p role="status" className="text-[14px] font-semibold text-ink">
            {rows.length - failed} invited{failed > 0 ? `, ${failed} not` : ""}.
          </p>
          <ul aria-label="Result for each address" className="max-h-72 divide-y divide-line/60 overflow-auto rounded-[var(--radius)] border border-line">
            {rows.map((r, i) => {
              const problem = rowProblem(r);
              return (
                <li key={`${r.entry}-${i}`} data-row-status={r.status} data-tone={TONE[r.status]} className="flex items-start gap-2.5 px-3 py-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{r.email ?? r.entry}</span>
                    {problem && <span className="block text-[12px] text-danger-text">{problem}</span>}
                  </span>
                  <StatePill domain="invitation" state={r.status === "INVITED" ? "ACCEPTED" : r.status === "ALREADY_MEMBER" ? "PENDING" : "EXPIRED"} label={ROW_LABEL[r.status]} />
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            {failed > 0 && (
              <Button type="button" variant="ghost" onClick={fixRest}>
                Fix the {failed === 1 ? "one" : failed} that didn&apos;t work
              </Button>
            )}
            <Button type="button" variant="accent" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex flex-col gap-3.5"
        >
          <Field className="mb-0" label="Email addresses" required htmlFor={`${uid}-list`} hint="One per line, or separated by commas. “Name <name@company.com>” works too.">
            <Textarea id={`${uid}-list`} rows={6} placeholder={"emily@company.com\nJames Wilson <james@company.com>"} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={onFile} aria-label="Upload a CSV or text file of addresses" />
            <Button type="button" variant="ghost" size="sm" onClick={() => file.current?.click()}>
              <UploadIcon aria-hidden size={15} />
              Upload CSV or text
            </Button>
            <span aria-live="polite">{entries.length === 0 ? "No addresses yet" : `${entries.length} ${entries.length === 1 ? "address" : "addresses"} found`}</span>
          </div>
          <Field className="mb-0" label="Role" required htmlFor={`${uid}-role`} render={() => <RoleSelect id={`${uid}-role`} options={options?.roles ?? []} value={roleIds} onChange={setRoleIds} />}>
            <span />
          </Field>
          <Field className="mb-0" label="Department" required={needsDept} htmlFor={`${uid}-dept`} hint={options && !needsDept ? "No departments yet. They will join without one." : undefined}>
            <Select id={`${uid}-dept`} aria-label="Department" value={dept} onChange={setDept} placeholder={needsDept ? "Select a department" : "None"} disabled={!needsDept} options={departments.map((d) => ({ value: String(d.id), label: d.name }))} />
          </Field>
          <Field className="mb-0" label={<>Personal Message <span className="font-normal text-muted">(Optional)</span></>} htmlFor={`${uid}-msg`}>
            <Textarea id={`${uid}-msg`} rows={2} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a personal message to the invitations..." />
          </Field>
          {error && (
            <p role="alert" className="text-[13px] text-danger-text">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" disabled={busy}>
              {busy ? "Sending…" : entries.length > 1 ? `Send ${entries.length} invitations` : "Send invitations"}
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
