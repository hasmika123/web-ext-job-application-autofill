"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, ChevronLeftIcon, ProgressBar, Skeleton, Tooltip, XIcon, useBottomBar, useToast } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { orgPath, orgRequest } from "@/lib/org-api";
import type { OrgBilling, OrgDetail } from "@/lib/org-types";
import Step1 from "./Step1";
import Step2 from "./Step2";
import Step3, { Step3Actions } from "./Step3";
import {
  EMPTY_DRAFT,
  failureOf,
  hasErrors,
  loadDraft,
  saveDraft,
  step1Errors,
  step2Errors,
  type CreateDraft,
  type CreateFailure,
} from "./create-logic";

type Step = 1 | 2 | 3;

/**
 * `/org/new` (O2.1, onboarding-invites.md section 2): name + type -> about your people -> activate. Phone first: one question
 * per screen, 44 px chips, the primary action in a sticky bar the bug-report button lifts above, the keyboard's Enter moves on.
 *
 *  - Nothing is written until the end of screen 2: Continue there creates the DRAFT org (`POST /api/orgs`); an address that is
 *    taken sends the person back to screen 1 with the API's suggestion, any other refusal stays on screen 2 with its reason.
 *  - Typed answers survive a reload (sessionStorage) until the org exists, so a phone that backgrounds the tab loses nothing.
 *  - Screen 3 reads `GET /api/orgs/{id}/billing`: "Activate workspace (dev)" only where the API says that path is open,
 *    otherwise just "Skip for now", which lands in the draft console with the pay banner.
 *  - The new org becomes the one the console opens (`kiwiply_org`), so someone with several lands in the right one.
 */
const noop = () => () => {};

/** What the flow starts from: the answers typed before a reload, else an empty draft with the country guessed from the browser's language. */
function restoreInitial(): { step: 1 | 2; draft: CreateDraft } {
  const stored = loadDraft(window.sessionStorage);
  if (stored) return stored;
  const region = (navigator.language ?? "").split("-")[1]?.toUpperCase();
  return { step: 1, draft: { ...EMPTY_DRAFT, country: region && /^[A-Z]{2}$/.test(region) ? region : "" } };
}

/**
 * The flow reads sessionStorage and the browser's language, which the server cannot, so it renders only on the client
 * (a quiet skeleton first). `useSyncExternalStore` is the sanctioned way to say "different on the server".
 */
export default function CreateOrgFlow() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-20" aria-busy="true">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-6 h-11 w-full" />
      </div>
    );
  }
  return <Flow />;
}

function Flow() {
  const router = useRouter();
  const toast = useToast();
  const restored = useState(() => restoreInitial())[0];
  const [step, setStep] = useState<Step>(restored.step);
  const [draft, setDraft] = useState<CreateDraft>(restored.draft);
  const [attempted, setAttempted] = useState<{ 1: boolean; 2: boolean }>({ 1: false, 2: false });
  const [failure, setFailure] = useState<CreateFailure | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ orgId: number; name: string } | null>(null);
  const [billing, setBilling] = useState<OrgBilling | null>(null);
  const [activating, setActivating] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  useBottomBar(bar);

  useEffect(() => {
    track("org_create_started");
  }, []);

  // Every change to the answers is remembered (until the org exists).
  const remember = (next: CreateDraft, at: 1 | 2) => saveDraft(typeof window === "undefined" ? null : window.sessionStorage, { step: at, draft: next });
  const change = (next: CreateDraft) => {
    setDraft(next);
    if (step !== 3) remember(next, step as 1 | 2);
    if (failure) setFailure(null);
  };

  const e1 = attempted[1] ? step1Errors(draft) : {};
  const e2 = attempted[2] ? step2Errors(draft) : {};

  function go(next: Step) {
    setStep(next);
    if (next !== 3) remember(draft, next);
    track("org_create_step", { step: next });
    window.scrollTo?.({ top: 0 });
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (creating || activating) return;
    if (step === 1) {
      setAttempted((a) => ({ ...a, 1: true }));
      if (!hasErrors(step1Errors(draft))) go(2);
    } else if (step === 2) {
      setAttempted((a) => ({ ...a, 2: true }));
      if (!hasErrors(step2Errors(draft))) await create();
    }
  }

  async function create() {
    setCreating(true);
    setFailure(null);
    const res = await orgRequest<OrgDetail>("/api/orgs", {
      method: "POST",
      body: JSON.stringify({ name: draft.name.trim(), type: draft.type, slug: draft.slug, sizeBand: draft.sizeBand, country: draft.country }),
    });
    if (!res.ok) {
      const f = failureOf(res.problem);
      setFailure(f);
      if (f.step !== step) go(f.step);
      track("org_create_failed", { code: res.problem.code ?? String(res.problem.status) });
      setCreating(false);
      return;
    }
    const orgId = res.data.org.id;
    saveDraft(typeof window === "undefined" ? null : window.sessionStorage, null);
    setCreated({ orgId, name: res.data.org.name });
    // The console opens on this org (matters to someone with several); a failure here only means they start on their first one.
    await orgRequest("/api/orgs/current", { method: "POST", body: JSON.stringify({ orgId }) });
    const b = await orgRequest<OrgBilling>(orgPath(orgId, "/billing"));
    setBilling(b.ok ? b.data : null);
    setCreating(false);
    go(3);
  }

  async function activate() {
    if (!created || activating) return;
    setActivating(true);
    const res = await orgRequest<unknown>(orgPath(created.orgId, "/activate"), { method: "POST" });
    if (res.ok) {
      track("org_activated", { dev: true, type: draft.type });
      toast({ title: "Workspace activated", description: `${created.name} is live. Let's get your people in.`, variant: "success" });
      router.push("/org");
      router.refresh();
      return;
    }
    setActivating(false);
    toast({ title: "Couldn't activate the workspace", description: "You can try again from Billing.", variant: "error" });
  }

  const skip = () => {
    router.push("/org");
    router.refresh();
  };

  const back = () => {
    setFailure(null);
    go(1);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4">
      <header className="flex h-14 flex-none items-center gap-2">
        {step === 2 ? (
          <Tooltip content="Back" side="bottom">
            <button
              type="button"
              aria-label="Back"
              onClick={back}
              className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          </Tooltip>
        ) : step === 1 ? (
          <Tooltip content="Close" side="bottom">
            <button
              type="button"
              aria-label="Close"
              onClick={() => router.push("/dashboard")}
              className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </Tooltip>
        ) : (
          <span className="h-11 w-11" aria-hidden />
        )}
        <span className="ml-auto text-[13px] font-semibold text-muted" aria-hidden>
          {step}/3
        </span>
      </header>
      <ProgressBar value={step / 3} label="Create your workspace" valueText={`Step ${step} of 3`} />

      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-1 flex-col">
        <main className="flex-1 pb-6 pt-6">
          {step === 1 && <Step1 draft={draft} onChange={change} errors={e1} failure={failure} />}
          {step === 2 && <Step2 draft={draft} onChange={change} errors={e2} failure={failure} />}
          {step === 3 && created && <Step3 name={created.name} billing={billing} />}
        </main>

        <div
          ref={bar}
          className="sticky bottom-0 -mx-4 border-t border-line bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
        >
          {failure?.field === "form" && (
            <p role="alert" className="mb-2 text-[13px] font-medium text-danger-text">
              {failure.message}
            </p>
          )}
          {step === 3 ? (
            <Step3Actions billing={billing} busy={activating} onActivate={() => void activate()} onSkip={skip} />
          ) : (
            <Button type="submit" variant="accent" size="lg" className="w-full" disabled={creating}>
              {creating ? "Creating your workspace…" : "Continue"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
