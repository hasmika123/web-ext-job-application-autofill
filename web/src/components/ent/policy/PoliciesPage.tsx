"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ErrorState, Skeleton, Textarea, useToast } from "@kiwiply/ui";
import PolicyMarkdown from "@/components/ent/policy/PolicyMarkdown";
import {
  fetchPolicies,
  fetchPolicy,
  isLocked,
  saveDraft,
  startFromTemplate,
  STATE_LABEL,
  submitForReview,
  withdrawSubmission,
  type DetailResult,
  type PolicyDetail,
  type PolicyList,
  type PolicyState,
} from "@/lib/ent/policies";

/**
 * Policies (admin workspace, `/w/admin/policies`, needs org.settings.manage; docs/enterprise-v2/62). The organization's privacy policy, terms, acceptable-use
 * policy and support page: one editor per kind, a live preview, "Start from template", Save draft, Submit for review and (while it waits) Withdraw. A Kiwiply
 * reviewer approves before anything goes live (unless the platform switched review off); the reviewer's comment shows here. Until a policy is published the
 * organization's host shows the neutral template, so a legal link never 404s. The API is the gate; this page only draws what it answers.
 */
const tone = (s: PolicyState): "ready" | "review" | "default" => (s === "PUBLISHED" ? "ready" : s === "DRAFT" ? "default" : "review");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "");

export default function PoliciesPage({ orgId }: { orgId: number }) {
  const toast = useToast();
  const [list, setList] = useState<PolicyList | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [kind, setKind] = useState<string | null>(null);
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const adopt = useCallback((d: PolicyDetail) => {
    setDetail(d);
    setText(d.draftBody ?? "");
    setNote(null);
  }, []);

  const reloadList = useCallback(async () => {
    const r = await fetchPolicies(orgId);
    if (r.kind === "OK") {
      setList(r.list);
      setStatus("ready");
      setKind((k) => k ?? r.list.policies[0]?.kind ?? null);
    } else {
      setStatus(r.kind === "DENIED" ? "denied" : "failed");
    }
  }, [orgId]);

  useEffect(() => {
    const t = setTimeout(() => void reloadList(), 0);
    return () => clearTimeout(t);
  }, [reloadList]);

  useEffect(() => {
    if (!kind) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      void fetchPolicy(orgId, kind, ctl.signal).then((r) => {
        if (ctl.signal.aborted) return;
        if (r.kind === "OK") adopt(r.detail);
        else setNote("This policy didn't load. Please refresh.");
      });
    }, 0);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [orgId, kind, adopt]);

  /** Shows what an action answered; true when it succeeded (the detail is adopted and the list refreshed). */
  const settle = async (r: DetailResult, success: string): Promise<boolean> => {
    if (r.kind === "OK") {
      adopt(r.detail);
      toast({ title: success, variant: "success" });
      void reloadList();
      return true;
    }
    setNote(
      r.kind === "DEMO"
        ? "This is a shared demo account: policies are shown but can't be changed."
        : r.kind === "CONFLICT" || r.kind === "INVALID"
          ? r.message
          : r.kind === "DENIED"
            ? "You don't have access to change policies."
            : "That didn't work. Please try again.",
    );
    return false;
  };

  const run = async (go: () => Promise<DetailResult>, success: string) => {
    setBusy(true);
    setNote(null);
    await settle(await go(), success);
    setBusy(false);
  };

  if (status === "loading") {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (status === "denied") return <ErrorState what="policies" description="You don't have access to this page." />;
  if (status === "failed" || !list) return <ErrorState what="your policies" description="They didn't load. Nothing has changed." onRetry={() => void reloadList()} />;

  const locked = detail ? isLocked(detail.state) : false;
  const dirty = detail ? text !== (detail.draftBody ?? "") : false;
  const tooLong = detail ? text.length > detail.maxChars : false;
  const canSubmit = detail != null && !locked && !dirty && !tooLong && (detail.draftBody ?? "").trim() !== "" && detail.state !== "PUBLISHED";

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]" data-policies-page>
      <nav aria-label="Policies" className="flex flex-row gap-2 overflow-x-auto lg:flex-col">
        {list.policies.map((p) => (
          <button
            key={p.kind}
            type="button"
            onClick={() => setKind(p.kind)}
            aria-current={p.kind === kind ? "true" : undefined}
            className={`flex min-h-11 flex-none flex-col gap-1 rounded-xl border px-3 py-2 text-left ${p.kind === kind ? "border-accent bg-accent-soft" : "border-line bg-paper hover:bg-paper-2"}`}
          >
            <span className="text-[14px] font-semibold text-ink">{p.title}</span>
            <span className="flex items-center gap-2">
              <Badge variant={tone(p.state)}>{STATE_LABEL[p.state]}</Badge>
              {p.liveVersion ? <span className="text-[11.5px] text-muted">Live v{p.liveVersion}</span> : <span className="text-[11.5px] text-muted">Template shown</span>}
            </span>
          </button>
        ))}
      </nav>

      {detail ? (
        <section className="min-w-0 space-y-4" aria-label={detail.title}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-bold text-ink">{detail.title}</h2>
              <p className="text-[13px] text-muted">
                Public page: <span className="font-mono">{detail.path}</span> on your own address.{" "}
                {detail.requireReview ? "A Kiwiply reviewer approves it before it goes live." : "It goes live as soon as you submit it."}
              </p>
            </div>
            <Badge variant={tone(detail.state)} data-policy-state={detail.state}>{STATE_LABEL[detail.state]}</Badge>
          </div>

          {detail.state === "CHANGES_REQUESTED" && detail.reviewComment ? (
            <p role="status" className="rounded-xl border border-brown/40 bg-brown-soft px-4 py-3 text-[13.5px] text-brown-deep" data-policy-comment>
              <strong>Changes requested:</strong> {detail.reviewComment}
            </p>
          ) : null}
          {detail.state === "IN_REVIEW" ? (
            <p role="status" className="rounded-xl border border-line bg-paper-2 px-4 py-3 text-[13.5px] text-ink-soft">
              Waiting for review. You can&apos;t edit while it is in review; withdraw it to make changes.
            </p>
          ) : null}
          {note ? (
            <p role="alert" className="text-[13px] font-medium text-danger-text">
              {note}
            </p>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <label htmlFor="policy-text" className="mb-1 block text-[13px] font-semibold text-ink">
                Text (headings with #, lists with -, **bold**, [links](https://...))
              </label>
              <Textarea id="policy-text" rows={18} value={text} disabled={locked || busy} onChange={(e) => setText(e.target.value)} className="font-mono text-[13px]" />
              <p className={`mt-1 text-[12px] ${tooLong ? "text-danger-text" : "text-muted"}`}>
                {text.length.toLocaleString("en-US")} / {detail.maxChars.toLocaleString("en-US")} characters. No HTML, images or scripts.
              </p>
            </div>
            <div>
              <p className="mb-1 text-[13px] font-semibold text-ink">Preview</p>
              <div className="max-h-[28rem] overflow-auto rounded-xl border border-line bg-paper p-4" data-policy-preview>
                {text.trim() ? <PolicyMarkdown markdown={text} /> : <p className="text-[13.5px] text-muted">Nothing yet. Start from the template or write your own.</p>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="accent-soft" disabled={locked || busy} onClick={() => void run(() => startFromTemplate(orgId, detail.kind), "Template loaded into the draft")}>
              Start from template
            </Button>
            <Button type="button" variant="accent-soft" disabled={locked || busy || !dirty || tooLong || !text.trim()} onClick={() => void run(() => saveDraft(orgId, detail.kind, text, detail.draftVersion), "Draft saved")}>
              Save draft
            </Button>
            {locked ? (
              <Button type="button" variant="primary" disabled={busy} onClick={() => void run(() => withdrawSubmission(orgId, detail.kind), "Submission withdrawn")}>
                Withdraw from review
              </Button>
            ) : (
              <Button type="button" variant="primary" disabled={busy || !canSubmit} onClick={() => void run(() => submitForReview(orgId, detail.kind), detail.requireReview ? "Submitted for review" : "Published")}>
                {detail.requireReview ? "Submit for review" : "Publish"}
              </Button>
            )}
            {dirty ? <span className="text-[12.5px] text-muted">Unsaved changes: save the draft before submitting.</span> : null}
          </div>

          {detail.versions.length > 0 ? (
            <div>
              <h3 className="mb-2 text-[14px] font-bold text-ink">History</h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-paper text-[13px]" data-policy-history>
                {detail.versions.map((v) => (
                  <li key={v.versionNo} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="font-semibold text-ink">Version {v.versionNo}</span>
                    <span className="text-muted">{v.status.replace("_", " ").toLowerCase()}{v.submittedAt ? ` · submitted ${when(v.submittedAt)}` : ""}</span>
                    {v.reviewComment ? <span className="basis-full text-ink-soft">Reviewer: {v.reviewComment}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : (
        <Skeleton className="h-72 w-full" />
      )}
    </div>
  );
}
