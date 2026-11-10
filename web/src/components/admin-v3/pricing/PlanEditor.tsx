"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomSheet, Button, ChevronLeftIcon, Field, Input, PlusIcon, SaveStatusChip, Select, StatePill, Stepper, Switch, Textarea, cn, useBottomBar } from "@kiwiply/ui";
import { AdminSaveProvider, AdminPanel, useAdminSave, useNarrow } from "../common";
import { adminFetch } from "@/lib/admin-client";
import type { AdminOutcome } from "@/lib/admin-client";
import {
  INTERVALS,
  INTERVAL_LABEL,
  bpText,
  minorToInput,
  parseMinorInput,
  priceFor,
  statusLabel,
  type CatalogProduct,
  type CatalogService,
  type Interval,
  type Plan,
  type PlanComponent,
  type PlanVersion,
} from "@/lib/admin-plans";
import { PLAN_DOMAIN } from "./planStates";
import ComponentRow, { PRICED_ROLES } from "./ComponentRow";
import CommitInput from "./CommitInput";
import PlanPreviewPane from "./PlanPreviewPane";
import PresetsEditor from "./PresetsEditor";
import PriceCell from "./PriceCell";
import ServicePickerSheet from "./ServicePickerSheet";
import type { PickedService } from "./ServicePickerSheet";
import PublishControls from "./PublishControls";
import SeatRulesBlock from "./SeatRulesBlock";
import { usePlanDraft } from "./usePlanDraft";
import { usePlanPreview } from "./usePlanPreview";
import type { PreviewQuery } from "./usePlanPreview";

const STEPS = [
  { key: "identity", label: "Identity" },
  { key: "base", label: "Base & prices" },
  { key: "included", label: "Included" },
  { key: "addons", label: "Add-ons" },
  { key: "review", label: "Review" },
];

/** "10" or "7.5" percent as basis points (1000 / 750), or null when it is not a percentage. String work only. */
export function parsePercentBp(text: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?\s*%?$/.exec(text.trim());
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return bp <= 10_000 ? bp : null; // config-literal-ok: 100.00 % in basis points
}

interface EditorProps {
  plan: Plan;
  version: PlanVersion;
  products: CatalogProduct[];
}

/**
 * The plan editor (K4.2; docs/subscriptions/04 section 3): the composition of one version on the left, the server preview on the
 * right (a BottomSheet and a 5-step stepper on a phone). Every field autosaves to the DRAFT version (a draft is not money:
 * nothing reaches customers until it is published, and no action here calls Stripe). Prices write DRAFT price rows, with the margin
 * tick live as you type. The web adds nothing: every total, margin and lever comes from the API.
 */
export default function PlanEditor(props: EditorProps) {
  return (
    <AdminSaveProvider>
      <Inner {...props} />
    </AdminSaveProvider>
  );
}

function Inner({ plan: initialPlan, version: initialVersion, products }: EditorProps) {
  const router = useRouter();
  const a = useAdminSave();
  const narrow = useNarrow();
  const [plan, setPlan] = useState(initialPlan);
  const draft = usePlanDraft(plan.planKey, initialVersion);
  const ver = draft.version;
  const isDraft = ver.status === "DRAFT";
  const readOnly = !isDraft;
  const [step, setStep] = useState(0);
  const [picker, setPicker] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [needed, setNeeded] = useState<Record<string, string>>({});
  const [annualOff, setAnnualOff] = useState(false);
  const now = useNow();

  const currencies = useMemo(() => {
    const set = new Set<string>();
    ver.baseProduct?.prices.forEach((p) => set.add(p.currency));
    ver.components.forEach((c) => c.prices.forEach((p) => set.add(p.currency)));
    return set.size ? [...set].sort() : ["USD"]; // config-literal-ok: USD is the platform's default currency until the first price exists
  }, [ver.baseProduct, ver.components]);
  const [query, setQuery] = useState<PreviewQuery>({ interval: initialVersion.intervals[0] ?? "MONTH", currency: currencies[0], roster: "" });
  const preview = usePlanPreview(plan.planKey, ver.version, query, draft.tick);
  const names = useMemo(() => Object.fromEntries(ver.components.map((c) => [c.featureKey, c.name])), [ver.components]);
  const liveVersion = useMemo(() => plan.versions.find((v) => v.status === "PUBLISHED")?.version ?? null, [plan.versions]);
  const currency = query.currency;
  const org = ver.audience === "ORG";

  // ---- component list edits ---------------------------------------------------------------------------------------
  const productFor = (featureKey: string) => products.find((p) => p.featureKey === featureKey && p.active);
  const reorder = (list: PlanComponent[]) => list.map((c, i) => ({ ...c, sortOrder: i }));

  function editComponent(featureKey: string, patch: Partial<PlanComponent>): Promise<AdminOutcome> {
    const next = ver.components.map((c) => {
      if (c.featureKey !== featureKey) return c;
      const merged = { ...c, ...patch };
      if (patch.role && PRICED_ROLES.includes(patch.role) && merged.productId == null) {
        const prod = productFor(featureKey);
        if (prod) Object.assign(merged, { productId: prod.id, productCode: prod.code });
      }
      return merged;
    });
    return draft.putComponents(next);
  }
  function removeComponent(featureKey: string) {
    void draft.putComponents(reorder(ver.components.filter((c) => c.featureKey !== featureKey)));
  }
  function moveComponent(featureKey: string, dir: -1 | 1) {
    const list = [...ver.components];
    const i = list.findIndex((c) => c.featureKey === featureKey);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void draft.putComponents(reorder(list));
  }
  async function addServices(picks: PickedService[]) {
    const adds: PlanComponent[] = picks
      .filter((p) => !ver.components.some((c) => c.featureKey === p.service.key))
      .map((p, i) => fromService(p.service, p.role, ver.components.length + i, PRICED_ROLES.includes(p.role) ? productFor(p.service.key) : undefined));
    if (adds.length === 0) return;
    setNeeded((n) => ({ ...n, ...Object.fromEntries(picks.filter((p) => p.neededBy).map((p) => [p.service.key, p.neededBy as string])) }));
    await draft.putComponents([...ver.components, ...adds]);
  }

  // ---- plan-level details (HIGH: name, badge, public, eligibility need a reason) --------------------------------------
  const [name, setName] = useState(plan.name);
  const [badge, setBadge] = useState(plan.badge ?? "");
  const [description, setDescription] = useState(plan.description ?? "");
  const [isPublic, setIsPublic] = useState(plan.publicPlan);
  const [countries, setCountries] = useState(listText(plan.eligibility?.countries));
  const [verification, setVerification] = useState(typeof plan.eligibility?.verification === "string" ? plan.eligibility.verification : "");
  const dirty = name !== plan.name || badge !== (plan.badge ?? "") || description !== (plan.description ?? "") || isPublic !== plan.publicPlan || countries !== listText(plan.eligibility?.countries) || verification !== (typeof plan.eligibility?.verification === "string" ? plan.eligibility.verification : "");

  function saveDetails() {
    const eligibility: Record<string, unknown> = { ...(plan.eligibility ?? {}) };
    const codes = countries.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (codes.length) eligibility.countries = codes;
    else delete eligibility.countries;
    if (verification.trim()) eligibility.verification = verification.trim();
    else delete eligibility.verification;
    a.askReason({
      title: `Save the details of ${plan.name}?`,
      body: "Name, badge, description, visibility and eligibility are shown to buyers once a version is live. The change is recorded in the audit log.",
      confirmLabel: "Save details",
      tone: "primary",
      run: async (reason) => {
        const res = await adminFetch<Plan>("PUT", `/plans/${plan.planKey}`, {
          name: name.trim(),
          badge: badge.trim() || null,
          description: description.trim() || null,
          publicPlan: isPublic,
          eligibility: Object.keys(eligibility).length ? eligibility : null,
          expectedUpdatedAt: plan.updatedAt,
          reason,
        });
        if (!res.ok) return res;
        setPlan((p) => ({ ...res.data, versions: p.versions }));
        return { ok: true };
      },
    });
  }

  function discard() {
    a.askReason({
      title: `Discard draft v${ver.version} of ${plan.name}?`,
      body: "The draft and its unpublished prices are deleted. Published versions are not touched.",
      confirmLabel: "Discard draft",
      run: async (reason) => {
        const res = await adminFetch("POST", `/plans/${plan.planKey}/versions/${ver.version}/discard`, { reason });
        if (!res.ok) return res;
        router.push("/admin/pricing/plans");
        return { ok: true };
      },
    });
  }

  function newVersion() {
    a.askReason({
      title: `Start a new version of ${plan.name}?`,
      body: `A new draft is copied from v${ver.version}. Nothing reaches customers until you publish it.`,
      confirmLabel: "Start draft",
      tone: "primary",
      run: async (reason) => {
        const res = await adminFetch<PlanVersion>("POST", `/plans/${plan.planKey}/versions`, { from: ver.version, reason });
        if (!res.ok) {
          if (res.code === "DRAFT_EXISTS") router.push("/admin/pricing/plans");
          return res;
        }
        router.push(`/admin/pricing/plans/${plan.planKey}/v/${res.data.version}`);
        return { ok: true };
      },
    });
  }

  /** The publish answered: this version is live now, the one before it is superseded. */
  function onPublished(v: PlanVersion) {
    draft.adopt(v);
    setPlan((p) => ({ ...p, status: "PUBLISHED", versions: p.versions.map((x) => (x.version === v.version ? v : x.status === "PUBLISHED" ? { ...x, status: "SUPERSEDED" } : x)) }));
    router.refresh();
  }

  async function setIntervals(i: Interval, on: boolean) {
    const next = INTERVALS.filter((x) => (x === i ? on : ver.intervals.includes(x)));
    if (next.length === 0) return;
    const out = await draft.patch({ intervals: next });
    if (!out.ok && out.code === "INTERVAL_NOT_ENABLED" && i === "YEAR") setAnnualOff(true);
  }

  const basePrice = (interval: string) => priceFor(ver.baseProduct?.prices, interval, currency);
  const baseProductId = ver.baseProduct?.id ?? null;
  const baseCandidates = products.filter((p) => p.kind === "SUBSCRIPTION" && p.active && (p.soldTo === "BOTH" || p.soldTo === ver.audience));

  const included = ver.components.filter((c) => c.role === "INCLUDED" || c.role === "SEAT_INCLUDED");
  const optional = ver.components.filter((c) => c.role === "OPTIONAL" || c.role === "SEAT_OPTIONAL");
  const seatAndFees = ver.components.filter((c) => c.role === "SEAT_BASE" || c.role === "FEE");

  const row = (c: PlanComponent) => (
    <ComponentRow
      key={c.featureKey}
      c={c}
      index={ver.components.indexOf(c)}
      count={ver.components.length}
      audience={ver.audience}
      currency={currency}
      versionIntervals={ver.intervals}
      product={products.find((p) => p.id === c.productId) ?? productFor(c.featureKey)}
      disabled={readOnly}
      neededBy={needed[c.featureKey]}
      onEdit={(patch) => editComponent(c.featureKey, patch)}
      onRemove={() => removeComponent(c.featureKey)}
      onMove={(dir) => moveComponent(c.featureKey, dir)}
      onPrice={(interval, minor) => {
        const productId = c.productId ?? productFor(c.featureKey)?.id;
        return productId ? draft.createPrice(productId, interval, minor, currency) : Promise.resolve({ ok: false, status: 0, code: null, error: "This service has no product to price.", extra: {} } as AdminOutcome);
      }}
    />
  );

  const identity = (
    <Group title="Identity" id="identity">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Key" hint="Never changes after the first publish.">
          <Input value={plan.planKey} disabled readOnly aria-label="Plan key" />
        </Field>
        <Field label="Audience" hint="Fixed after creation.">
          <Input value={ver.audience === "ORG" ? "Organization" : "Individual"} disabled readOnly aria-label="Audience" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Plan name" />
        </Field>
        <Field label="Badge" hint="For example Most popular.">
          <Input value={badge} onChange={(e) => setBadge(e.target.value)} aria-label="Badge" />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} aria-label="Description" />
        </Field>
        <Field label="Countries" hint="Comma separated ISO codes. Blank = everywhere.">
          <Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="all" aria-label="Eligible countries" />
        </Field>
        <Field label="Verification" hint="Blank = none.">
          <Input value={verification} onChange={(e) => setVerification(e.target.value)} placeholder="none" aria-label="Verification required" />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Switch checked={isPublic} onCheckedChange={setIsPublic} label="Public (shown on the pricing page once live)" />
        <Button type="button" variant="accent-soft" disabled={!dirty} onClick={saveDetails} className="min-h-11 sm:min-h-0">
          Save details…
        </Button>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-1 text-[12.5px] font-semibold text-ink">Intervals</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {INTERVALS.filter((i) => !(org && i === "QUARTER")).map((i) => {
            const yearBlocked = i === "YEAR" && annualOff && !ver.intervals.includes("YEAR");
            return (
              <label key={i} className="inline-flex min-h-11 items-center gap-2 text-[13.5px] sm:min-h-0">
                <input type="checkbox" checked={ver.intervals.includes(i)} disabled={readOnly || yearBlocked} onChange={(e) => void setIntervals(i, e.target.checked)} />
                {INTERVAL_LABEL[i]}
                {yearBlocked && <span className="text-[12px] text-v2-muted">(annual billing is off in settings)</span>}
              </label>
            );
          })}
        </div>
        <Field label="Summary" hint="One line shown with the version in History." className="mt-3">
          <CommitInput label="Version summary" value={ver.summary ?? ""} disabled={readOnly} onCommit={(t) => draft.patch({ summary: t || null })} />
        </Field>
      </div>
    </Group>
  );

  const baseBlock = (
    <Group title={org ? "Seat rules and fees" : "Base price"} id="base">
      {org ? (
        <SeatRulesBlock version={ver} products={products} disabled={readOnly} onPatch={(fields) => draft.patch(fields)} rows={seatAndFees.map(row)} />
      ) : (
        <>
          <Field label="Base product" hint="A subscription product of the catalog.">
            <Select
              value={baseProductId == null ? "" : String(baseProductId)}
              disabled={readOnly}
              onChange={(v) => void draft.patch({ baseProductId: v ? Number(v) : null })}
              aria-label="Base product"
              placeholder="Pick the base product"
              options={baseCandidates.map((p) => ({ value: String(p.id), label: `${p.name} (${p.code})` }))}
            />
          </Field>
          {baseProductId == null ? (
            <p className="mt-3 text-[13px] text-v2-muted">Pick the base product to set its prices.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {ver.intervals.map((i) => (
                <div key={i} className="min-w-0 text-[12.5px] font-semibold text-ink">
                  <span className="mb-1 block">{INTERVAL_LABEL[i]}</span>
                  <PriceCell
                    label={`${plan.name} ${INTERVAL_LABEL[i].toLowerCase()} price`}
                    currency={currency}
                    interval={i}
                    audience={ver.audience}
                    kind="BASE"
                    aiBudgetCents={i === "MONTH" ? ver.aiBudgetCapCents : (ver.aiWindows?.[i] ?? null)}
                    price={basePrice(i)}
                    disabled={readOnly || i === "YEAR"}
                    disabledReason={i === "YEAR" ? "Annual follows the discount below" : undefined}
                    onCommit={(minor) => draft.createPrice(baseProductId, i, minor, currency)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
        <Field label="AI budget cap / month" hint="The most AI one subscriber can cost in a month.">
          <CommitInput
            label="AI budget cap per month"
            value={minorToInput(ver.aiBudgetCapCents, currency)}
            inputMode="decimal"
            disabled={readOnly}
            validate={(t) => (parseMinorInput(t, currency) === null ? "Type an amount like 3.00." : null)}
            onCommit={(t) => draft.patch({ aiBudgetCapCents: parseMinorInput(t, currency) })}
          />
        </Field>
        {ver.intervals.includes("QUARTER") && (
          <Field label="AI budget cap / quarter" hint="Blank = same as the monthly cap.">
            <CommitInput
              label="AI budget cap per quarter"
              value={ver.aiWindows?.QUARTER == null ? "" : minorToInput(ver.aiWindows.QUARTER, currency)}
              inputMode="decimal"
              disabled={readOnly}
              validate={(t) => (t === "" || parseMinorInput(t, currency) !== null ? null : "Type an amount like 8.00.")}
              onCommit={(t) => draft.patch({ aiWindows: t === "" ? null : { ...(ver.aiWindows ?? {}), QUARTER: parseMinorInput(t, currency) } })}
            />
          </Field>
        )}
        {ver.intervals.includes("YEAR") && (
          <Field label="Annual discount (%)" hint={`Blank = the global default${ver.annualDiscountBp != null ? ` (now ${bpText(ver.annualDiscountBp)})` : ""}.`}>
            <CommitInput
              label="Annual discount percent"
              value={ver.annualDiscountBp == null ? "" : String(ver.annualDiscountBp / 100)}
              inputMode="decimal"
              disabled={readOnly}
              validate={(t) => (t === "" || parsePercentBp(t) !== null ? null : "A percentage from 0 to 100.")}
              onCommit={(t) => draft.patch({ annualDiscountBp: t === "" ? null : parsePercentBp(t) })}
            />
          </Field>
        )}
      </div>
    </Group>
  );

  const includedBlock = (
    <Group
      title={`Included services (${included.length})`}
      id="included"
      action={
        <Button type="button" variant="accent-soft" disabled={readOnly} onClick={() => setPicker(true)} className="min-h-11 gap-1 sm:min-h-0">
          <PlusIcon size={14} /> Add service
        </Button>
      }
    >
      {included.length === 0 ? <p className="text-[13px] text-v2-muted">Nothing included yet. Add the services every subscriber gets.</p> : <ul className="space-y-3">{included.map(row)}</ul>}
    </Group>
  );

  const addonsBlock = (
    <Group
      title={`Optional add-ons (${optional.length})`}
      id="addons"
      action={
        <Button type="button" variant="accent-soft" disabled={readOnly} onClick={() => setPicker(true)} className="min-h-11 gap-1 sm:min-h-0">
          <PlusIcon size={14} /> Add add-on
        </Button>
      }
    >
      {optional.length === 0 ? <p className="text-[13px] text-v2-muted">No add-ons. An add-on needs a price before buyers see it.</p> : <ul className="space-y-3">{optional.map(row)}</ul>}
      {!org && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[12.5px] font-semibold text-ink">Presets (shortcuts)</p>
          <PresetsEditor presets={ver.presets ?? []} optional={optional} disabled={readOnly} onSave={(next) => draft.patch({ presets: next })} />
        </div>
      )}
    </Group>
  );

  const previewPane = (
    <PlanPreviewPane
      state={preview}
      query={query}
      onQuery={(patch) => setQuery((q) => ({ ...q, ...patch }))}
      intervals={ver.intervals}
      currencies={currencies}
      version={ver.version}
      liveVersion={liveVersion}
      names={names}
    />
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <Link href="/admin/pricing/plans" className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-v2-blue-ink hover:underline sm:min-h-0">
          <ChevronLeftIcon size={14} /> Plans
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 font-display text-[22px] font-extrabold leading-tight text-ink sm:text-[26px]">
          {plan.name} · v{ver.version} <StatePill domain={PLAN_DOMAIN} state={ver.status} label={statusLabel(ver.status)} />
        </h1>
        <p className="text-[12.5px] text-v2-muted">
          {liveVersion != null ? `Live: v${liveVersion}${ver.version === liveVersion ? " (this version)" : ""}` : "Not live yet"}
          {" · "}
          {plan.planKey}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SaveStatusChip status={draft.status} savedAt={draft.savedAt} now={now} error={draft.error} onRetry={() => void draft.reload()} />
        {isDraft && (
          <Button type="button" variant="ghost" onClick={discard} className="min-h-11 sm:min-h-0">
            Discard draft
          </Button>
        )}
        <PublishControls plan={plan} version={ver} preview={preview} onPublished={onPublished} />
      </div>
    </div>
  );

  const banners = (
    <>
      {readOnly && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-paper-2 px-4 py-3 text-[13.5px]">
          <span>
            v{ver.version} is {statusLabel(ver.status).toLowerCase()} and read-only. Changes go into a new version.
          </span>
          <Button type="button" variant="primary" onClick={newVersion} className="min-h-11 sm:min-h-0">
            New version
          </Button>
        </div>
      )}
      {preview.preview?.impact && !preview.preview.impact.stripeEnabled && (
        <p role="status" className="rounded-xl border border-line bg-brown-soft px-4 py-3 text-[13.5px] text-brown-deep">
          Stripe is not configured here. Drafts and prices save normally; publishing records the version but creates no Stripe prices until a key is set.
        </p>
      )}
      {draft.conflict && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger bg-danger/10 px-4 py-3 text-[13.5px] text-danger-text">
          <span>Somebody else changed this draft. Reload to see their changes before you edit more.</span>
          <Button type="button" variant="accent-soft" onClick={() => void draft.reload()} className="min-h-11 sm:min-h-0">
            Reload
          </Button>
        </div>
      )}
      {draft.error && !draft.conflict && (
        <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-4 py-2 text-[13px] text-danger-text">
          {draft.error}
        </p>
      )}
    </>
  );

  const bar = useRef<HTMLDivElement>(null);
  useBottomBar(bar);
  const w = preview.preview?.worstCase;

  if (narrow) {
    const sections = [identity, baseBlock, includedBlock, addonsBlock];
    return (
      <div className="mx-auto max-w-[1500px] space-y-3 pb-28">
        {header}
        {banners}
        <Stepper label="Plan editor steps" steps={STEPS} current={step} />
        {step < 4 ? sections[step] : <AdminPanel title="Review">{previewPane}</AdminPanel>}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="min-h-11">
            Back
          </Button>
          <Button type="button" variant="accent-soft" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} className="min-h-11">
            Next
          </Button>
        </div>
        <div ref={bar} className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-paper px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          <p aria-live="polite" className={cn("text-[13px] font-semibold", w && !w.ok ? "text-danger-text" : "text-ink")}>
            {w ? `Worst case ${bpText(w.marginBp)} ${w.ok ? "✓" : "✗"}` : "Worst case …"}
          </p>
          <Button type="button" variant="primary" onClick={() => setReviewOpen(true)} className="min-h-11">
            Review
          </Button>
        </div>
        <BottomSheet open={reviewOpen} onClose={() => setReviewOpen(false)} title="Preview" id="plan-preview-sheet">
          {previewPane}
        </BottomSheet>
        <ServicePickerSheet open={picker} onClose={() => setPicker(false)} audience={ver.audience} existing={new Set(ver.components.map((c) => c.featureKey))} onAdd={addServices} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      {header}
      {banners}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {identity}
          {baseBlock}
          {includedBlock}
          {addonsBlock}
        </div>
        <aside aria-label="Preview" className="sticky top-4 rounded-2xl border border-line bg-paper p-4 shadow-v2-soft">
          <h2 className="mb-2 font-display text-[16px] font-bold text-ink">Preview (server-computed)</h2>
          {previewPane}
        </aside>
      </div>
      <ServicePickerSheet open={picker} onClose={() => setPicker(false)} audience={ver.audience} existing={new Set(ver.components.map((c) => c.featureKey))} onAdd={addServices} />
    </div>
  );
}

function Group({ title, id, action, children }: { title: string; id: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-2xl border border-line bg-paper p-4 shadow-v2-soft sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="font-display text-[16px] font-bold text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const NOW_TICK_MS = 30_000; // config-literal-ok: the "Saved 2 minutes ago" chip refreshes twice a minute

/** The clock for the save chip, refreshed on a timer (never read during render). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(t);
  }, []);
  return now;
}

const listText = (v: unknown): string => (Array.isArray(v) ? v.join(", ") : "");

/** A fresh component from a catalog service (the API's answer to the PUT replaces it with the priced, resolved one). */
function fromService(s: CatalogService, role: string, sortOrder: number, product?: CatalogProduct): PlanComponent {
  return {
    featureKey: s.key,
    role,
    name: s.name,
    category: s.category,
    unit: s.usageUnit,
    productId: product?.id ?? null,
    productCode: product?.code ?? null,
    allowance: s.defaultAllowance,
    allowanceOverride: null,
    limitKey: s.limitKey,
    limitOverrides: null,
    defaultQuantity: 1,
    maxQuantity: null,
    componentDiscountBp: null,
    sortOrder,
    marketingLabel: null,
    aiBudgetCents: s.aiBudgetCents ?? 0,
    prices: [],
  };
}
