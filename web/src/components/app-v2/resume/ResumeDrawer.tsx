"use client";

import { useEffect, useRef } from "react";
import { SidePanel } from "@kiwiply/ui";
import ResumesWorkspace from "@/components/ResumesWorkspace";
import type { Resume } from "@/components/ResumeList";

/**
 * Right-hand drawer hosting the existing `ResumesWorkspace` (upload + review + variant list) in
 * a `SidePanel`. Mounted only while open so the workspace starts from fresh state each time.
 * Esc and the backdrop close it; body scroll is locked while it is up.
 */
export default function ResumeDrawer({
  onClose,
  baseProfile,
  resumes,
  usage,
  isPro,
}: {
  onClose: () => void;
  baseProfile: Record<string, unknown>;
  resumes: Resume[];
  usage: Record<number, number>;
  isPro: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the mount effect (a refresh must not steal focus back).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close resumes panel" onClick={onClose} className="absolute inset-0 bg-v2-navy/40" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Resumes"
        tabIndex={-1}
        className="relative h-full w-full max-w-[720px] shadow-v2-float outline-none"
      >
        <SidePanel title="Resumes" onClose={onClose}>
          <ResumesWorkspace baseProfile={baseProfile} resumes={resumes} usage={usage} isPro={isPro} />
        </SidePanel>
      </div>
    </div>
  );
}
