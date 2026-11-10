"use client";

import { useId, useState } from "react";
import { Button, Input } from "@kiwiply/ui";
import Sheet from "./Sheet";

export const REVOKE_WORD = "revoke";

/**
 * Revoking several invitations at once is the one step that can not be walked back quietly (each link stops working at once), so it
 * asks for the word `revoke` first. A single revoke needs no typing: it acts at once and the toast offers Undo.
 */
export default function RevokeConfirm({ count, onConfirm, onClose }: { count: number; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const uid = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    setTyped("");
    onClose();
  };
  const ok = typed.trim().toLowerCase() === REVOKE_WORD && !busy;
  return (
    <Sheet id="invitations-revoke-sheet" open={count > 0} onClose={close} title={`Revoke ${count} invitation${count === 1 ? "" : "s"}?`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          await onConfirm();
          setBusy(false);
          close();
        }}
      >
        <p className="text-[14px] leading-relaxed text-ink">Their invitation links stop working at once. You can invite the same addresses again later.</p>
        <label htmlFor={`${uid}-typed`} className="text-[12.5px] font-semibold text-ink">
          Type <span className="font-mono">{REVOKE_WORD}</span> to confirm
        </label>
        <Input id={`${uid}-typed`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!ok}>
            {busy ? "Revoking…" : "Revoke"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
