"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, DownloadIcon, Spinner, useToast } from "@kiwiply/ui";
import { ACTIVE_EXPORT, formatBytes, safeDownloadPath, type ExportJob, type ExportStatus } from "@/lib/account-privacy";

const SPRING = "/api/account/exports";
/** While a job is queued or running we ask about it this often. */
const POLL_MS = 3_000;

type Load = { kind: "loading" } | { kind: "unavailable" } | { kind: "error" } | { kind: "ready"; jobs: ExportJob[] };

const STATUS_WORDS: Record<ExportStatus, string> = {
  QUEUED: "Waiting to start",
  RUNNING: "Preparing",
  READY: "Ready",
  FAILED: "Failed",
  EXPIRED: "Expired",
};

async function problem(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string; detail?: string } | null;
  return body?.error ?? body?.message ?? body?.detail ?? fallback;
}

const whenOf = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

/**
 * Settings > Privacy > Prepare my data export. One button queues a ZIP of everything we hold about you (the JSON export plus your stored
 * files, size-capped); the list below shows your recent exports with their status, and a Download link on the ones that are ready.
 * While one is being built the list keeps itself up to date. A 404 from the API (an employer-managed account) hides the controls.
 */
export default function DataExports() {
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const jobsRef = useRef<ExportJob[]>([]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(SPRING, { cache: "no-store" });
      if (!alive.current) return;
      if (res.status === 404) return setLoad({ kind: "unavailable" });
      if (!res.ok) return setLoad({ kind: "error" });
      const jobs = (await res.json()) as ExportJob[];
      if (alive.current) setLoad({ kind: "ready", jobs: Array.isArray(jobs) ? jobs : [] });
    } catch {
      if (alive.current) setLoad({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the jobs live on the server, so they can only be read after mount
    void refresh();
  }, [refresh]);

  const jobs = load.kind === "ready" ? load.jobs : [];
  useEffect(() => {
    jobsRef.current = jobs;
  });
  const activeIds = jobs.filter((j) => ACTIVE_EXPORT.includes(j.status)).map((j) => j.id);
  const activeKey = activeIds.join(",");

  // Follow the running job(s) until they finish, then say so once.
  useEffect(() => {
    if (!activeKey) return;
    const ids = activeKey.split(",");
    const id = setInterval(async () => {
      for (const jobId of ids) {
        try {
          const res = await fetch(`${SPRING}/${jobId}`, { cache: "no-store" });
          if (!alive.current || !res.ok) continue;
          const next = (await res.json()) as ExportJob;
          const before = jobsRef.current.find((j) => j.id === next.id);
          const finished = !!before && ACTIVE_EXPORT.includes(before.status) && !ACTIVE_EXPORT.includes(next.status);
          setLoad((cur) => (cur.kind === "ready" ? { kind: "ready", jobs: cur.jobs.map((j) => (j.id === next.id ? next : j)) } : cur));
          if (finished) {
            toast(
              next.status === "READY"
                ? { title: "Your data export is ready", description: "Download it from the list below.", variant: "success" }
                : { title: "The export didn't finish", description: next.error ?? "Please try again.", variant: "error" },
            );
          }
        } catch {
          // a missed poll just waits for the next tick
        }
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [activeKey, toast]);

  const prepare = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(SPRING, { method: "POST" });
      if (res.status === 429) {
        setError("You've reached today's limit of exports. Try again tomorrow.");
        return;
      }
      if (!res.ok) {
        setError(await problem(res, "Couldn't start the export. Please try again."));
        return;
      }
      const job = (await res.json()) as ExportJob;
      setLoad((cur) => {
        const rest = cur.kind === "ready" ? cur.jobs.filter((j) => j.id !== job.id) : [];
        return { kind: "ready", jobs: [job, ...rest] };
      });
      toast({ title: "Preparing your export", description: "It can take a few minutes. This list updates when it's ready." });
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [toast]);

  if (load.kind === "unavailable") return null;

  const working = activeIds.length > 0;

  return (
    <div data-data-exports className="flex flex-col gap-3">
      <div>
        <Button variant="ghost" size="md" onClick={() => void prepare()} disabled={busy || working || load.kind === "loading"}>
          {busy || working ? <Spinner aria-hidden label="Preparing" className="h-4 w-4" /> : <DownloadIcon aria-hidden className="h-4 w-4" />}
          {working ? "Preparing your export…" : "Prepare my data export"}
        </Button>
        <p className="mt-1.5 text-xs text-ink-soft">
          A ZIP with your data as JSON plus the files you uploaded. Large accounts are capped, and anything left out is listed. Download links expire.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {error}
        </p>
      )}

      {load.kind === "loading" && (
        <div className="flex items-center gap-2 text-[13px] text-v2-muted">
          <Spinner aria-hidden label="Loading" className="h-4 w-4" />
          Loading your exports…
        </div>
      )}
      {load.kind === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-[13.5px] text-ink-soft">
          <span>Couldn&apos;t load your exports.</span>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      )}
      {load.kind === "ready" && jobs.length === 0 && <p className="text-[13px] text-v2-muted">No exports yet.</p>}
      {jobs.length > 0 && (
        <ul aria-label="Your data exports" className="divide-y divide-v2-line/60 rounded-[var(--radius)] border border-v2-line/70">
          {jobs.map((j) => (
            <ExportRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ExportRow({ job }: { job: ExportJob }) {
  const href = job.status === "READY" ? safeDownloadPath(job.downloadPath) : null;
  const details = [
    job.status === "READY" && job.sizeBytes != null ? formatBytes(job.sizeBytes) : "",
    job.status === "READY" && job.fileCount != null ? `${job.fileCount} ${job.fileCount === 1 ? "file" : "files"}` : "",
    job.status === "READY" && job.expiresAt ? `link expires ${whenOf(job.expiresAt)}` : "",
  ].filter(Boolean);
  return (
    <li data-export-id={job.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-v2-navy">Requested {whenOf(job.requestedAt)}</span>
          <Badge variant={job.status === "READY" ? "ready" : job.status === "FAILED" ? "review" : "default"}>{STATUS_WORDS[job.status] ?? job.status}</Badge>
        </div>
        {details.length > 0 && <p className="mt-0.5 text-[13px] text-ink-soft">{details.join(" · ")}</p>}
        {job.status === "READY" && (job.skippedCount ?? 0) > 0 && (
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {job.skippedCount} {job.skippedCount === 1 ? "file was" : "files were"} left out to stay under the size limit.
          </p>
        )}
        {job.status === "FAILED" && <p className="mt-0.5 text-[13px] text-danger-text">{job.error ?? "Something went wrong."} Prepare a new export to try again.</p>}
        {job.status === "EXPIRED" && <p className="mt-0.5 text-[13px] text-ink-soft">The link has expired. Prepare a new export.</p>}
      </div>
      {href && (
        <a
          href={href}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-v2-line px-4 py-2 text-sm font-medium text-v2-navy hover:bg-paper-2 sm:min-h-0"
        >
          <DownloadIcon aria-hidden className="h-4 w-4" />
          Download
        </a>
      )}
    </li>
  );
}
