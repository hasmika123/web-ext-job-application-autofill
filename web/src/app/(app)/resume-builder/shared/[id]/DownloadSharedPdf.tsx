"use client";

import { useState } from "react";
import { DownloadIcon } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import { loadSharedPdf } from "@/lib/resume-access";

/**
 * "Download PDF" for a shared resume. The stored PDF is served only while it is current, so the click can
 * answer "being prepared"; that is said inline instead of navigating to an error.
 */
export default function DownloadSharedPdf({ resumeId }: { resumeId: number }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setNote(null);
    const res = await loadSharedPdf(resumeId);
    setBusy(false);
    if (res.kind === "notReady") return setNote("The PDF is being prepared - try again in a moment.");
    if (res.kind === "error") return setNote(res.message);
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={download} disabled={busy}>
        <DownloadIcon size={15} aria-hidden /> Download PDF
      </Button>
      {note && (
        <p role="status" className="text-[12.5px] text-ink-soft">
          {note}
        </p>
      )}
    </div>
  );
}
