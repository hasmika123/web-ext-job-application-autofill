"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button, Input, MemberAvatar, Select, SheetFrame, Skeleton, Textarea, cn } from "@kiwiply/ui";
import { relativeTime } from "@/lib/ent/dashboard";
import {
  DUPLICATE_WARNING, INTEREST_LABELS, answerInfo, checkHandJob, createJobByHand, fetchDetail, fetchOptions, fetchReady, followUpOf, matchTone, nextActionText, reassignOpportunity, withdrawOpportunity,
  type Detail, type DuplicateFinding, type HandJobInput, type InfoThread, type JobOption, type Opportunity, type Option,
} from "@/lib/ent/marketer-ws/opportunities";

const EMPTY_HAND: HandJobInput = { title: "", company: "", location: "", workMode: "", description: "", jobUrl: "" };
import { INTEREST_TONE, ResumeBadge } from "./bits";

/**
 * The dialogs of the Opportunities board. E1: every button here prepares or requests; nothing answers for a consultant or submits for one.
 * The caller (the page) owns the network calls so the toast and the reload stay in one place.
 */

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-4">
    <h3 className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
    {children}
  </section>
);

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[12px] text-muted">{label}</dt>
    <dd className="truncate text-[13.5px] font-semibold text-ink">{children}</dd>
  </div>
);

/**
 * MKT-41: the consultant asked a question about the job; the marketer answers it here. Only the answer is sent: the consultant's own interest and state
 * stay theirs (E1: the marketer prepares, requests and records; the consultant decides).
 */
function InfoBox({ orgId, id, info, onAnswered }: { orgId: number; id: number; info: InfoThread; onAnswered: (answer: string) => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    const answer = text.trim();
    if (!answer || sending) return;
    setSending(true);
    setError("");
    const r = await answerInfo(orgId, id, answer);
    setSending(false);
    if (r.ok) {
      setText("");
      onAnswered(answer);
    } else setError(r.error);
  };
  return (
    <Section title="Question from the consultant">
      <div data-opp-info className="rounded-lg border border-line bg-paper-2 p-3 text-[13.5px]">
        <p className="text-ink">{info.question}</p>
        {info.answer ? <p data-opp-info-answer className="mt-2 border-t border-line pt-2 text-ink-soft"><span className="font-semibold text-ink">Your answer: </span>{info.answer}</p> : null}
      </div>
      {info.awaitingAnswer ? (
        <div className="mt-2">
          <Textarea aria-label="Your answer" rows={3} maxLength={1000} value={text} placeholder={info.answer ? "Add to your answer..." : "Answer the question..."} onChange={(e) => setText(e.target.value)} />
          {error ? <p role="alert" className="mt-1 text-[12.5px] text-danger-text">{error}</p> : null}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] text-muted">Only the consultant moves this opportunity on.</span>
            <Button size="sm" disabled={sending || !text.trim()} onClick={() => void send()}>{info.answer ? "Send another answer" : "Send answer"}</Button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}

/**
 * MKT-44: take an assignment back (a reason is required and the consultant is told) or, once the consultant declined or it was withdrawn, offer the job to
 * another consultant of the caller's scope. Both call the API directly; the page reloads through {@code onChanged}. Nothing here answers or submits for anyone (E1).
 */
function FollowUpBox({ orgId, o, onChanged }: { orgId: number; o: Opportunity; onChanged: (message: string) => void }) {
  const kind = followUpOf(o);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [others, setOthers] = useState<{ value: string; label: string }[] | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dup, setDup] = useState<{ message: string; findings: DuplicateFinding[] } | null>(null);
  const [dupReason, setDupReason] = useState("");
  useEffect(() => {
    if (kind !== "REASSIGN" || !open) return;
    let live = true;
    void fetchOptions(orgId).then((opts) => {
      if (live) setOthers((opts?.consultants ?? []).filter((c) => c.id !== o.consultant.id).map((c) => ({ value: String(c.id), label: c.name })));
    });
    return () => {
      live = false;
    };
  }, [orgId, kind, open, o.consultant.id]);
  if (!kind) return null;
  const submit = async () => {
    setBusy(true);
    setError("");
    const confirm = dup && dupReason.trim() ? { reason: dupReason.trim() } : undefined;
    const r = kind === "WITHDRAW" ? await withdrawOpportunity(orgId, o.id, reason.trim()) : await reassignOpportunity(orgId, o.id, Number(target), confirm);
    setBusy(false);
    if (r.ok) onChanged(r.message);
    else if (kind === "REASSIGN" && r.code === DUPLICATE_WARNING) setDup({ message: r.error, findings: r.findings ?? [] }); // ask for a reason, then offer anyway
    else setError(r.error);
  };
  return (
    <Section title={kind === "WITHDRAW" ? "Withdraw" : "Offer to someone else"}>
      {!open ? (
        <Button variant="ghost" size="sm" data-opp-followup={kind.toLowerCase()} onClick={() => setOpen(true)}>
          {kind === "WITHDRAW" ? "Withdraw this assignment" : "Re-assign to another consultant"}
        </Button>
      ) : kind === "WITHDRAW" ? (
        <div data-opp-withdraw>
          <p className="mb-1.5 text-[13px] text-muted">{o.consultant.name} is told the opportunity was withdrawn, with your reason.</p>
          <Textarea aria-label="Reason for withdrawing" rows={3} maxLength={200} value={reason} placeholder="Why are you taking it back?" onChange={(e) => setReason(e.target.value)} />
          {error ? <p role="alert" className="mt-1 text-[12.5px] text-danger-text">{error}</p> : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={busy || !reason.trim()} onClick={() => void submit()}>Withdraw</Button>
          </div>
        </div>
      ) : (
        <div data-opp-reassign>
          {others === null ? (
            <Skeleton className="h-10 w-full" />
          ) : others.length === 0 ? (
            <p className="text-[13px] text-muted">You have no other consultant to offer this to.</p>
          ) : (
            <Select aria-label="Offer to" value={target} onChange={setTarget} placeholder="Choose a consultant" options={others} />
          )}
          {dup ? <DuplicateNotice message={dup.message} findings={dup.findings} reason={dupReason} onReason={setDupReason} /> : null}
          {error ? <p role="alert" className="mt-1 text-[12.5px] text-danger-text">{error}</p> : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={busy || !target || (dup !== null && !dupReason.trim())} onClick={() => void submit()}>{dup ? "Offer anyway" : "Offer the job"}</Button>
          </div>
        </div>
      )}
    </Section>
  );
}

/**
 * The duplicate warning (409 DUPLICATE_WARNING): what the API found, in its own words, and a reason the marketer must give to go ahead. The reason is kept in
 * the audit trail. A block (the organization's policy) or the open-opportunity limit never gets this far: they are plain messages with nothing to confirm.
 */
function DuplicateNotice({ message, findings, reason, onReason }: { message: string; findings: DuplicateFinding[]; reason: string; onReason: (v: string) => void }) {
  return (
    <div data-opp-duplicate role="alert" className="mt-2 rounded-lg border border-line bg-v2-amber-soft p-3 text-[13px] text-v2-amber-ink">
      <p className="font-semibold">This looks like a duplicate</p>
      {findings.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {findings.map((f, i) => <li key={`${f.rule}-${i}`}>{f.message}</li>)}
        </ul>
      ) : (
        <p className="mt-1">{message}</p>
      )}
      <label className="mt-2 block text-[12.5px] font-semibold" htmlFor="opp-duplicate-reason">Why is it fine to go ahead?</label>
      <Textarea id="opp-duplicate-reason" rows={2} maxLength={200} value={reason} placeholder="For example: the client asked for both vendors" onChange={(e) => onReason(e.target.value)} />
      <p className="mt-1 text-[12px]">Your reason is kept in the audit trail. Please don&apos;t include ID numbers or dates of birth.</p>
    </div>
  );
}

/** Assign one opportunity that the guard flagged: shows the findings and asks for the reason before assigning anyway. Nothing is answered or submitted for the consultant. */
export function DuplicateDialog({ open, who, message, findings, busy, onClose, onConfirm }: { open: boolean; who: string; message: string; findings: DuplicateFinding[]; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  return (
    <SheetFrame id="opp-duplicate" open={open} onClose={onClose} title="Possible duplicate">
      {open ? <DuplicateBody who={who} message={message} findings={findings} busy={busy} onClose={onClose} onConfirm={onConfirm} /> : null}
    </SheetFrame>
  );
}

/** Mounted only while the dialog is open, so the reason starts empty every time. */
function DuplicateBody({ who, message, findings, busy, onClose, onConfirm }: { who: string; message: string; findings: DuplicateFinding[]; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div data-opp-dialog="duplicate" className="min-w-0">
      <p className="text-[13.5px] text-ink-soft">Assigning this to {who} would put them in front of the same role twice.</p>
      <DuplicateNotice message={message} findings={findings} reason={reason} onReason={setReason} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>Assign anyway</Button>
      </div>
    </div>
  );
}

/** Review (the marketer looks the opportunity over) and Compare (the same consultant's other open opportunities). */
export function DetailDialog({ orgId, id, mode, onClose, onReview, onChanged, busy }: { orgId: number; id: number | null; mode: "REVIEW" | "COMPARE"; onClose: () => void; onReview: (id: number) => void; onChanged?: (message: string) => void; busy: boolean }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (id === null) return;
    let live = true;
    void fetchDetail(orgId, id).then((d) => {
      if (!live) return;
      setDetail(d);
      setFailed(d === null);
    });
    return () => {
      live = false;
      setDetail(null);
      setFailed(false);
    };
  }, [orgId, id]);
  const o = detail?.item;
  const alts = detail?.alternatives ?? [];
  const evts = detail?.events ?? [];
  const [now] = useState(() => Date.now());
  return (
    <SheetFrame id="opp-detail" open={id !== null} onClose={onClose} title={mode === "COMPARE" ? "Compare opportunities" : "Review opportunity"}>
      <div data-opp-dialog={mode.toLowerCase()} className="min-w-0">
        {failed ? (
          <p className="py-6 text-center text-[13.5px] text-muted">This opportunity couldn&apos;t be loaded. It may have been closed.</p>
        ) : !o ? (
          <div aria-busy="true" className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <>
            <p className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
              <MemberAvatar name={o.consultant.name} src={o.consultant.avatarUrl} size={36} />
              <span className="min-w-0 truncate">{o.consultant.name}</span>
            </p>
            <p className="mt-1 text-[13.5px] text-ink-soft">{o.jobTitle} at {o.client}{o.location ? ` - ${o.location}` : ""}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              <Fact label="Match score"><MatchChip pct={o.matchScore} /></Fact>
              <Fact label="Consultant interest"><span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12.5px]", INTEREST_TONE[o.interest].pill)}><span aria-hidden className={cn("h-2 w-2 rounded-full", INTEREST_TONE[o.interest].dot)} />{INTEREST_LABELS[o.interest]}</span></Fact>
              <Fact label="Resume"><ResumeBadge state={o.resumeStatus} /></Fact>
              <Fact label="Owner">{o.owner?.name ?? "-"}</Fact>
              <Fact label="Next action">{nextActionText(o.nextActionAt, now)}</Fact>
              <Fact label="Status">{o.status === "ASSIGNED" ? "Assigned" : "Suggested"}</Fact>
            </dl>
            {o.reason ? <p className="mt-3 text-[13px] text-muted">Why it matches: {o.reason}</p> : null}

            {detail?.info ? <InfoBox orgId={orgId} id={o.id} info={detail.info} onAnswered={(answer) => setDetail((d) => (d && d.info ? { ...d, info: { ...d.info, answer } } : d))} /> : null}

            {onChanged ? <FollowUpBox orgId={orgId} o={o} onChanged={onChanged} /> : null}

            {mode === "COMPARE" || alts.length > 0 ? (
              <Section title={`${o.consultant.name}'s other open opportunities`}>
                {alts.length === 0 ? (
                  <p className="text-[13.5px] text-muted">No other open opportunities for this consultant.</p>
                ) : (
                  <ul className="flex flex-col">
                    {alts.map((a) => (
                      <li key={a.id} data-compare-row={a.id} className="flex items-center gap-2 border-b border-line py-1.5 text-[13px] last:border-0">
                        <span className="min-w-0 flex-1 truncate"><b className="text-ink">{a.jobTitle}</b> <span className="text-muted">{a.client}</span></span>
                        <MatchChip pct={a.matchScore} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            ) : null}

            <Section title="Timeline">
              {evts.length === 0 ? (
                <p className="text-[13.5px] text-muted">Nothing has happened on this opportunity yet.</p>
              ) : (
                <ul className="flex flex-col">
                  {evts.map((e) => (
                    <li key={e.id} className="flex items-baseline gap-2 border-b border-line py-1.5 text-[13px] last:border-0">
                      <span className="min-w-0 flex-1 truncate text-ink">{e.consultant} {e.text}</span>
                      <span className="flex-none text-[12px] text-muted">{relativeTime(e.at, now)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" disabled={busy} onClick={() => onReview(o.id)}>Mark as reviewed</Button>
            </div>
          </>
        )}
      </div>
    </SheetFrame>
  );
}

export function MatchChip({ pct }: { pct: number }) {
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold", matchTone(pct) === "green" ? "bg-v2-green-soft text-v2-green-ink" : "bg-v2-amber-soft text-v2-amber-ink")}>{pct}%</span>;
}

/** Add Opportunity: a consultant (in the caller's scope) and an open job become a SUGGESTED opportunity. */
export function AddDialog({ orgId, open, onClose, onCreate, busy }: { orgId: number; open: boolean; onClose: () => void; onCreate: (consultantId: number, requirementId: number) => void; busy: boolean }) {
  const [opts, setOpts] = useState<{ consultants: Option[]; jobs: JobOption[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [consultant, setConsultant] = useState("");
  const [job, setJob] = useState("");
  const [hand, setHand] = useState(false);
  const [form, setForm] = useState<HandJobInput>(EMPTY_HAND);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void fetchOptions(orgId).then((o) => {
      if (!live) return;
      setOpts(o);
      setFailed(o === null);
    });
    return () => {
      live = false;
      setOpts(null);
      setFailed(false);
      setConsultant("");
      setJob("");
      setHand(false);
      setForm(EMPTY_HAND);
      setFormError(null);
    };
  }, [orgId, open]);

  async function saveHandJob() {
    const problem = checkHandJob(form);
    if (problem) return setFormError(problem);
    setSaving(true);
    setFormError(null);
    const r = await createJobByHand(orgId, form);
    if (!r.ok) {
      setSaving(false);
      return setFormError(r.error);
    }
    const fresh = await fetchOptions(orgId); // the new job is on the list now: pick it for the marketer
    setSaving(false);
    if (fresh) setOpts(fresh);
    setJob(String(r.jobId));
    setHand(false);
    setForm(EMPTY_HAND);
  }

  if (open && hand) {
    const set = (patch: Partial<HandJobInput>) => setForm((f) => ({ ...f, ...patch }));
    return (
      <SheetFrame id="opp-add" open={open} onClose={onClose} title="Add a job by hand">
        <div data-opp-dialog="hand-job" className="min-w-0">
          <p className="mb-3 text-[13px] text-muted">Type in a job you found yourself. It is saved for your organization with the source Manual; nobody is contacted and nothing is submitted.</p>
          <label className="mb-1 block text-[13px] font-semibold text-ink-soft" htmlFor="hand-title">Job title</label>
          <Input id="hand-title" value={form.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} />
          <label className="mb-1 mt-3 block text-[13px] font-semibold text-ink-soft" htmlFor="hand-company">Company</label>
          <Input id="hand-company" value={form.company} maxLength={200} onChange={(e) => set({ company: e.target.value })} />
          <label className="mb-1 mt-3 block text-[13px] font-semibold text-ink-soft" htmlFor="hand-location">Location</label>
          <Input id="hand-location" value={form.location} maxLength={300} placeholder="e.g. Austin, TX" onChange={(e) => set({ location: e.target.value })} />
          <label className="mb-1 mt-3 block text-[13px] font-semibold text-ink-soft" htmlFor="hand-mode">Work mode</label>
          <Select id="hand-mode" aria-label="Work mode" value={form.workMode} onChange={(v) => set({ workMode: v as HandJobInput["workMode"] })} placeholder="Choose a work mode" options={[{ value: "ONSITE", label: "On-site" }, { value: "HYBRID", label: "Hybrid" }, { value: "REMOTE", label: "Remote" }]} />
          <label className="mb-1 mt-3 block text-[13px] font-semibold text-ink-soft" htmlFor="hand-desc">Description</label>
          <Textarea id="hand-desc" rows={5} value={form.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} />
          <label className="mb-1 mt-3 block text-[13px] font-semibold text-ink-soft" htmlFor="hand-url">Link (optional)</label>
          <Input id="hand-url" type="url" value={form.jobUrl} maxLength={1000} placeholder="https://" onChange={(e) => set({ jobUrl: e.target.value })} />
          <p className="mt-2 text-[12px] text-muted">Please don&apos;t include ID numbers or dates of birth.</p>
          {formError ? <p role="alert" className="mt-2 text-[12.5px] font-medium text-v2-coral-ink">{formError}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setHand(false)}>Back</Button>
            <Button size="sm" disabled={saving} onClick={() => void saveHandJob()}>Save job</Button>
          </div>
        </div>
      </SheetFrame>
    );
  }
  return (
    <SheetFrame id="opp-add" open={open} onClose={onClose} title="Add opportunity">
      <div data-opp-dialog="add" className="min-w-0">
        {failed ? (
          <p className="py-6 text-center text-[13.5px] text-muted">The consultants and jobs couldn&apos;t be loaded.</p>
        ) : !opts ? (
          <div aria-busy="true" className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-muted">The consultant is not contacted until you assign it. Suggested opportunities start with no answer from the consultant.</p>
            <label className="mb-1 block text-[13px] font-semibold text-ink-soft" htmlFor="opp-add-consultant">Consultant</label>
            <Select id="opp-add-consultant" aria-label="Consultant" value={consultant} onChange={setConsultant} placeholder="Choose a consultant" options={opts.consultants.map((c) => ({ value: String(c.id), label: c.name }))} />
            <label className="mb-1 mt-3 block text-[13px] font-semibold text-ink-soft" htmlFor="opp-add-job">Job</label>
            <Select id="opp-add-job" aria-label="Job" value={job} onChange={setJob} placeholder="Choose an open job" options={opts.jobs.map((j) => ({ value: String(j.id), label: `${j.title} - ${j.client}` }))} />
            <button type="button" data-add-job-by-hand onClick={() => setHand(true)} className="mt-3 inline-flex min-h-9 items-center text-[13px] font-semibold text-accent-deep hover:underline">Add a job by hand</button>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={busy || !consultant || !job} onClick={() => onCreate(Number(consultant), Number(job))}>Add opportunity</Button>
            </div>
          </>
        )}
      </div>
    </SheetFrame>
  );
}

/** Bulk Assign: the ready opportunities (suggested, resume up to date), each can be ticked off. Assigning asks the consultant; it never answers for them. */
export function BulkDialog({ orgId, open, onClose, onAssign, busy }: { orgId: number; open: boolean; onClose: () => void; onAssign: (ids: number[]) => void; busy: boolean }) {
  const [rows, setRows] = useState<Opportunity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!open) return;
    let live = true;
    void fetchReady(orgId).then((r) => {
      if (!live) return;
      setRows(r);
      setFailed(r === null);
      setPicked(new Set((r ?? []).map((x) => x.id)));
    });
    return () => {
      live = false;
      setRows(null);
      setFailed(false);
    };
  }, [orgId, open]);
  const toggle = (id: number) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <SheetFrame id="opp-bulk" open={open} onClose={onClose} title="Bulk assign opportunities">
      <div data-opp-dialog="bulk" className="min-w-0">
        {failed ? (
          <p className="py-6 text-center text-[13.5px] text-muted">The ready opportunities couldn&apos;t be loaded.</p>
        ) : !rows ? (
          <div aria-busy="true" className="flex flex-col gap-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] text-muted">Nothing is ready to assign yet.</p>
        ) : (
          <>
            <p className="mb-2 text-[13px] text-muted">Each consultant is asked for their interest once assigned. Nothing is submitted for them.</p>
            <ul className="max-h-[50vh] overflow-y-auto">
              {rows.map((r) => (
                <li key={r.id} className="border-b border-line last:border-0">
                  <label className="flex cursor-pointer items-center gap-2.5 py-2 text-[13px]">
                    <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Assign ${r.jobTitle} to ${r.consultant.name}`} className="h-4 w-4 flex-none rounded border-line" />
                    <span className="min-w-0 flex-1 truncate"><b className="text-ink">{r.consultant.name}</b> <span className="text-ink-soft">{r.jobTitle}, {r.client}</span></span>
                    <MatchChip pct={r.matchScore} />
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={busy || picked.size === 0} onClick={() => onAssign([...picked])}>Assign {picked.size}</Button>
            </div>
          </>
        )}
      </div>
    </SheetFrame>
  );
}

/** Send Opportunity Notifications: ask everyone who has not answered. A request only. */
export function NotifyDialog({ open, count, onClose, onSend, busy }: { open: boolean; count: number; onClose: () => void; onSend: () => void; busy: boolean }) {
  return (
    <SheetFrame id="opp-notify" open={open} onClose={onClose} title="Send opportunity notifications">
      <div data-opp-dialog="notify" className="min-w-0">
        <p className="text-[13.5px] text-ink-soft">
          {count > 0
            ? `${count} assigned ${count === 1 ? "opportunity is" : "opportunities are"} waiting for the consultant's answer. Ask them for their interest now? They answer on their own workspace; consultants asked in the last 24 hours are skipped.`
            : "No assigned opportunity is waiting for a consultant's answer."}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || count === 0} onClick={onSend}>Send requests</Button>
        </div>
      </div>
    </SheetFrame>
  );
}
