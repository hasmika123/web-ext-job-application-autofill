"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, DiffText, SideSheet, Spinner, UndoIcon } from "@kiwiply/ui";
import { diffWords, sameWords } from "@/lib/diff";
import { exportText } from "@/lib/resume-doc";
import { getVersionText, versionLabel, type ResumeVersion } from "@/lib/resume-meta";

// config-literal-ok: side-sheet width is layout geometry (DESIGN 10.16), not a tunable
const SHEET_WIDTH = 640;

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; before: string; after: string };

/**
 * Compare (DESIGN 10.16, DECISIONS #19): one version's ATS text against the saved document as it is now, as a word
 * diff (`DiffText`: removed words struck, added words underlined). Read-only; the one action is "Restore this version"
 * (the header confirms it and does the restore). The right sheet is a dialog above the editor, a fullscreen one on a phone.
 */
export default function VersionCompareSheet({
  open,
  resumeId,
  version,
  phone,
  ensureSaved,
  onRestore,
  onClose,
}: {
  open: boolean;
  resumeId: number;
  version: ResumeVersion | null;
  phone: boolean;
  /** Saves pending edits so "now" is what the user sees; false when that failed (the compare is refused). Must be stable (memoised). */
  ensureSaved: () => Promise<boolean>;
  onRestore: (version: ResumeVersion) => void;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const versionNo = version?.versionNo ?? null;

  useEffect(() => {
    if (!open || versionNo === null) return;
    let cancelled = false;
    // Loading is this effect's whole job: the state starts "loading" and is reset for each version opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded({ status: "loading" });
    void (async () => {
      if (!(await ensureSaved())) {
        if (!cancelled) setLoaded({ status: "error", message: "Your latest changes aren't saved yet, so there is nothing to compare. Try again in a moment." });
        return;
      }
      const [old, now] = await Promise.all([getVersionText(resumeId, versionNo), exportText(resumeId)]);
      if (cancelled) return;
      if (old.kind === "error") return setLoaded({ status: "error", message: old.message });
      if (now.kind === "error") return setLoaded({ status: "error", message: now.message });
      setLoaded({ status: "ready", before: old.value, after: await now.blob.text() });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, resumeId, versionNo, ensureSaved]);

  const parts = useMemo(() => (loaded.status === "ready" ? diffWords(loaded.before, loaded.after) : []), [loaded]);
  const identical = loaded.status === "ready" && sameWords(loaded.before, loaded.after);
  const name = version ? `v${version.versionNo} · ${versionLabel(version)}` : "";

  return (
    <SideSheet
      id="rb-compare-sheet"
      side="right"
      mode={phone ? "fullscreen" : "overlay"}
      open={open && version !== null}
      width={SHEET_WIDTH}
      title="Compare versions"
      description={version ? `${name} against your resume now` : undefined}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="accent"
            size="sm"
            disabled={!version || loaded.status !== "ready" || identical}
            onClick={() => version && onRestore(version)}
            title={identical ? "This version already matches your resume" : undefined}
            className="gap-2"
          >
            <UndoIcon className="h-4 w-4" />
            Restore this version
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {loaded.status === "loading" && (
        <p role="status" className="flex items-center gap-2 py-6 text-[13.5px] text-ink-soft">
          <Spinner role="presentation" aria-hidden className="h-4 w-4" />
          Comparing…
        </p>
      )}
      {loaded.status === "error" && (
        <p role="alert" className="py-6 text-[13.5px] text-danger-text">
          {loaded.message}
        </p>
      )}
      {loaded.status === "ready" && (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
            <span>
              <del className="rounded-sm bg-[color-mix(in_srgb,var(--color-danger)_16%,transparent)] px-1 line-through">Removed</del> since {name}
            </span>
            <span>
              <ins className="rounded-sm bg-[color-mix(in_srgb,var(--color-ok)_18%,transparent)] px-1 underline decoration-ok/60">Added</ins> in your resume now
            </span>
          </p>
          {identical ? (
            <p className="rounded-xl border border-line bg-paper-2 p-4 text-[13.5px] text-ink-soft">No differences: this version reads the same as your resume now.</p>
          ) : (
            <DiffText parts={parts} className="rounded-xl border border-line bg-paper p-4 font-mono text-[12.5px]" />
          )}
        </>
      )}
    </SideSheet>
  );
}
