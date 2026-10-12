"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, ChoiceGroup, SideSheet, Spinner, cn } from "@kiwiply/ui";
import { formatDate, timeAgo } from "@/lib/dates";
import { listVersions, versionLabel, type ResumeVersion } from "@/lib/resume-meta";
import { useDateDisplay } from "@/lib/use-date-display";
import { actorText, versionKindChip } from "./headerBar";

// config-literal-ok: side-sheet width is layout geometry (DESIGN 10.16), not a tunable
const SHEET_WIDTH = 520;

type Filter = "all" | "named" | "auto";
const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "named", label: "Named" },
  { value: "auto", label: "Automatic" },
];

/** Named = the versions the person made on purpose (named or saved); Automatic = everything the editor wrote itself. */
const matches = (v: ResumeVersion, f: Filter) => f === "all" || (f === "named" ? v.kind === "named" || v.kind === "checkpoint" : v.kind === "auto" || v.kind === "system");

/**
 * All versions (DESIGN 10.16): the full history of the resume, newest first, filterable to the ones the person named
 * and the ones the editor kept, with Compare and Restore on every row and the retention rule stated in words. The rule's
 * number is the admin setting (`config.versions.retentionAuto`), never typed here. `reloadKey` makes the sheet fetch again
 * (the header bumps it after a restore or a new version).
 */
export default function VersionsSheet({
  open,
  resumeId,
  ownerLogin,
  retentionAuto,
  phone,
  reloadKey,
  onCompare,
  onRestore,
  onClose,
}: {
  open: boolean;
  resumeId: number;
  ownerLogin: string | null;
  retentionAuto: number;
  phone: boolean;
  reloadKey: number;
  onCompare: (v: ResumeVersion) => void;
  onRestore: (v: ResumeVersion) => void;
  onClose: () => void;
}) {
  const display = useDateDisplay();
  const [filter, setFilter] = useState<Filter>("all");
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: ResumeVersion[] }>({ status: "loading" });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Loading is this effect's whole job: the state resets to "loading" each time the sheet opens or reloads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    void listVersions(resumeId).then((res) => {
      if (cancelled) return;
      setNow(Date.now());
      setState(res.kind === "ok" ? { status: "ready", rows: res.value } : { status: "error", message: res.message });
    });
    return () => {
      cancelled = true;
    };
  }, [open, resumeId, reloadKey]);

  const rows = useMemo(() => (state.status === "ready" ? state.rows.filter((v) => matches(v, filter)) : []), [state, filter]);

  return (
    <SideSheet
      id="rb-versions-sheet"
      side="right"
      mode={phone ? "fullscreen" : "overlay"}
      open={open}
      width={SHEET_WIDTH}
      title="All versions"
      description="Every saved state of this resume"
      onClose={onClose}
    >
      <ChoiceGroup aria-label="Show versions" className="mb-3" options={[...FILTERS]} value={filter} onChange={(v) => setFilter(v as Filter)} />
      {state.status === "loading" && (
        <p role="status" className="flex items-center gap-2 py-6 text-[13.5px] text-ink-soft">
          <Spinner role="presentation" aria-hidden className="h-4 w-4" />
          Loading versions…
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="py-6 text-[13.5px] text-danger">
          {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.length === 0 && <li className="p-4 text-[13.5px] text-ink-soft">{filter === "named" ? "No named versions yet. Use Save as version… to keep one." : "No versions here."}</li>}
          {rows.map((v) => {
            const chip = versionKindChip(v);
            return (
              <li key={v.versionNo} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[13.5px] font-semibold text-ink">
                    <span>v{v.versionNo}</span>
                    <span className="truncate font-medium">{versionLabel(v)}</span>
                    {chip && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-deep">{chip}</span>}
                  </p>
                  <p className="text-[12.5px] text-muted" title={formatDate(v.createdAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }, display)}>
                    <span suppressHydrationWarning>{timeAgo(v.createdAt, now, display)}</span> · {actorText(v.by, ownerLogin)}
                  </p>
                </div>
                <div className={cn("flex flex-none items-center gap-2")}>
                  <Button variant="ghost" size="sm" onClick={() => onCompare(v)} aria-label={`Compare v${v.versionNo}`}>
                    Compare
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRestore(v)} aria-label={`Restore v${v.versionNo}`}>
                    Restore
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        Keeps the last {retentionAuto} automatic versions and every named one. Restoring saves your current content as a new version first, so nothing is lost.
      </p>
    </SideSheet>
  );
}
