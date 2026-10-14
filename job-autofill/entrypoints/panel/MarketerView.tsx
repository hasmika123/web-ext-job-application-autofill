/**
 * Marketer view — the ONLY thing the drawer offers in an org workspace where the member is a
 * marketer and not a consultant (docs/enterprise-v2/60 §6): "Save for consultant…".
 *
 * Reads the job on the page, shows the TRIMMED capture (no job description — it never leaves the
 * page's own tab), and sends it with the marketer's note to the consultants they pick.
 *
 * Deliberately absent: the resume picker, Scan & fill, auto-advance, save-to-board, the mirror
 * refresh and every profile/bio/resume/answers read. This file imports only `capturePage` from
 * home-actions (a read of the open tab) — `workspace_modes.test.js` fails if that ever grows.
 * No submit surface of any kind: saving here hands a job to a consultant, who applies themselves.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Field, Input, Select, Skeleton, Spinner, Textarea, useToast } from "@kiwiply/ui";
import { capturePage } from "./home-actions";
import { marketerFacadeFor, type ConsultantOption } from "./workspace-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const JAF = () => window.JAF;
const KEY_INFO_MAX = 1000;

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; trimmed: Record<string, any> };

export function MarketerView({ orgId, orgName }: { orgId: number; orgName: string }) {
  const toast = useToast();
  const [page, setPage] = useState<Loaded>({ status: "loading" });
  const [consultants, setConsultants] = useState<ConsultantOption[] | null>(null);
  const [consultantsError, setConsultantsError] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [keyInfo, setKeyInfo] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueOn, setDueOn] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<{ variant: string; title: string; description: string } | null>(null);
  const facade = useRef<any>(null);
  // One Idempotency-Key per distinct body: a retry of the same save reuses it (no duplicate),
  // an edited form is a new save and gets a fresh one.
  const keyRef = useRef<{ body: string; key: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cap = await capturePage();
      if (!alive) return;
      if (!cap.ok) return setPage({ status: "error", message: cap.error });
      // Trim immediately: the description is dropped before anything is held in state.
      const trimmed = JAF().workspace.trimCapture(cap.capture);
      setTitle(trimmed.title || "");
      setCompany(trimmed.company || "");
      setLocation(trimmed.location || "");
      setPage({ status: "ready", trimmed });
    })();
    (async () => {
      const f = await marketerFacadeFor(orgId);
      if (!alive) return;
      facade.current = f;
      if (!f) return setConsultantsError("Connect the extension on kiwiply.com first.");
      try {
        setConsultants(await f.listConsultants());
      } catch {
        setConsultantsError("Couldn't load your consultants. Close and reopen the drawer to retry.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  const names = useMemo(() => Object.fromEntries((consultants || []).map((c) => [c.id, c.name])), [consultants]);
  const trimmed = page.status === "ready" ? page.trimmed : null;
  const needsCompany = trimmed ? !trimmed.company : false;

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function onSave() {
    if (!trimmed || !facade.current) return;
    const form = { title, company, location, keyInfo, priority, dueOn: dueOn || undefined, consultantIds: picked, names };
    const body = JAF().workspace.buildSavePayload(trimmed, form);
    const probs: string[] = JAF().workspace.validateSave(body);
    setProblems(probs);
    if (probs.length) return;
    const sig = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.body !== sig) keyRef.current = { body: sig, key: JAF().workspace.newIdempotencyKey() };
    setBusy(true);
    try {
      const r = await JAF().workspace.marketerSave(facade.current, trimmed, form, keyRef.current.key);
      if (!r.ok) {
        setProblems(r.problems);
      } else {
        setOutcome(r.summary);
        toast({ variant: r.summary.variant === "success" ? "success" : "error", title: r.summary.title, description: r.summary.description });
      }
    } catch (e) {
      const message = JAF().workspace.describeSaveError(e);
      setProblems([message]);
      toast({ variant: "error", title: "Couldn’t save this job", description: message });
    } finally {
      setBusy(false);
    }
  }

  if (outcome) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <div className="rounded-[var(--radius)] border border-line bg-paper p-3.5">
          <div className="text-[13.5px] font-semibold text-ink">{outcome.title}</div>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-soft">{outcome.description}</p>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => setOutcome(null)}>
          Back to the form
        </Button>
      </div>
    );
  }

  if (page.status === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Reading this job">
        <Skeleton className="h-11 w-full rounded-[var(--radius)]" />
        <Skeleton className="h-11 w-full rounded-[var(--radius)]" />
        <Skeleton className="h-24 w-full rounded-[var(--radius)]" />
      </div>
    );
  }
  if (page.status === "error") {
    return <p role="alert" className="text-[12.5px] font-medium text-danger-text">{page.message}</p>;
  }

  const t = page.trimmed;
  const facts = [t.workMode, t.employmentType, t.payLabel, t.atsPlatform].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.1em] text-accent-deep">{orgName}</div>
        <h1 className="mt-1 font-display text-[19px] font-semibold leading-tight text-ink">Save for consultant</h1>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">
          Sends the job’s key facts and your note. Your consultant reads the full posting on the site and applies themselves.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-line bg-paper p-3">
        <Field label="Job title" required>
          <Input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="Company"
          required
          hint={needsCompany ? "We couldn’t tell the employer from this page. Type it." : undefined}
        >
          <Input value={company} maxLength={200} onChange={(e) => setCompany(e.target.value)} placeholder="Employer name" />
        </Field>
        <Field label="Location">
          <Input value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        {facts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <Badge key={f} variant="review">
                {f}
              </Badge>
            ))}
          </div>
        )}
        <div className="truncate text-[11px] text-muted" title={t.jobUrl}>
          {t.jobUrl}
        </div>
      </div>

      <Field label="Note for the consultant" required hint={`${keyInfo.length}/${KEY_INFO_MAX} · why it fits, what to emphasise, deadline`}>
        <Textarea
          value={keyInfo}
          maxLength={KEY_INFO_MAX}
          rows={4}
          onChange={(e) => setKeyInfo(e.target.value)}
          placeholder="Why this fits, what to emphasise…"
        />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[12.5px] font-semibold text-ink-soft">Consultants</legend>
        {consultants === null && !consultantsError && (
          <span className="flex items-center gap-2 text-[12px] text-muted">
            <Spinner /> Loading…
          </span>
        )}
        {consultantsError && <p className="text-[12px] text-danger-text">{consultantsError}</p>}
        {consultants && !consultants.length && <p className="text-[12px] text-muted">No consultants are assigned to you yet.</p>}
        {(consultants || []).map((c) => (
          <label key={c.id} className="flex min-h-[44px] items-center gap-2.5 rounded-[var(--radius)] border border-line bg-paper px-3 text-[13px] text-ink">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <Select value={priority} onChange={setPriority}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </Select>
        </Field>
        <Field label="Due">
          <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </Field>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="list-disc pl-4 text-[12.5px] font-medium text-danger-text">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <Button variant="accent" className="w-full" disabled={busy || !consultants} onClick={onSave}>
        {busy ? <Spinner className="text-on-accent" /> : null}
        Save for consultant
      </Button>
    </div>
  );
}
