"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { SideSheet, Spinner } from "@kiwiply/ui";
import { formatDate, timeAgo } from "@/lib/dates";
import { getViews, type ResumeView } from "@/lib/resume-meta";
import { useDateDisplay } from "@/lib/use-date-display";
import { viewWhat } from "./headerBar";

// config-literal-ok: side-sheet width is layout geometry (DESIGN 10.12), not a tunable
const SHEET_WIDTH = 480;

/** How many rows "See all" asks for (the API's own default page; 1-200 allowed). */
const PAGE = 50;

const KIND_LABEL: Record<ResumeView["viewerKind"], string> = { ORG: "Organization", USER: "Kiwiply account", LINK: "Share link" };

/**
 * "See all" of the Activity line in Resume settings (DESIGN 10.12): who opened the resume, newest first - the label the
 * API resolved ("Rahul (your marketer)", an email, "Link: Sent to recruiter"), what they opened and when. The owner's own
 * views are never recorded. Reads `GET …/views` each time it opens. Rendered through a portal by its caller, because the
 * settings sheet it opens from is a transformed element.
 */
export default function ViewsSheet({
  open,
  resumeId,
  phone,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  resumeId: number;
  phone: boolean;
  onClose: () => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const display = useDateDisplay();
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: ResumeView[]; now: number }>({ status: "loading" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Loading is this effect's whole job: the state resets to "loading" each time the sheet opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    void getViews(resumeId, PAGE).then((res) => {
      if (cancelled) return;
      setState(res.kind === "ok" ? { status: "ready", rows: res.value, now: Date.now() } : { status: "error", message: res.message });
    });
    return () => {
      cancelled = true;
    };
  }, [open, resumeId]);

  // This sheet opens on top of the settings sheet: Esc closes only this one (the settings sheet listens on `document`).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <SideSheet
      id="rb-views-sheet"
      side="right"
      mode={phone ? "fullscreen" : "overlay"}
      open={open}
      width={SHEET_WIDTH}
      title="Who viewed this resume"
      description="Newest first. Your own views are not counted."
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      {state.status === "loading" && (
        <p role="status" className="flex items-center gap-2 py-6 text-[13.5px] text-ink-soft">
          <Spinner role="presentation" aria-hidden className="h-4 w-4" />
          Loading views…
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="py-6 text-[13.5px] text-danger-text">
          {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {state.rows.length === 0 && <li className="p-4 text-[13.5px] text-ink-soft">Nobody has opened this resume yet.</li>}
          {state.rows.map((v, i) => (
            <li key={`${v.viewedAt}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">{v.viewerLabel}</p>
                <p className="text-[12.5px] text-muted">
                  {KIND_LABEL[v.viewerKind] ?? v.viewerKind} · {viewWhat(v.what)}
                </p>
              </div>
              <p className="flex-none text-[12.5px] text-muted" title={formatDate(v.viewedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }, display)}>
                <span suppressHydrationWarning>{timeAgo(v.viewedAt, state.now, display)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </SideSheet>
  );
}
