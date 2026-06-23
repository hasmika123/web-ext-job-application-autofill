"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface Application {
  id: number;
  company: string;
  roleTitle: string;
  jobUrl?: string | null;
  location?: string | null;
  externalJobId?: string | null;
  atsPlatform?: string | null;
  status: string;
  submissionConfirmed?: boolean | null;
  appliedAt?: string | null;
  createdAt?: string | null;
  resume?: { id: number; label?: string | null } | null;
}

// Board columns, left to right (the funnel order from the ROADMAP).
const COLUMNS: { key: string; label: string }[] = [
  { key: "DRAFT", label: "Draft" },
  { key: "SAVED", label: "Saved" },
  { key: "APPLIED", label: "Applied" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "OFFER", label: "Offer" },
  { key: "REJECTED", label: "Rejected" },
];

function hostOf(url?: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function Card({ app }: { app: Application }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  async function send(method: "PUT" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't update.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (status: string) => {
    if (status !== app.status) void send("PUT", { status });
  };
  const confirmSubmitted = () => void send("PUT", { status: "APPLIED", submissionConfirmed: true, appliedAt: new Date().toISOString() });
  const remove = () => {
    if (window.confirm(`Delete this entry — ${app.company} · ${app.roleTitle}?`)) void send("DELETE");
  };

  const host = hostOf(app.jobUrl);
  const showNudge = app.status === "DRAFT" && !nudgeDismissed;

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-foreground/15 bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{app.company}</div>
          <div className="truncate text-sm text-foreground/70">{app.roleTitle}</div>
        </div>
        <button
          onClick={remove}
          disabled={busy}
          title="Delete entry"
          aria-label="Delete entry"
          className="shrink-0 rounded-md px-1.5 text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-red-600 disabled:opacity-50"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-foreground/50">
        {app.location && <span>{app.location}</span>}
        {app.atsPlatform && (
          <span className="rounded-full border border-foreground/15 px-2 py-0.5 capitalize">{app.atsPlatform}</span>
        )}
        {app.resume?.label && <span className="truncate">📄 {app.resume.label}</span>}
      </div>

      {app.jobUrl && (
        <a
          href={app.jobUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate text-xs text-foreground/60 underline underline-offset-2 hover:text-foreground"
        >
          {host || "View posting"}
        </a>
      )}

      {showNudge && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <div className="font-medium text-amber-800 dark:text-amber-300">Did you submit this application?</div>
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={confirmSubmitted}
              disabled={busy}
              className="rounded-full bg-foreground px-3 py-1 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Yes, I applied
            </button>
            <button
              onClick={() => setNudgeDismissed(true)}
              disabled={busy}
              className="rounded-full border border-foreground/20 px-3 py-1 font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              Not yet
            </button>
          </div>
        </div>
      )}

      <div className="mt-0.5 flex items-center gap-2">
        <label className="sr-only" htmlFor={`status-${app.id}`}>
          Status
        </label>
        <select
          id={`status-${app.id}`}
          value={app.status}
          disabled={busy}
          onChange={(e) => changeStatus(e.target.value)}
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground/50 disabled:opacity-50"
        >
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The Kanban board (Draft → Saved → Applied → Interview → Offer → Rejected). The
 * tracker fills itself from the extension; here the user resolves DRAFTs via the
 * "Did you submit?" nudge, moves cards between columns, and dismisses dead entries.
 */
export default function ApplicationBoard({ applications }: { applications: Application[] }) {
  if (applications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-foreground/20 p-10 text-center">
        <p className="text-sm text-foreground/60">No applications yet.</p>
        <p className="mt-1 text-sm text-foreground/45">
          Fill or save a job with the Dossier extension and it&apos;ll show up here automatically.
        </p>
      </div>
    );
  }

  const byStatus = (status: string) => applications.filter((a) => a.status === status);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map((col) => {
        const items = byStatus(col.key);
        return (
          <section key={col.key} className="flex w-64 shrink-0 flex-col gap-3">
            <h2 className="flex items-center justify-between text-sm font-semibold">
              <span>{col.label}</span>
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-normal text-foreground/60">
                {items.length}
              </span>
            </h2>
            <ul className="flex flex-col gap-2">
              {items.map((a) => (
                <Card key={a.id} app={a} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
