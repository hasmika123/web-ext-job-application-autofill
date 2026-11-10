"use client";

import { Button, Dialog, LinkIcon } from "@kiwiply/ui";
import { EXT_STORE_URL } from "@/lib/extension-signal";

/**
 * Connect extension (D6, 2026-10-16 audit). A tenant page cannot always see whether the extension is installed, so instead of a red
 * "Extension not connected" error the account menu opens this: step 1 installs it (a link), step 2 connects it. Connect opens this
 * organization's own `/connect` page (`components/ent/connect/TenantConnect.tsx`), which hands the session to an organization-branded
 * build directly, or passes the one-time code on to the platform connect page for the standard extension. Failures show on that page.
 */
export default function ConnectExtensionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  function connect() {
    window.open("/connect", "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Connect the browser extension"
      description="The extension fills applications in your own browser and never submits for you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="accent" onClick={connect} data-connect-extension>
            <LinkIcon size={16} className="mr-1.5" aria-hidden /> Connect
          </Button>
        </>
      }
    >
      <ol className="list-decimal space-y-2 pl-5 text-[14px] text-ink-soft">
        <li>
          Install the browser extension first.{" "}
          <a href={EXT_STORE_URL} target="_blank" rel="noopener noreferrer" data-install-extension className="font-semibold text-accent-deep underline">
            Get the extension
          </a>
        </li>
        <li>Already installed? Press Connect: it opens a page that signs the extension in as this account.</li>
      </ol>
    </Dialog>
  );
}
