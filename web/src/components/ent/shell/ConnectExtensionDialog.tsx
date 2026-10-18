"use client";

import { useState } from "react";
import { Button, Dialog, LinkIcon } from "@kiwiply/ui";
import { requestExtensionConnectLink } from "@/lib/ent/connect-extension";
import { EXT_STORE_URL } from "@/lib/extension-signal";

/**
 * Connect extension (D6, 2026-10-16 audit). A tenant page cannot see whether the Kiwiply extension is installed (only kiwiply.com is in its
 * externally_connectable list), so instead of a red "Extension not connected" error the account menu opens this: step 1 installs it (a link), step 2
 * connects it (one-time code, opens the platform connect page). A failed request is a calm sentence inside the dialog, not a toast.
 */
export default function ConnectExtensionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const link = await requestExtensionConnectLink();
    setBusy(false);
    if (!link.ok) return setMessage(link.message);
    window.open(link.url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Connect the Kiwiply extension"
      description="The extension fills applications in your own browser and never submits for you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="accent" onClick={() => void connect()} disabled={busy} data-connect-extension>
            <LinkIcon size={16} className="mr-1.5" aria-hidden /> {busy ? "Connecting…" : "Connect"}
          </Button>
        </>
      }
    >
      <ol className="list-decimal space-y-2 pl-5 text-[14px] text-ink-soft">
        <li>
          Install the Kiwiply extension first.{" "}
          <a href={EXT_STORE_URL} target="_blank" rel="noopener noreferrer" data-install-extension className="font-semibold text-accent-deep underline">
            Get the extension
          </a>
        </li>
        <li>Already installed? Press Connect: it opens a page that signs the extension in as this account.</li>
      </ol>
      {message ? (
        <p role="status" data-connect-message className="mt-3 text-[13px] text-muted">
          {message}
        </p>
      ) : null}
    </Dialog>
  );
}
