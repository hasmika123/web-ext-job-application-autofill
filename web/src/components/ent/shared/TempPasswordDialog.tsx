"use client";

import { useRef, useState } from "react";
import { AlertIcon, Button, CheckIcon, CopyIcon } from "@kiwiply/ui";
import { SheetFrame } from "@/components/admin-v3/common/ReasonSheet";

/**
 * The one-time temporary password (owner onboarding, employee direct-create, both resets). The server returns the password in
 * the create / reset response ONLY; this dialog is the only place it is ever drawn. It is held in this component's props for as
 * long as the dialog is open, shown with a Copy button and a "shown once" warning, and gone when the dialog closes: it is never
 * written to storage, the URL, a log or the page, and no later request can return it.
 */
export interface TempPasswordDialogProps {
  open: boolean;
  /** Who the password is for (shown as "for ..."). */
  who: string;
  /** The clear-text password; null when there is none to show (the dialog then says nothing was issued). */
  password: string | null;
  /** ISO time after which the password stops working. */
  expiresAt?: string | null;
  /** Extra sentence under the warning (for example how the person signs in). */
  hint?: string;
  title?: string;
  onClose: () => void;
}

function when(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export default function TempPasswordDialog(p: TempPasswordDialogProps) {
  return (
    <SheetFrame id="temp-password-sheet" open={p.open} onClose={p.onClose} title={p.title ?? "Temporary password"}>
      {p.open && <Body {...p} />}
    </SheetFrame>
  );
}

/** Mounted only while the dialog is open, so the copied / failed state and the password in memory vanish with it. */
function Body({ who, password, expiresAt, hint, onClose }: TempPasswordDialogProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  async function copy() {
    if (!password) return;
    setFailed(false);
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      field.current?.select(); // clipboard blocked: select it so Ctrl+C works
      setFailed(true);
    }
  }

  const until = when(expiresAt);
  return (
      <div className="space-y-3" data-temp-password-dialog>
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-v2-amber-soft px-3 py-2.5 text-[13.5px] font-medium leading-snug text-v2-amber-ink">
          <AlertIcon size={16} className="mt-0.5 flex-none" aria-hidden />
          <span>Shown once. Copy it now: it cannot be shown again, and it is not sent by e-mail.</span>
        </p>
        {password ? (
          <>
            <p className="text-[14px] leading-relaxed text-ink">
              Give this temporary password to <strong>{who}</strong>
              {until ? ` before ${until}` : ""}. They must choose their own password the first time they sign in.
            </p>
            <div className="flex items-stretch gap-2">
              <input
                ref={field}
                readOnly
                value={password}
                aria-label="Temporary password"
                data-testid="temp-password"
                spellCheck={false}
                autoComplete="off"
                onFocus={(e) => e.currentTarget.select()}
                className="min-h-11 w-full min-w-0 rounded-[var(--radius)] border border-line bg-paper px-3 font-mono text-[16px] tracking-wide text-ink sm:min-h-0"
              />
              <Button type="button" variant="primary" onClick={() => void copy()} className="min-h-11 flex-none gap-1.5 sm:min-h-0" aria-live="polite">
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {failed && <p className="text-[12.5px] text-danger-text">Your browser blocked copying. The password is selected: press Ctrl+C (Cmd+C on a Mac).</p>}
          </>
        ) : (
          <p className="text-[14px] leading-relaxed text-ink">No temporary password was issued for {who}: there is nothing to give them. (Organizations created with their own accounts always show one.)</p>
        )}
        {hint && <p className="text-[13px] leading-snug text-ink-soft">{hint}</p>}
        <div className="flex justify-end pt-1">
          <Button type="button" variant={password ? "ghost" : "primary"} onClick={onClose} className="min-h-11 sm:min-h-0">
            {password ? "I have copied it" : "Close"}
          </Button>
        </div>
      </div>
  );
}
