"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useEffect, useMemo, useState } from "react";
import { Button, ConfirmTypedSheet, Dialog, EmptyState, ReasonSheet, Spinner } from "@kiwiply/ui";
import type { ConfirmTypedSpec, ReasonSpec } from "@kiwiply/ui";
import { errorSentence, formatDate, membersApi, type LifecycleResult, type OffboardPreview, type ScheduledItem } from "@/lib/ent/members";

export interface Target {
  id: number;
  name: string;
}

/** Suspend: a reason of 10 to 500 characters, then the seat is paused (records stay, reinstating restores everything). */
export function SuspendSheet({ orgId, target, onClose, onDone }: { orgId: number | string; target: Target | null; onClose: () => void; onDone: (t: Target) => void }) {
  const spec = useMemo<ReasonSpec | null>(
    () =>
      target && {
        title: `Suspend ${target.name}?`,
        body: <>{target.name} loses access at their next request. Their seat, roles and records stay exactly as they are, and you can reinstate them at any time.</>,
        confirmLabel: "Suspend",
        placeholder: "e.g. Pending a review of their access",
        run: async (reason) => {
          const r = await membersApi.suspend(orgId, target.id, reason);
          if (r.ok) {
            onDone(target);
            return { ok: true };
          }
          return { ok: false, error: errorSentence(r), code: r.code };
        },
      },
    // `onDone` is the page's stable callback; the sheet only needs a new spec when the person changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, target],
  );
  return <ReasonSheet spec={spec} onClose={onClose} />;
}

/** The last day the person picked, as the instant sent to the API (end of that day, local time); null = now. */
export function effectiveAtOf(day: string): string | null {
  if (!day) return null;
  const d = new Date(`${day}T23:59:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * "Delete employee" is OFFBOARDING: the seat ends and access stops, but the records are kept (said plainly in the sheet). The person
 * types the employee's name, gives a reason and may pick a future last day (then it is scheduled, not applied). The preview comes
 * from the API: what runs, which roles end, what stays, and any blocker (the last administrator, yourself, an owner).
 */
export function OffboardSheet({ orgId, target, onClose, onDone }: { orgId: number | string; target: Target | null; onClose: () => void; onDone: (t: Target, r: LifecycleResult) => void }) {
  const [preview, setPreview] = useState<OffboardPreview | "loading" | { error: string } | null>(null);
  const [day, setDay] = useState("");

  useEffect(() => {
    if (!target) return;
    let live = true;
    setPreview("loading");
    setDay("");
    void membersApi.offboardPreview(orgId, target.id).then((r) => {
      if (live) setPreview(r.ok ? r.data : { error: errorSentence(r) });
    });
    return () => {
      live = false;
    };
  }, [orgId, target]);

  const spec = useMemo<ConfirmTypedSpec | null>(() => {
    if (!target) return null;
    const p = typeof preview === "object" && preview && "blockers" in preview ? preview : null;
    return {
      title: `Offboard ${target.name}?`,
      expected: target.name,
      expectedLabel: "their name",
      confirmLabel: day ? "Schedule last day" : "Offboard",
      placeholder: "e.g. Left the company on good terms",
      body: (
        <div className="space-y-3" data-offboard-body>
          <p>
            {target.name} will lose access and leave the organization. <strong>Their records are kept</strong> (resumes, applications and the audit trail stay with the organization); nothing is erased.
          </p>
          {preview === "loading" && (
            <p role="status" className="flex items-center gap-2 text-[13px] text-ink-soft">
              <Spinner /> Checking what this will do{"…"}
            </p>
          )}
          {preview && typeof preview === "object" && "error" in preview && <p role="alert" className="text-[13px] text-danger-text">{preview.error}</p>}
          {p && p.blockers.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-[13px] text-danger-text" data-offboard-blockers>
              {p.blockers.map((b) => (
                <li key={b.code}>{b.message}</li>
              ))}
            </ul>
          )}
          {p && (p.lines.length > 0 || p.rolesEnded.length > 0) && (
            <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-soft" data-offboard-lines>
              {p.lines.map((l, i) => (
                <li key={`${l.hook}-${i}`}>{l.text}</li>
              ))}
              {p.rolesEnded.length > 0 && <li>Roles that end: {p.rolesEnded.join(", ")}</li>}
            </ul>
          )}
          {p && p.recordsKept.length > 0 && <p className="text-[12.5px] text-muted">Kept: {p.recordsKept.join(", ")}.</p>}
          {p?.licenseNotice && <p className="text-[12.5px] text-muted">{p.licenseNotice}</p>}
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-ink">Last day (optional)</span>
            <input type="date" value={day} min={tomorrow()} onChange={(e) => setDay(e.target.value)} className="h-10 rounded-lg border border-line bg-paper px-3 text-[14px] text-ink" aria-label="Last day" />
            <span className="mt-1 block text-[12px] text-muted">{day ? `Access ends at the end of ${formatDate(effectiveAtOf(day))}. You can cancel it before then.` : "Leave empty to offboard now."}</span>
          </label>
        </div>
      ),
      run: async (reason) => {
        if (p && p.blockers.length > 0) return { ok: false, error: p.blockers[0].message };
        const r = await membersApi.offboard(orgId, target.id, { reason, confirm: target.name, effectiveAt: effectiveAtOf(day) });
        if (r.ok) {
          onDone(target, r.data);
          return { ok: true };
        }
        return { ok: false, error: errorSentence(r), code: r.code };
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, target, preview, day]);

  return <ConfirmTypedSheet spec={spec} onClose={onClose} />;
}

/** The scheduled last days, with a cancel for each. */
export function ScheduledDialog({ open, onClose, items, onCancel }: { open: boolean; onClose: () => void; items: ScheduledItem[]; onCancel: (i: ScheduledItem) => Promise<void> }) {
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <Dialog open={open} onClose={onClose} title="Scheduled last days" description="These people leave on the day shown. Cancel one and they stay.">
      {items.length === 0 ? (
        <EmptyState variant="inline" title="Nothing scheduled" description="A last day you set when offboarding someone shows up here." />
      ) : (
        <ul className="divide-y divide-line/60" data-scheduled-list>
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{i.name}</span>
                <span className="block text-[12px] text-muted">Last day {formatDate(i.effectiveAt)}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy === i.id}
                onClick={async () => {
                  setBusy(i.id);
                  await onCancel(i);
                  setBusy(null);
                }}
              >
                Cancel
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
