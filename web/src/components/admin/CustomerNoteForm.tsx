"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

const textareaClass =
  "w-full resize-y rounded-[var(--radius)] border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-ink";

/** Add a note to a customer's timeline (Phase 9.C1) → BFF POST (audited in the API). */
export default function CustomerNoteForm({ login }: { login: string }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(login)}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast({ variant: "error", title: data.error ?? "Couldn't save the note." });
        return;
      }
      setBody("");
      toast({ variant: "success", title: "Note added" });
      router.refresh();
    } catch {
      toast({ variant: "error", title: "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <label className="block text-sm">
        <span className="mb-1 block text-[13px] font-medium text-ink-soft">Add a note</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="e.g. Refunded the last charge in Stripe as goodwill"
          className={textareaClass}
        />
      </label>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted">Notes can&apos;t be edited later.</span>
        <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
          {busy ? "Saving…" : "Add note"}
        </Button>
      </div>
    </div>
  );
}
