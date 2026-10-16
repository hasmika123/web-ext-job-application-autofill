"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Textarea } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import { diffLines, diffStats } from "@/lib/policy-diff";
import { AdminHero, AdminPanel } from "../common";

export interface QueueRow {
  id: number;
  orgId: number;
  orgName: string;
  kind: string;
  title: string;
  versionNo: number;
  status: string;
  submittedAt: string;
  hasLive: boolean;
}

export interface ReviewDetail {
  id: number;
  orgId: number;
  orgName: string;
  kind: string;
  title: string;
  versionNo: number;
  status: string;
  submittedAt: string;
  proposedBody: string;
  liveBody?: string | null;
  liveVersion?: number | null;
  reviewComment?: string | null;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Policy reviews (docs/enterprise-v2/62): the policies organizations submitted to publish on their own address. The reviewer compares the proposed
 * text with what is live (a line diff), then approves (it goes live) or sends it back with a comment the organization sees. Platform admin only; the
 * API enforces ROLE_ADMIN, this page only draws what it answers.
 */
export default function PolicyReviewsPage() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const r = await adminFetch<QueueRow[]>("GET", "/org-policies?status=IN_REVIEW");
    if (r.ok) {
      setRows(Array.isArray(r.data) ? r.data : []);
      setError(null);
    } else {
      setError(r.error);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadQueue(), 0);
    return () => clearTimeout(t);
  }, [loadQueue]);

  useEffect(() => {
    if (selected == null) return;
    let live = true;
    const t = setTimeout(() => {
      void adminFetch<ReviewDetail>("GET", `/org-policies/${selected}`).then((r) => {
        if (!live) return;
        if (r.ok) {
          setDetail(r.data);
          setComment("");
          setResult(null);
        } else setError(r.error);
      });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [selected]);

  const decide = async (action: "approve" | "request-changes") => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    const r = await adminFetch<ReviewDetail>("POST", `/org-policies/${detail.id}/${action}`, { comment });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResult(action === "approve" ? `${detail.title} for ${detail.orgName} is published.` : `Sent back to ${detail.orgName} with your comment.`);
    setDetail(null);
    setSelected(null);
    void loadQueue();
  };

  const lines = detail ? diffLines(detail.liveBody, detail.proposedBody) : [];
  const stats = diffStats(lines);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <AdminHero title="Policy reviews" subtitle="Organizations write their own privacy policy, terms and support page. Approve what is ready, or send it back with a note." />
      {result ? <p role="status" className="rounded-xl border border-line bg-paper px-4 py-3 text-[13.5px] text-ink">{result}</p> : null}
      {error ? <p role="alert" className="text-[13px] font-medium text-danger-text">{error}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <AdminPanel title="Waiting for review" description={rows ? `${rows.length} submitted` : "Loading"}>
          {rows && rows.length === 0 ? <p className="text-[13.5px] text-muted" data-queue-empty>Nothing is waiting.</p> : null}
          <ul className="space-y-2" data-review-queue>
            {(rows ?? []).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelected(r.id)}
                  aria-current={selected === r.id ? "true" : undefined}
                  className={`flex min-h-11 w-full flex-col gap-0.5 rounded-xl border px-3 py-2 text-left ${selected === r.id ? "border-accent bg-accent-soft" : "border-line bg-paper hover:bg-paper-2"}`}
                >
                  <span className="text-[14px] font-semibold text-ink">{r.orgName}</span>
                  <span className="text-[12.5px] text-ink-soft">
                    {r.title} · v{r.versionNo} · {r.hasLive ? "update" : "first publication"}
                  </span>
                  <span className="text-[11.5px] text-muted">{when(r.submittedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </AdminPanel>

        <AdminPanel title={detail ? `${detail.orgName}: ${detail.title}` : "Select a submission"} description={detail ? `Version ${detail.versionNo} · submitted ${when(detail.submittedAt)}` : undefined}>
          {detail ? (
            <div className="space-y-4" data-review-detail>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="review">{detail.liveBody ? `Changes against v${detail.liveVersion}` : "First publication"}</Badge>
                {detail.liveBody ? <span className="text-[12.5px] text-muted">+{stats.added} lines, -{stats.removed} lines</span> : null}
              </div>
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-3 font-mono text-[12.5px] leading-relaxed" aria-label="Proposed text compared with the live text" data-review-diff>
                {lines.map((l, i) => (
                  <span key={i} className={`block ${l.kind === "added" ? "bg-accent-soft text-accent-deep" : l.kind === "removed" ? "bg-brown-soft text-brown-deep line-through" : "text-ink-soft"}`} data-diff={l.kind}>
                    {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
                    {l.text}
                  </span>
                ))}
              </pre>
              <div>
                <label htmlFor="review-comment" className="mb-1 block text-[13px] font-semibold text-ink">
                  Note to the organization (required when you send it back)
                </label>
                <Textarea id="review-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="primary" disabled={busy} onClick={() => void decide("approve")}>
                  Approve and publish
                </Button>
                <Button type="button" variant="accent-soft" disabled={busy || comment.trim() === ""} onClick={() => void decide("request-changes")}>
                  Request changes
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[13.5px] text-muted">Pick a submission on the left to read it and compare it with the live text.</p>
          )}
        </AdminPanel>
      </div>
    </div>
  );
}
