"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, ErrorState, InboxIcon, Skeleton, cn, inputClass } from "@kiwiply/ui";
import LocalDate from "@/components/LocalDate";
import { statusLabel as defaultStatusLabel } from "@/lib/applications";
import {
  acceptReview,
  dismissReview,
  fetchReview,
  isSure,
  reviewSentence,
  type ReviewEndpoints,
  type ReviewItem,
} from "@/lib/inbox-review";

/**
 * "Needs your review": the mail the inbox read but was not sure enough to apply by itself. Each row is one sentence in plain words and two
 * buttons. Nothing changes on an application until the person presses Accept; "Not this one" hides the row and changes nothing.
 *
 * One component for the personal Inbox page and the consultant workspace Inbox page: the caller passes the routes, and `workspace` switches
 * the wording ("this workspace" instead of the product name). Nothing here links anywhere.
 */
export interface NeedsReviewCardProps {
  endpoints: ReviewEndpoints;
  /** Enterprise wording ("this workspace"), never the product name. */
  workspace?: boolean;
  /** A status code as this surface words it (the personal board and a workspace stage name differ). */
  statusLabel?: (status: string) => string;
  /** After an accept or a dismiss changed something the page also shows. */
  onChanged?: () => void;
}

type Load = { kind: "loading" } | { kind: "failed" } | { kind: "denied" } | { kind: "ok"; items: ReviewItem[] };

const keyOf = (i: ReviewItem) => String(i.id);
const WHEN = { month: "short", day: "numeric" } as const;

function ReviewRow({
  item,
  busy,
  statusLabel,
  onAccept,
  onDismiss,
}: {
  item: ReviewItem;
  busy: boolean;
  statusLabel?: (s: string) => string;
  onAccept: (item: ReviewItem, applicationId?: number | string) => void;
  onDismiss: (item: ReviewItem) => void;
}) {
  const needsChoice = item.applicationId === null && item.candidates.length > 0;
  const [picked, setPicked] = useState(item.candidates.length === 1 ? String(item.candidates[0].applicationId) : "");
  const selectId = `review-pick-${keyOf(item)}`;
  const canAccept = !busy && (!needsChoice || picked !== "");

  function accept() {
    if (needsChoice) {
      const c = item.candidates.find((x) => String(x.applicationId) === picked);
      if (c) onAccept(item, c.applicationId);
      return;
    }
    onAccept(item);
  }

  return (
    <li data-review-item={keyOf(item)} data-kind={item.kind} className="flex flex-col gap-3 border-t border-line py-3.5 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-snug text-ink">{reviewSentence(item, statusLabel ?? defaultStatusLabel)}</p>
        {item.evidence ? <p className="mt-1 break-words text-[12.5px] leading-snug text-muted">{item.evidence}</p> : null}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          {!isSure(item) ? (
            <Badge variant="review" data-not-sure>
              Not sure
            </Badge>
          ) : null}
          {item.createdAt ? (
            <span>
              Mail from <LocalDate iso={item.createdAt} options={WHEN} />
            </span>
          ) : null}
        </p>
        {needsChoice ? (
          <div className="mt-2.5">
            <label htmlFor={selectId} className="mb-1 block text-[12.5px] font-semibold text-ink-soft">
              Which application is it?
            </label>
            <select id={selectId} value={picked} onChange={(e) => setPicked(e.target.value)} disabled={busy} className={cn(inputClass, "min-h-10 w-full sm:max-w-sm")}>
              <option value="">Choose one</option>
              {item.candidates.map((c) => (
                <option key={String(c.applicationId)} value={String(c.applicationId)}>
                  {[c.company, c.role].filter(Boolean).join(" - ") || "Application"}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="flex flex-none gap-2 max-sm:w-full">
        <Button type="button" size="sm" variant="accent" data-action="accept" disabled={!canAccept} onClick={accept} className="min-h-10 max-sm:flex-1">
          Accept
        </Button>
        <Button type="button" size="sm" variant="ghost" data-action="dismiss" disabled={busy} onClick={() => onDismiss(item)} className="min-h-10 max-sm:flex-1">
          Not this one
        </Button>
      </div>
    </li>
  );
}

export default function NeedsReviewCard({ endpoints, workspace = false, statusLabel, onChanged }: NeedsReviewCardProps) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const r = await fetchReview(endpoints);
    if (!alive.current) return;
    setLoad(r.kind === "ok" ? { kind: "ok", items: r.data.items } : { kind: r.kind });
  }, [endpoints]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  async function accept(item: ReviewItem, applicationId?: number | string) {
    setBusy(true);
    setNote(null);
    const r = await acceptReview(endpoints, item.id, applicationId);
    if (!alive.current) return;
    setBusy(false);
    if (r.ok) {
      setNote({ tone: "ok", text: r.status ? `Done. The application is now ${(statusLabel ?? defaultStatusLabel)(r.status)}. You can undo it from its history.` : "Done." });
      onChanged?.();
    } else {
      setNote({ tone: "error", text: r.message });
    }
    await reload();
  }

  async function dismiss(item: ReviewItem) {
    setBusy(true);
    setNote(null);
    const r = await dismissReview(endpoints, item.id);
    if (!alive.current) return;
    setBusy(false);
    if (r.ok) {
      setNote({ tone: "ok", text: "Left as it was." });
      onChanged?.();
    } else {
      setNote({ tone: "error", text: r.message });
    }
    await reload();
  }

  if (load.kind === "denied") return null;

  const items = load.kind === "ok" ? load.items : [];
  const who = workspace ? "this workspace" : "Kiwiply";

  return (
    <section data-needs-review data-state={load.kind} aria-labelledby="needs-review-title" className="rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-soft text-accent-deep">
          <InboxIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="needs-review-title" className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
            Needs your review
            {load.kind === "ok" && items.length > 0 ? (
              <Badge variant="review" data-review-count>
                {items.length}
              </Badge>
            ) : null}
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
            When an email is not clear enough, {who} asks you first instead of changing an application. Nothing changes until you press Accept.
          </p>
        </div>
      </header>

      {note ? (
        <p role="status" data-review-note={note.tone} className={cn("mt-3 text-[13px] font-medium", note.tone === "error" ? "text-danger-text" : "text-ink-soft")}>
          {note.text}
        </p>
      ) : null}

      <div className="mt-2">
        {load.kind === "loading" ? (
          <div aria-busy="true" className="grid gap-2 pt-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : load.kind === "failed" ? (
          <ErrorState what="your review list" description="It didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" />
        ) : items.length === 0 ? (
          <p data-review-empty className="py-4 text-[13.5px] text-muted">
            Nothing needs your review
          </p>
        ) : (
          <ul data-review-list>
            {items.map((i) => (
              <ReviewRow key={keyOf(i)} item={i} busy={busy} statusLabel={statusLabel} onAccept={(it, a) => void accept(it, a)} onDismiss={(it) => void dismiss(it)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
