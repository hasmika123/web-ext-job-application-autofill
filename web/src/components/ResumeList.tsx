"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface Resume {
  id: number;
  label: string;
  status?: string | null;
  createdAt?: string | null;
  archived?: boolean | null;
}

function prettyStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function statusBadge(status?: string | null) {
  if (!status) return null;
  const up = status.toUpperCase();
  if (up.includes("REVIEW")) return { variant: "review" as const, label: "Needs review" };
  if (up.includes("READY") || up.includes("DEFAULT")) return { variant: "ready" as const, label: prettyStatus(status) };
  return { variant: "default" as const, label: prettyStatus(status) };
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function FileIcon() {
  return (
    <span className="relative h-[52px] w-[42px] flex-none rounded-md border border-accent bg-accent-soft">
      <span className="absolute bottom-1.5 left-0 right-0 text-center text-[8px] font-extrabold tracking-wide text-accent-deep">
        DOC
      </span>
    </span>
  );
}

function Row({ resume, usage }: { resume: Resume; usage: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guard, setGuard] = useState<string | null>(null);
  const archived = !!resume.archived;
  const badge = statusBadge(resume.status);

  async function setArchived(next: boolean) {
    setBusy(true);
    setError(null);
    setGuard(null);
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
      toast({ variant: "success", title: next ? "Resume archived" : "Resume restored" });
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${resume.label}"? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    setGuard(null);
    try {
      const res = await fetch(`/api/resumes/${resume.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 409 = the archive guard (Phase 3.5): an application still references this resume.
        if (res.status === 409) {
          setGuard(data.error ?? "This resume is used by an application. Archive it instead of deleting.");
        } else {
          setError(data.error ?? "Couldn't delete.");
        }
        return;
      }
      toast({ variant: "success", title: "Resume deleted" });
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded-lg border border-line bg-paper px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-paper-2 disabled:opacity-50";

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border border-line bg-paper p-4 shadow-[var(--shadow)]">
      <FileIcon />
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
          <span className="truncate">{resume.label}</span>
          {!archived && badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          {archived && <Badge variant="review">Archived</Badge>}
        </div>
        <div className="mt-1 text-[12.5px] text-muted">
          {formatDate(resume.createdAt) && <span>Added {formatDate(resume.createdAt)}</span>}
          {formatDate(resume.createdAt) && " · "}
          {usage > 0 ? (
            <span className="text-ink-soft">used in {usage} application{usage === 1 ? "" : "s"}</span>
          ) : (
            "not used yet"
          )}
        </div>
        {guard && (
          <p className="mt-2 rounded-[var(--radius)] border border-brown/40 bg-brown-soft px-3 py-2 text-[12.5px] text-brown-deep">
            {guard}{" "}
            <button onClick={() => setArchived(true)} disabled={busy} className="font-bold underline">
              Archive instead
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="mt-1 text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-center">
        <button onClick={() => setArchived(!archived)} disabled={busy} className={btn}>
          {busy ? "…" : archived ? "Restore" : "Archive"}
        </button>
        <button onClick={remove} disabled={busy} className={cn(btn, "text-danger")}>
          Delete
        </button>
      </div>
    </li>
  );
}

/**
 * Variant cards for the user's saved resumes (active + archived). Archiving hides a
 * resume from the active picker without deleting it; the delete-guard (Phase 3.5) blocks
 * deleting a resume an application still references and nudges toward archiving instead.
 */
export default function ResumeList({
  resumes,
  usage = {},
}: {
  resumes: Resume[];
  usage?: Record<number, number>;
}) {
  const active = resumes.filter((r) => !r.archived);
  const archived = resumes.filter((r) => r.archived);

  if (resumes.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border-2 border-dashed border-line bg-paper px-6 py-10 text-center">
        <p className="text-sm text-muted">No resumes yet — drop one above to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Your resumes ({active.length})
        </h2>
        {active.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {active.map((r) => (
              <Row key={r.id} resume={r} usage={usage[r.id] ?? 0} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">All your resumes are archived.</p>
        )}
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Archived ({archived.length})
          </h2>
          <ul className="flex flex-col gap-3">
            {archived.map((r) => (
              <Row key={r.id} resume={r} usage={usage[r.id] ?? 0} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
