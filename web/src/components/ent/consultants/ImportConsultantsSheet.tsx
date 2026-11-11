"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Button, SideSheet, StatePill, Stepper, Switch, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { INVITE_LABEL, STATUS_LABEL, TEMPLATE, applyImport, checkImport, readImport, type ApplyResult, type CheckResult, type ImportRow } from "@/lib/ent/consultant-import";
import { newKey } from "@/lib/ent/consultants";

if (!hasStateMap("import-row")) {
  registerStateMap("import-row", { READY: "green", INVALID: "amber", DUPLICATE: "grey", SENSITIVE: "red" });
}

const STEPS = [
  { key: "upload", label: "Upload" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

/**
 * Import consultants from a CSV (docs/enterprise-v2/ONBOARDING-BUILD.md, gap A3): upload a file, review every row's verdict (the API checks it with the
 * rules of "Add consultant"), then Apply. Nothing is written before Apply. Ticked rows are invited to join with the Consultant role; resumes are not
 * imported, each consultant adds their own after joining.
 */
export default function ImportConsultantsSheet({ orgId, canInvite, onClose, onImported }: { orgId: number; canInvite: boolean; onClose: () => void; onImported: (r: ApplyResult) => void }) {
  const id = useId();
  const file = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [inviteAll, setInviteAll] = useState(canInvite);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => newKey());

  const templateHref = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > 2 * 1024 * 1024) return setError("That file is larger than 2 MB. Split it into smaller files.");
    const read = readImport(await textOf(f), inviteAll);
    if (!read.ok) return setError(read.message);
    setBusy(true);
    const r = await checkImport(orgId, read.rows);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setRows(read.rows);
    setUnknown(read.unknownColumns);
    setCheck(r.value);
    setStep(1);
  };

  const toggleInvite = async (i: number, on: boolean) => {
    const next = rows.map((r, j) => (j === i ? { ...r, invite: on } : r));
    setRows(next);
    const r = await checkImport(orgId, next); // the verdict says whether this row would really be invited
    if (r.ok) setCheck(r.value);
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    const r = await applyImport(orgId, rows, key);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setResult(r.value);
    setStep(2);
    onImported(r.value);
  };

  const ready = check?.ready ?? 0;
  const inviting = check?.rows.filter((v) => v.invite === "WILL_INVITE").length ?? 0;

  return (
    <SideSheet
      id={`import-${id}`} side="right" mode="overlay" open width={760}
      title="Import consultants"
      description="From a spreadsheet saved as CSV. Nothing is added until you press Import."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {step === 1 ? <span className="mr-auto text-[12.5px] text-muted">{ready} ready · {inviting} to invite</span> : null}
          <Button variant="ghost" onClick={onClose} disabled={busy}>{step === 2 ? "Close" : "Cancel"}</Button>
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={() => setStep(0)} disabled={busy}>Choose another file</Button>
              <Button variant="accent" data-import-apply disabled={busy || ready === 0} onClick={() => void apply()}>
                {busy ? "Importing..." : `Import ${ready} consultant${ready === 1 ? "" : "s"}`}
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <div data-import-sheet className="flex flex-col gap-4 p-1">
        <Stepper steps={STEPS} current={step} label="Import progress" />

        {step === 0 ? (
          <section className="flex flex-col gap-3" aria-label="Upload">
            <p className="text-[13px] text-ink-soft">
              One consultant per row. <b>name</b> and <b>email</b> are required; <b>job title</b>, <b>location</b>, <b>work mode</b> (remote, hybrid or
              onsite), <b>years</b>, <b>skills</b> (separated by <code>;</code>) and <b>department</b> (an existing one) are optional. Columns can be in any order.
            </p>
            <a href={templateHref} download="consultants-template.csv" className="w-fit text-[13px] font-semibold text-accent-deep underline" data-import-template>Download the template</a>
            {canInvite ? (
              <Switch checked={inviteAll} onCheckedChange={setInviteAll} label="Invite everyone to join" description="Each consultant gets the usual email to sign in with the Consultant role. You can untick people on the next step." />
            ) : (
              <p className="text-[12.5px] text-muted">You can add consultants but not invite them; someone who can invite people sends the invitations later.</p>
            )}
            <input ref={file} type="file" accept=".csv,text/csv" aria-label="CSV file" className="text-[13px]" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} data-import-file />
            {busy ? <p className="text-[12.5px] text-muted">Checking every row…</p> : null}
            <p className="text-[12px] text-muted">Resumes aren&apos;t imported: each consultant adds their own when they first sign in, and marketers can add more after that.</p>
          </section>
        ) : null}

        {step === 1 && check ? (
          <section aria-label="Review" className="flex flex-col gap-2">
            {unknown.length ? <p className="text-[12.5px] text-muted">Ignored columns: {unknown.join(", ")}.</p> : null}
            <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
              <table aria-label="Rows to import" className="w-full border-collapse text-[12.5px]" data-import-table>
                <thead className="border-b border-line bg-paper-2/60">
                  <tr>
                    <th scope="col" className="px-2 py-2 text-left font-semibold text-ink-soft">#</th>
                    <th scope="col" className="px-2 py-2 text-left font-semibold text-ink-soft">Consultant</th>
                    <th scope="col" className="px-2 py-2 text-left font-semibold text-ink-soft">Check</th>
                    <th scope="col" className="px-2 py-2 text-left font-semibold text-ink-soft">Invite</th>
                  </tr>
                </thead>
                <tbody>
                  {check.rows.map((v) => {
                    const r = rows[v.row - 1];
                    return (
                      <tr key={v.row} data-import-row={v.row} data-status={v.status} className="border-b border-line last:border-0 align-top">
                        <td className="px-2 py-2 text-muted">{v.row}</td>
                        <td className="px-2 py-2">
                          <span className="block font-semibold text-ink">{r?.name || "-"}</span>
                          <span className="block text-muted">{v.email || "-"}</span>
                        </td>
                        <td className="px-2 py-2">
                          <StatePill domain="import-row" state={v.status} label={STATUS_LABEL[v.status]} />
                          {v.message ? <span className="mt-1 block text-[12px] text-ink-soft">{v.field ? <b>{v.field}: </b> : null}{v.message}</span> : null}
                        </td>
                        <td className="px-2 py-2">
                          {v.status === "READY" && canInvite ? (
                            <label className="flex items-center gap-1.5">
                              <input type="checkbox" checked={r?.invite ?? false} onChange={(e) => void toggleInvite(v.row - 1, e.target.checked)} aria-label={`Invite ${r?.name ?? v.email}`} />
                              <span className="text-[12px] text-muted">{v.invite ? INVITE_LABEL[v.invite] : ""}</span>
                            </label>
                          ) : (
                            <span className="text-[12px] text-muted">{v.status === "READY" && v.invite ? INVITE_LABEL[v.invite] : "-"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-muted">Only rows marked Ready are added. Fix the others in your sheet and import them again later; those already added show as &ldquo;Already here&rdquo;.</p>
          </section>
        ) : null}

        {step === 2 && result ? (
          <section aria-label="Done" className="flex flex-col gap-2" data-import-done>
            <p className="text-[15px] font-bold text-ink">{result.added} consultant{result.added === 1 ? "" : "s"} added · {result.invited} invited · {result.skipped} skipped</p>
            {result.rows.filter((r) => r.outcome === "SKIPPED").length ? (
              <ul className="list-disc pl-5 text-[12.5px] text-ink-soft">
                {result.rows.filter((r) => r.outcome === "SKIPPED").slice(0, 50).map((r) => (
                  <li key={r.row}>Row {r.row} ({r.email || "no email"}): {r.message ?? "skipped"}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-[12.5px] text-muted">Next: give the new consultants a licence on the Licenses page, and assign them a marketer on Assignments.</p>
          </section>
        ) : null}

        {error ? <p role="alert" className="text-[13px] text-v2-pink-ink">{error}</p> : null}
      </div>
    </SideSheet>
  );
}

/** A file's text: `File.text()` where the browser has it, else a FileReader (older browsers, test DOMs). */
function textOf(f: File): Promise<string> {
  if (typeof f.text === "function") return f.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}
