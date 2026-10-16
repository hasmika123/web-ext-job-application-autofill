"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, ErrorState, FileTextIcon, Skeleton, Switch, useToast } from "@kiwiply/ui";
import { CARD } from "@/components/ent/dashboard/parts";
import { fetchResumePolicy, saveConsultantShareLinks, type ResumePolicy } from "@/lib/ent/resume-policy";

/**
 * Organization Settings (admin workspace, `/w/admin/settings`, needs org.settings.manage). Today it holds the Resume Builder policy: one switch
 * that lets consultants create share links for their organization resumes (default off; a marketer acting for a consultant can never, whatever it
 * says). It autosaves: the switch moves at once, a quiet check shows when the API has it, and an Undo toast gives the old value back. A failed save
 * puts the switch back and says why. The API is the gate; this page only draws what it answers.
 */
export interface OrgSettingsPageProps {
  orgId: number;
}

export default function OrgSettingsPage({ orgId }: OrgSettingsPageProps) {
  const toast = useToast();
  const [policy, setPolicy] = useState<ResumePolicy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  const [saved, setSaved] = useState(false);
  const policyRef = useRef<ResumePolicy | null>(null);
  const tick = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    policyRef.current = policy;
  }, [policy]);
  useEffect(
    () => () => {
      if (tick.current) clearTimeout(tick.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setStatus("loading");
    const r = await fetchResumePolicy(orgId);
    if (r.kind === "OK") {
      setPolicy(r.policy);
      setStatus("ready");
    } else {
      setStatus(r.kind === "DENIED" ? "denied" : "failed");
    }
  }, [orgId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const flashTick = () => {
    setSaved(true);
    if (tick.current) clearTimeout(tick.current);
    tick.current = setTimeout(() => setSaved(false), 2000);
  };

  /** Optimistic write of the share-link switch; `undoable` is false for the write an Undo itself makes (no Undo of an Undo). */
  const change = async (value: boolean, undoable = true) => {
    const before = policyRef.current;
    if (!before) return;
    setSaved(false);
    setPolicy({ ...before, consultantShareLinks: value });
    const r = await saveConsultantShareLinks(orgId, value);
    if (r.kind === "OK") {
      setPolicy(r.policy);
      flashTick();
      toast({
        title: value ? "Consultants can now create share links" : "Consultants can no longer create share links",
        variant: "success",
        action: undoable ? { label: "Undo", onClick: () => void change(before.consultantShareLinks, false) } : undefined,
      });
      return;
    }
    setPolicy(before);
    if (r.kind === "DENIED") void load();
    toast({ title: "Not saved", description: r.kind === "INVALID" ? r.message : "That change wasn't saved. Nothing changed.", variant: "error" });
  };

  if (status === "loading") return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (status === "denied") return <ErrorState what="these settings" description="You don't have access to the organization settings." />;
  if (status === "failed" || !policy) return <ErrorState what="the organization settings" description="Please refresh in a moment." onRetry={() => void load()} />;

  return (
    <section aria-labelledby="org-set-resumes" className={`${CARD} p-5`} data-org-settings>
      <div className="flex items-center gap-2">
        <FileTextIcon size={18} className="text-muted" />
        <h2 id="org-set-resumes" className="text-[16px] font-bold text-ink">
          Resumes
        </h2>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Switch
            label="Share links"
            description="Let consultants create share links for their organization resumes"
            checked={policy.consultantShareLinks}
            onCheckedChange={(v) => void change(v)}
          />
        </div>
        <span aria-live="polite" title={saved ? "Saved" : undefined} data-saved-tick={saved ? "" : undefined} className="inline-flex h-5 w-5 flex-none items-center justify-center text-green-600">
          {saved ? (
            <>
              <CheckIcon size={16} />
              <span className="sr-only">Saved</span>
            </>
          ) : null}
        </span>
      </div>
      <p className="mt-3 text-[12.5px] leading-snug text-muted">
        Off by default. A marketer preparing a resume for a consultant can never create share links, whatever this says.
      </p>
    </section>
  );
}
