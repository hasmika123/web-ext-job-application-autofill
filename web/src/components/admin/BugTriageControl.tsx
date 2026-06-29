"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface Props {
  id: number;
  status: string;
  severity: string | null;
  adminNotes: string | null;
}

const STATUSES = ["NEW", "TRIAGED", "IN_PROGRESS", "RESOLVED", "WONTFIX"];
const SEVERITIES = ["", "LOW", "MEDIUM", "HIGH"];

/** Admin triage controls for one bug report (Phase 9.A5.3): status, severity, notes → BFF PUT. */
export default function BugTriageControl({ id, status, severity, adminNotes }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [st, setSt] = useState(status);
  const [sev, setSev] = useState(severity ?? "");
  const [notes, setNotes] = useState(adminNotes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/bug-reports/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: st, severity: sev || null, adminNotes: notes || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't save." });
        return;
      }
      toast({ variant: "success", title: "Triage saved" });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[var(--radius)] border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Triage</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-[13px] font-medium text-ink-soft">Status</span>
          <select value={st} onChange={(e) => setSt(e.target.value)} className="w-full rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s === "IN_PROGRESS" ? "In progress" : s === "WONTFIX" ? "Won't fix" : s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[13px] font-medium text-ink-soft">Severity</span>
          <select value={sev} onChange={(e) => setSev(e.target.value)} className="w-full rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink">
            {SEVERITIES.map((s) => (
              <option key={s || "none"} value={s}>{s || "—"}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-[13px] font-medium text-ink-soft">Admin notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} className="w-full resize-y rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink" />
      </label>
      <button type="button" onClick={save} disabled={busy} className="mt-3 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50">
        {busy ? "Saving…" : "Save triage"}
      </button>
    </section>
  );
}
