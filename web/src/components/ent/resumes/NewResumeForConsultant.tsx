"use client";

/* eslint-disable react-hooks/set-state-in-effect -- loaders: the effect starts a fetch and the answer is stored (the pattern of the other board dialogs) */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, ErrorState, Skeleton, Spinner, UserIcon, useToast } from "@kiwiply/ui";
import NewResumeSheet from "@/components/app-v3/resume-builder/NewResumeSheet";
import CapDialog from "@/components/app-v3/resume-builder/list/CapDialog";
import { BuilderEnvProvider, actForEnv } from "@/components/app-v3/resume-builder/builderEnv";
import type { CapNotice, ProfileSummary, ResumeChoice } from "@/components/app-v3/resume-builder/new-resume/model";

/**
 * "New resume for <consultant>" on the Marketing workspace's Resumes board. It is NOT a second builder: it is a consultant picker (the marketer's ASSIGNED
 * consultants) and then the very same `NewResumeSheet` the personal app and the consultant's own page use, mounted with the act-for builder environment
 * (`actForEnv`): the create goes to the tenant-aware act-for route, the resume is saved under the consultant's account with the marketer as author, lands
 * pending, and only the consultant approves it. Nothing is ever submitted, and no share link is created.
 */

interface Candidate {
  consultantId: number;
  name: string;
  title: string | null;
  hasAccount: boolean;
}
interface Sources {
  consultantId: number;
  name: string;
  profile: { itemCount: number; roles: number; schools: number; skills: number; headline: string | null };
  resumes: { id: number; name: string; kind: string; updatedAt: string | null }[];
}

type Picker = { state: "loading" } | { state: "failed" } | { state: "ready"; consultants: Candidate[] };

const possessive = (name: string): string => {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.endsWith("s") ? `${first}'` : `${first}'s`;
};

async function getJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, message: typeof (body as { error?: unknown } | null)?.error === "string" ? String((body as { error: string }).error) : "That didn't load." };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach the server." };
  }
}

export default function NewResumeForConsultant({ orgId, onCreated }: { orgId: number; onCreated: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<Picker>({ state: "loading" });
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [sources, setSources] = useState<Sources | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);
  const [templateId, setTemplateId] = useState("modern");
  const [limit, setLimit] = useState<CapNotice | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPicker({ state: "loading" });
    void getJson<Candidate[]>(`/api/orgs/${orgId}/mkt/resumes/consultants`).then((r) => {
      if (live) setPicker(r.ok ? { state: "ready", consultants: r.data } : { state: "failed" });
    });
    void getJson<{ templates?: { default?: string } }>("/api/resumes/builder-config").then((r) => {
      if (live && r.ok && typeof r.data.templates?.default === "string") setTemplateId(r.data.templates.default);
    });
    return () => {
      live = false;
    };
  }, [open, orgId, attempt]);

  const choose = async (c: Candidate) => {
    if (!c.hasAccount) return;
    setLoadingSources(true);
    const r = await getJson<Sources>(`/api/orgs/${orgId}/mkt/resumes/consultants/${c.consultantId}/sources`);
    setLoadingSources(false);
    if (!r.ok) {
      toast({ title: "Couldn't read that consultant's details", description: r.message, variant: "error" });
      return;
    }
    setSources(r.data);
    setChosen(c);
    setOpen(false);
  };

  const profile = useMemo<ProfileSummary>(
    () => (sources ? { itemCount: sources.profile.itemCount, roles: sources.profile.roles, schools: sources.profile.schools, skills: sources.profile.skills, score: null, headline: sources.profile.headline } : { itemCount: 0, roles: 0, schools: 0, skills: 0, score: null, headline: null }),
    [sources],
  );
  const choices = useMemo<ResumeChoice[]>(() => (sources?.resumes ?? []).map((r) => ({ id: r.id, name: r.name, kind: r.kind === "RECORD" ? ("RECORD" as const) : ("BUILT" as const), updatedAt: r.updatedAt, score: null, templateId: null })), [sources]);
  const env = useMemo(() => (chosen ? actForEnv(orgId, chosen.consultantId) : null), [orgId, chosen]);

  const close = () => {
    setChosen(null);
    setSources(null);
  };

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} data-new-resume-for className="ent-btn mb-1.5 mr-1.5">
        <UserIcon aria-hidden size={15} /> New resume for…
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="New resume for…" description="Pick one of your assigned consultants. The resume is saved under their account and waits for their approval.">
        {picker.state === "loading" ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : picker.state === "failed" ? (
          <ErrorState what="your consultants" description="They didn't load. Nothing has changed." variant="inline" onRetry={() => setAttempt((n) => n + 1)} />
        ) : picker.consultants.length === 0 ? (
          <p className="text-[13.5px] text-ink-soft">You have no assigned consultants yet.</p>
        ) : picker.consultants.every((c) => !c.hasAccount) ? (
          <p data-no-account-consultants className="text-[13.5px] leading-relaxed text-ink-soft">
            None of your assigned consultants has an organization account yet, so none of them could approve a resume made for them. Once a consultant joins with an
            organization account, they show up here.
          </p>
        ) : (
          <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto" aria-label="Consultants">
            {picker.consultants.map((c) => (
              <li key={c.consultantId}>
                <button
                  type="button"
                  data-consultant={c.consultantId}
                  disabled={!c.hasAccount || loadingSources}
                  onClick={() => void choose(c)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-paper px-3 text-left hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{c.name}</span>
                    <span className="block truncate text-[12.5px] text-muted">{c.hasAccount ? (c.title ?? "") : "Needs an organization account: they could not approve a resume made for them"}</span>
                  </span>
                  {loadingSources ? <Spinner role="presentation" aria-hidden className="h-4 w-4" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      {env && chosen && sources ? (
        <BuilderEnvProvider env={env}>
          <NewResumeSheet
            open
            onClose={close}
            subject={possessive(chosen.name)}
            profile={profile}
            resumes={choices}
            defaultTemplateId={templateId}
            targetSuggestions={sources.profile.headline ? [sources.profile.headline] : []}
            onLimit={(n) => {
              close();
              setLimit(n);
            }}
            onCreated={(_resumeId, orgResumeId) => {
              const name = chosen.name;
              close();
              onCreated();
              toast({
                title: `Resume created for ${name}`,
                description: "It is saved under their account and waits for their approval.",
                variant: "success",
                action: orgResumeId ? { label: "Edit it", onClick: () => router.push(`/w/marketing/resumes/${orgResumeId}`) } : undefined,
              });
            }}
          />
        </BuilderEnvProvider>
      ) : null}
      <BuilderEnvProvider env={actForEnv(orgId, 0)}>
        <CapDialog notice={limit} max={limit?.limit ?? 0} onManage={() => setLimit(null)} onClose={() => setLimit(null)} />
      </BuilderEnvProvider>
    </>
  );
}
