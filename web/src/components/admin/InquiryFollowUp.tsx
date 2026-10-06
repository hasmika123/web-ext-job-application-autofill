"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@/components/ui";
import Select from "@/components/ui/Select";

const STATUSES = ["NEW", "CONTACTED", "WON", "LOST"];
const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Status + a short note for one "Contact us" request (Phase 15.6) → BFF PUT (audited in the API). */
export default function InquiryFollowUp({ id, status, adminNotes }: { id: number; status: string; adminNotes: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [st, setSt] = useState(status);
  const [notes, setNotes] = useState(adminNotes ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = st !== status || notes !== (adminNotes ?? "");

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: st, adminNotes: notes || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't save." });
        return;
      }
      toast({ variant: "success", title: "Saved" });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <Select
        aria-label="Status"
        variant="pill"
        value={st}
        onChange={setSt}
        options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
      />
      <Input
        aria-label="Note"
        placeholder="Note (e.g. call booked Tue)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={4000}
        className="min-w-[200px] flex-1"
      />
      <Button size="sm" onClick={save} disabled={busy || !dirty}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
