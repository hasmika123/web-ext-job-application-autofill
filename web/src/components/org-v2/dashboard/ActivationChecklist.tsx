"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, CheckCircleIcon, Input, buttonVariants, cn, useToast } from "@kiwiply/ui";
import { Progress, SectionCard } from "@/components/app-v2/common";
import { orgPath, orgRequest, type OrgProblem } from "@/lib/org-api";
import { undoToast } from "@/lib/undo-toast";
import type { OnboardingItem, OrgGroup, OrgOnboarding } from "@/lib/org-types";
import { useOrg } from "../shell/OrgContext";
import { groupWord, rowCopy } from "./dashboard-copy";

/**
 * The activation checklist (onboarding-invites.md section 5, O2.7): what to do next, with the live numbers, until it is done.
 * Computed by the server (`GET /api/orgs/{id}/onboarding`). Rows whose action exists are real: "Activate" goes to billing, and
 * adding a first group is done right here (type a name, Enter; an Undo toast removes it). Rows whose action is not built yet
 * sit under "Coming soon", labelled as such, never as a link that goes nowhere.
 */
export default function ActivationChecklist({ data, onChanged }: { data: OrgOnboarding; onChanged: () => void }) {
  const { org } = useOrg();
  const available = data.items.filter((i) => i.available);
  const soon = data.items.filter((i) => !i.available);
  const pct = data.total > 0 ? (data.done / data.total) * 100 : 0;

  return (
    <SectionCard
      title="Get your workspace going"
      subtitle={`${data.done} of ${data.total} done`}
      headerExtra={<Progress value={pct} tone="green" className="mt-1 w-24 sm:w-32" label={`${data.done} of ${data.total} steps done`} />}
    >
      <ul className="space-y-2.5" data-checklist>
        {available.map((item) => (
          <li key={item.key} data-checklist-row={item.key} data-done={item.done}>
            <Row item={item} type={org.type} onChanged={onChanged} />
          </li>
        ))}
      </ul>
      {soon.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-v2-muted">Coming soon</h3>
          <ul className="space-y-1.5">
            {soon.map((item) => (
              <li key={item.key} data-checklist-row={item.key} data-soon>
                <SoonRow item={item} type={org.type} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function Tick({ done }: { done: boolean }) {
  return done ? (
    <CheckCircleIcon aria-label="Done" className="h-6 w-6 flex-none text-v2-green" />
  ) : (
    <span aria-hidden className="h-6 w-6 flex-none rounded-full border-2 border-v2-line" />
  );
}

function Row({ item, type, onChanged }: { item: OnboardingItem; type: Parameters<typeof rowCopy>[1]; onChanged: () => void }) {
  const copy = rowCopy(item, type);
  const { can } = useOrg();
  return (
    <div className={cn("rounded-2xl border p-3.5", item.done ? "border-v2-line/70 bg-paper" : "border-v2-blue/25 bg-v2-blue-soft/40")}>
      <div className="flex items-start gap-3">
        <Tick done={item.done} />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold leading-snug text-v2-navy">{copy.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{copy.detail}</p>
        </div>
        {item.key === "activate" && !item.done &&
          (can("billing.view") ? (
            <Link href={item.href} className={buttonVariants("primary", "sm", "min-h-11 flex-none sm:min-h-0")}>
              Activate
            </Link>
          ) : (
            <span className="flex-none text-[12.5px] text-muted">Ask the owner</span>
          ))}
      </div>
      {item.key === "groups" && can("groups.manage") && <AddGroup first={!item.done} type={type} onChanged={onChanged} />}
    </div>
  );
}

function SoonRow({ item, type }: { item: OnboardingItem; type: Parameters<typeof rowCopy>[1] }) {
  const copy = rowCopy(item, type);
  return (
    <div className="flex items-center gap-3 rounded-xl px-1 py-1.5 opacity-75">
      <span aria-hidden className="h-5 w-5 flex-none rounded-full border-2 border-dashed border-v2-line" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-ink-soft">
          {copy.title}
          {item.optional && <span className="ml-1.5 font-normal text-muted">(optional)</span>}
        </p>
        <p className="text-[12.5px] leading-snug text-muted">{copy.detail}</p>
      </div>
      <span className="flex-none rounded-full bg-paper-2 px-2 py-0.5 text-[11.5px] font-semibold text-ink-soft">Soon</span>
    </div>
  );
}

/** What to tell the person when the API refuses a new group. */
function groupProblem(p: OrgProblem, singular: string): string {
  switch (p.code) {
    case "GROUP_NAME_TAKEN":
      return `You already have a ${singular} with that name.`;
    case "ORG_LIMIT_REACHED":
      return `That's the most ${singular}s a workspace can have (${p.max ?? "the limit"}).`;
    case "SENSITIVE_CONTENT":
      return "That looks like a number we never collect. Use a name instead.";
    case "DEMO_READ_ONLY":
      return "This is a demo account - changes aren't saved.";
    case "ORG_INVALID":
      return "Add a name (up to 80 characters).";
    case "NETWORK":
      return "Couldn't reach the server. Try again.";
    default:
      return `Couldn't add the ${singular}. Try again in a moment.`;
  }
}

/** One input, Enter to add (no Save button), an Undo toast that removes it again. */
function AddGroup({ first, type, onChanged }: { first: boolean; type: Parameters<typeof rowCopy>[1]; onChanged: () => void }) {
  const { orgId } = useOrg();
  const toast = useToast();
  const word = groupWord(type);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    const res = await orgRequest<OrgGroup>(orgPath(orgId, "/groups"), { method: "POST", body: JSON.stringify({ name: value, kind: word.kind }) });
    setBusy(false);
    if (!res.ok) {
      setError(groupProblem(res.problem, word.singular));
      return;
    }
    const id = res.data.id;
    setName("");
    onChanged();
    undoToast(toast, {
      title: `Added ${value}`,
      onUndo: () => {
        void orgRequest<unknown>(orgPath(orgId, `/groups/${id}`), { method: "DELETE" }).then(onChanged);
      },
    });
  }

  return (
    <form onSubmit={(e) => void add(e)} className="mt-3 pl-9" noValidate>
      <label htmlFor="new-group-name" className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
        {first ? `Name your first ${word.singular}` : `Add another ${word.singular}`}
      </label>
      <div className="flex gap-2">
        <Input
          id="new-group-name"
          value={name}
          maxLength={80}
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-group-error" : undefined}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="primary" disabled={busy || !name.trim()} className="flex-none">
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && (
        <p id="new-group-error" role="alert" className="mt-1.5 text-[12.5px] font-medium text-danger-text">
          {error}
        </p>
      )}
    </form>
  );
}
