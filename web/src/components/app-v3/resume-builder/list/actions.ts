"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { deleteResume, duplicateResume, importUploaded, patchResumeMeta, type SimpleResult } from "@/lib/resume-list-api";
import type { CapNotice } from "../new-resume/model";
import type { ResumeCardModel } from "./adapter";

/** What a card's buttons and ⋮ menu do (DESIGN 10.17). Every one resolves when it is done and never throws. */
export interface CardActions {
  duplicate: (m: ResumeCardModel) => Promise<void>;
  /** "Open in builder" on an uploaded file: its parsed structure becomes a document. */
  openInBuilder: (m: ResumeCardModel) => Promise<void>;
  setPrimary: (m: ResumeCardModel) => Promise<void>;
  archive: (m: ResumeCardModel) => Promise<void>;
  restore: (m: ResumeCardModel) => Promise<void>;
  rename: (m: ResumeCardModel, name: string) => Promise<boolean>;
  remove: (m: ResumeCardModel) => Promise<boolean>;
  /** The resume currently being changed (its card shows busy); null when idle. */
  busyId: number | null;
}

/**
 * The list's resume actions: each calls the BFF, shows what happened in a toast and refreshes the page's
 * data (the list is a Server Component's fetch). Duplicate and Open in builder navigate into the editor.
 * A 402 from a duplicate (the plan's cap) goes to `onLimit` for the same upgrade prompt "New resume" uses.
 */
export function useResumeActions(onLimit: (notice: CapNotice) => void): CardActions {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const run = useCallback(
    async (m: ResumeCardModel, action: string, call: () => Promise<SimpleResult>, done: string | null): Promise<boolean> => {
      setBusyId(m.id);
      track("resume_list_action", { action });
      const res = await call();
      setBusyId(null);
      if (res.kind === "error") {
        toast({ title: "Couldn't do that", description: res.message, variant: "error" });
        return false;
      }
      if (done) toast({ title: done, variant: "success" });
      router.refresh();
      return true;
    },
    [router, toast],
  );

  return useMemo<CardActions>(
    () => ({
      busyId,
      async duplicate(m) {
        setBusyId(m.id);
        track("resume_list_action", { action: "duplicate" });
        const res = await duplicateResume(m.id);
        setBusyId(null);
        if (res.kind === "ok") {
          router.push(`/resume-builder/${res.id}`);
        } else if (res.kind === "limit") {
          onLimit({ message: res.message, plan: res.plan === "PRO" || res.plan === "AUTOPILOT" ? res.plan : "FREE" });
          track("resume_new_blocked_cap");
        } else {
          toast({ title: "Couldn't duplicate the resume", description: "message" in res ? res.message : undefined, variant: "error" });
        }
      },
      async openInBuilder(m) {
        setBusyId(m.id);
        track("resume_list_action", { action: "open_in_builder" });
        const res = await importUploaded(m.id);
        setBusyId(null);
        if (res.kind === "ok") router.push(`/resume-builder/${m.id}`);
        else toast({ title: "Couldn't open it in the builder", description: res.message, variant: "error" });
      },
      setPrimary: async (m) => {
        await run(m, "set_primary", () => patchResumeMeta(m.id, { primary: true }), `${m.name} is now your primary resume`);
      },
      archive: async (m) => {
        await run(m, "archive", () => patchResumeMeta(m.id, { archived: true }), `${m.name} archived`);
      },
      restore: async (m) => {
        await run(m, "unarchive", () => patchResumeMeta(m.id, { archived: false }), `${m.name} restored`);
      },
      rename: (m, name) => run(m, "rename", () => patchResumeMeta(m.id, { name }), "Renamed"),
      remove: (m) => run(m, "delete", () => deleteResume(m.id), `${m.name} deleted`),
    }),
    [busyId, onLimit, router, run, toast],
  );
}
