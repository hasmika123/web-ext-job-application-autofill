"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface Resume {
  id: number;
  label: string;
  status?: string | null;
  createdAt?: string | null;
  archived?: boolean | null;
}

function prettyStatus(status?: string | null): string {
  if (!status) return "";
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Row({ resume }: { resume: Resume }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archived = !!resume.archived;

  async function setArchived(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/resumes/${resume.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: next }),
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

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-foreground/15 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="truncate font-medium">{resume.label}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-foreground/50">
          {resume.status && (
            <span className="rounded-full border border-foreground/15 px-2 py-0.5">
              {prettyStatus(resume.status)}
            </span>
          )}
          {formatDate(resume.createdAt) && <span>Added {formatDate(resume.createdAt)}</span>}
          {archived && <span className="text-amber-700 dark:text-amber-400">Archived</span>}
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
      <button
        onClick={() => setArchived(!archived)}
        disabled={busy}
        className="shrink-0 self-start rounded-full border border-foreground/20 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50 sm:self-auto"
      >
        {busy ? "…" : archived ? "Restore" : "Archive"}
      </button>
    </li>
  );
}

/**
 * Lists the current user's saved resumes (active + archived). Archiving hides a resume
 * from the active picker without deleting it — see the resume-archive guard (Phase 3.5),
 * which will block deleting a resume an application still references.
 */
export default function ResumeList({ resumes }: { resumes: Resume[] }) {
  const active = resumes.filter((r) => !r.archived);
  const archived = resumes.filter((r) => r.archived);

  if (resumes.length === 0) {
    return <p className="text-sm text-foreground/50">No resumes saved yet — upload one above.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
          Your resumes ({active.length})
        </h2>
        {active.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {active.map((r) => (
              <Row key={r.id} resume={r} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground/50">All your resumes are archived.</p>
        )}
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">
            Archived ({archived.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {archived.map((r) => (
              <Row key={r.id} resume={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
