"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { EmptyState, ErrorState, SideSheet, Spinner } from "@kiwiply/ui";
import { aiFetch } from "@/lib/ai-admin";
import type { AiHistoryRow } from "@/lib/ai-admin";
import { useNarrow } from "./useNarrow";

const LIMIT = 50; // config-literal-ok: the API's default history page (it clamps 1..200)
const WIDTH = 520; // config-literal-ok: drawer width in px (the SideSheet default for a right drawer)

const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false };

/** "ai.route.parse.model" reads better as "route · parse · model". */
function keyLabel(key: string): string {
  return key.replace(/^ai\./, "").split(".").join(" · ");
}

/** Values are short settings (a model id, true / false, a JSON list); long ones are cut so a row stays a row. */
function shortValue(v: string | null): string {
  if (v === null || v === "") return "none";
  return v.length > 80 ? `${v.slice(0, 77)}…` : v; // config-literal-ok: characters shown before a value is cut
}

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; rows: AiHistoryRow[] };

/** Mounted only while the drawer is open, so every opening reads the newest changes. */
function HistoryBody() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void aiFetch<AiHistoryRow[]>("GET", `/config/history?limit=${LIMIT}`).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { status: "ok", rows: res.data } : { status: "error", message: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-soft">
        <Spinner /> Loading changes…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <ErrorState
        variant="inline"
        what="the change history"
        description={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (state.rows.length === 0) return <EmptyState variant="inline" title="No changes yet." description="Every change to AI settings shows up here with who made it and why." />;
  return (
    <ol className="divide-y divide-v2-line/60">
      {state.rows.map((h) => (
        <li key={h.id} className="py-3 text-[13px]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="break-all font-semibold text-ink">{keyLabel(h.key)}</span>
            <time dateTime={h.changedAt} suppressHydrationWarning className="text-[12px] tabular-nums text-v2-muted">
              {new Date(h.changedAt).toLocaleString("en-US", WHEN)}
            </time>
          </div>
          <p className="mt-0.5 break-words text-ink-soft">
            <span className="text-v2-muted">{shortValue(h.oldValue)}</span> → <span className="font-medium text-ink">{shortValue(h.newValue)}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-v2-muted">
            by {h.actorLogin ?? "system"}
            {h.reason ? ` · “${h.reason}”` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** The change history of the AI settings (who, what, why), newest first: a drawer on a desktop, full screen on a phone. */
export default function HistoryDrawer({ open, onClose, returnFocusTo }: { open: boolean; onClose: () => void; returnFocusTo?: RefObject<HTMLElement | null> }) {
  const narrow = useNarrow();
  return (
    <SideSheet
      id="ai-history-drawer"
      side="right"
      mode={narrow ? "fullscreen" : "overlay"}
      width={WIDTH}
      open={open}
      onClose={onClose}
      title="Change history"
      description="Who changed which AI setting, and why."
      returnFocusTo={returnFocusTo}
    >
      {open && <HistoryBody />}
    </SideSheet>
  );
}
