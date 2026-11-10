"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, EmptyState, ErrorState, Spinner } from "@kiwiply/ui";
import { errorSentence, formatDate, membersApi, relativeTime, type ActivityItem, type MemberDetail } from "@/lib/ent/members";

/** "MEMBER_SUSPEND" -> "Member suspend"; the API's own summary line leads when it has one. */
export function actionLabel(a: string): string {
  const w = a.toLowerCase().split("_").join(" ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}

type Dir = "on" | "by";

/** The paged audit feed of one person: what happened to them (on) or what they did (by). */
export default function ActivityTab({ orgId, detail }: { orgId: number | string; detail: MemberDetail }) {
  const [dir, setDir] = useState<Dir>("on");
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const seq = useRef(0);

  const load = useCallback(
    async (d: Dir, p: number) => {
      const mine = ++seq.current;
      if (p === 0) setState("loading");
      const r = await membersApi.activity(orgId, detail.id, d, p);
      if (mine !== seq.current) return;
      if (!r.ok) {
        setError(errorSentence(r));
        setState("error");
        return;
      }
      setItems((cur) => (p === 0 ? r.data.items : [...cur, ...r.data.items]));
      setPage(p);
      setHasNext(r.data.hasNext);
      setState("ok");
    },
    [orgId, detail.id],
  );

  useEffect(() => {
    if (detail.actions.viewActivity) void load(dir, 0);
  }, [dir, load, detail.actions.viewActivity]);

  if (!detail.actions.viewActivity) {
    return <p data-tab-panel="activity" className="rounded-lg bg-paper-2 p-3 text-[13px] text-ink-soft">The activity log is not part of your access.</p>;
  }

  return (
    <div data-tab-panel="activity" className="space-y-3">
      <div role="group" aria-label="Activity direction" className="inline-flex rounded-full border border-line p-0.5 text-[12.5px] font-semibold">
        {(["on", "by"] as const).map((d) => (
          <button key={d} type="button" aria-pressed={dir === d} onClick={() => setDir(d)} className={`rounded-full px-3 py-1 ${dir === d ? "bg-accent text-on-accent" : "text-ink-soft hover:text-ink"}`}>
            {d === "on" ? "About them" : "Done by them"}
          </button>
        ))}
      </div>
      {state === "loading" && (
        <div role="status" className="flex items-center gap-2 py-6 text-[13px] text-ink-soft">
          <Spinner /> Loading activity{"…"}
        </div>
      )}
      {state === "error" && <ErrorState variant="inline" what="the activity" description={error} onRetry={() => void load(dir, 0)} />}
      {state === "ok" && items.length === 0 && <EmptyState variant="inline" title="No activity yet" description={dir === "on" ? "Changes to this person show up here." : "Nothing done by this person has been recorded."} />}
      {state === "ok" && items.length > 0 && (
        <ol className="divide-y divide-line/60" data-activity-list>
          {items.map((a) => (
            <li key={a.id} className="py-2.5 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-ink">{a.summary ?? actionLabel(a.action)}</span>
                <time dateTime={a.at} title={`${formatDate(a.at)}`} suppressHydrationWarning className="flex-none text-[12px] text-muted">
                  {relativeTime(a.at)}
                </time>
              </div>
              <p className="text-[12px] text-muted">
                {a.actor ? `by ${a.actor.name}` : "by the system"}
                {a.risk && a.risk !== "LOW" ? ` · ${a.risk.toLowerCase()} risk` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      {state === "ok" && hasNext && (
        <Button type="button" variant="ghost" size="sm" onClick={() => void load(dir, page + 1)}>
          Load more
        </Button>
      )}
    </div>
  );
}
