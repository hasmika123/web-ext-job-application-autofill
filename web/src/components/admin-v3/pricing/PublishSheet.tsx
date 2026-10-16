"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Spinner, Textarea, useToast } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import type { AdminFail } from "@/lib/admin-client";
import { newIdempotencyKey, failingChecks, type CompareResult, type Plan, type PlanPreview, type PlanVersion } from "@/lib/admin-plans";
import { SheetFrame, reasonOk, reasonProblem } from "../common/ReasonSheet";
import ChecksTable, { FailureLine } from "./ChecksTable";
import ImpactBlock from "./ImpactBlock";
import VersionDiff from "./VersionDiff";

export interface PublishSheetProps {
  open: boolean;
  onClose: () => void;
  plan: Plan;
  version: PlanVersion;
  preview: PlanPreview | null;
  /** The live (published) version number to diff against, or null for a first publish. */
  liveVersion: number | null;
  onPublished: (v: PlanVersion) => void;
}

/** A refusal in words the admin can act on; margin failures list the rows with their levers. */
function Refusal({ fail, currency }: { fail: AdminFail; currency: string }) {
  const checks = Array.isArray(fail.extra.checks) ? (fail.extra.checks as Record<string, unknown>[]) : [];
  return (
    <div role="alert" className="space-y-1 rounded-xl border border-danger bg-danger/10 p-3 text-[13px] text-danger-text" data-publish-error={fail.code ?? fail.status}>
      <p className="font-semibold">{fail.error}</p>
      {fail.code === "MARGIN_BELOW_FLOOR" && fail.extra.overrideAllowed === false && <p>This failure cannot be overridden: a discounted or yearly row has to pass on its own.</p>}
      {fail.code === "BILLING_DISABLED" && <p>Stripe is not configured here. Drafts stay editable.</p>}
      {fail.code === "STRIPE_ERROR" && <p>Nothing was published: a Stripe step failed before the commit. You can try again; the same key is reused.</p>}
      {checks.length > 0 && (
        <ul className="space-y-1">
          {checks.map((c, i) => (
            <FailureLine key={i} item={c} currency={currency} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The publish confirmation (K4.4; 04 section 4, HIGH): the diff against the live version, every check, who is affected and which
 * Stripe prices would be created, then the typed version number and the reason. A failing check adds a required override reason.
 * One idempotency key per opening, so a retry after a dropped answer never publishes twice. Nothing is published until this sheet's
 * button is pressed; the API runs the whole publish in one transaction.
 */
export default function PublishSheet(props: PublishSheetProps) {
  const { open, onClose, plan, version } = props;
  return (
    <SheetFrame id="plan-publish-sheet" open={open} onClose={onClose} title={`Publish ${plan.name} v${version.version}?`}>
      {open && <PublishForm {...props} />}
    </SheetFrame>
  );
}

/** Mounted only while the sheet is open, so every opening starts clean (an empty form and a fresh idempotency key). */
function PublishForm({ onClose, plan, version, preview, liveVersion, onPublished }: PublishSheetProps) {
  const toast = useToast();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<AdminFail | null>(null);
  const nothingToCompare = liveVersion == null || liveVersion === version.version;
  const [compare, setCompare] = useState<CompareResult | null | "none">(nothingToCompare ? "none" : null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const currency = preview?.currency ?? "USD"; // config-literal-ok: the platform's default currency until a preview has been read
  const failing = failingChecks(preview);
  const needsOverride = failing > 0;

  useEffect(() => {
    if (nothingToCompare) return;
    let cancelled = false;
    void adminFetch<CompareResult>("GET", `/plans/${plan.planKey}/compare?a=${liveVersion}&b=${version.version}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setCompare(res.data);
      else {
        setCompare("none");
        setCompareError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [nothingToCompare, plan.planKey, version.version, liveVersion]);

  const ready = typed.trim() === String(version.version) && reasonOk(reason) && (!needsOverride || reasonOk(override)) && !busy;

  async function publish() {
    setBusy(true);
    setFail(null);
    const res = await adminFetch<PlanVersion>("POST", `/plans/${plan.planKey}/versions/${version.version}/publish`, {
      idempotencyKey,
      confirmVersion: Number(typed.trim()),
      reason: reason.trim(),
      ...(needsOverride ? { overrideReason: override.trim() } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setFail(res);
      return;
    }
    toast({
      title: `${plan.name} v${version.version} published`,
      description: "New sign-ups get it now. Subscribers on earlier versions keep theirs.",
      variant: "success",
      action: { label: "View", onClick: () => router.push(liveVersion != null ? `/admin/pricing/plans/${plan.planKey}/compare?a=${liveVersion}&b=${version.version}` : "/admin/pricing/plans") },
    });
    onPublished(res.data);
    onClose();
  }

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void publish();
        }}
      >
        <p className="text-[13.5px] text-ink">This makes v{version.version} what new buyers get. Nobody already subscribed is changed.</p>

        {preview?.impact && !preview.impact.stripeEnabled && (
          <p role="status" className="rounded-xl bg-brown-soft p-3 text-[13px] text-brown-deep">
            Stripe is not configured here. Publishing records the version and its prices, but creates no Stripe prices; they are created at a later publish once a Stripe key is set.
          </p>
        )}

        <section aria-label="Changes since the live version">
          <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-v2-muted">{liveVersion != null && liveVersion !== version.version ? `Changes since v${liveVersion}` : "First publish"}</h3>
          {compare === null ? (
            <div role="status" className="flex items-center gap-2 py-3 text-[13px] text-ink-soft">
              <Spinner /> Comparing with the live version…
            </div>
          ) : compare === "none" ? (
            <p className="text-[13px] text-v2-muted">{compareError ? `Couldn't compare: ${compareError}` : "There is no earlier live version, so everything in this version is new."}</p>
          ) : (
            <VersionDiff diff={compare.diff} aLabel={`v${compare.a}`} bLabel={`v${compare.b}`} currency={currency} />
          )}
        </section>

        {preview && (
          <section aria-label="Checks">
            <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-v2-muted">Checks</h3>
            <ChecksTable checks={preview.checks} currency={currency} />
            <p role="status" className={failing > 0 ? "mt-1 text-[12.5px] font-semibold text-danger-text" : "mt-1 text-[12.5px] font-semibold text-accent-deep"}>
              {failing > 0 ? `${failing} failing ${failing === 1 ? "check" : "checks"}: an override reason is required` : "All checks pass"}
            </p>
          </section>
        )}

        {preview?.impact && (
          <section aria-label="Impact">
            <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-v2-muted">Impact</h3>
            <ImpactBlock impact={preview.impact} version={version.version} liveVersion={liveVersion} />
          </section>
        )}

        <Field label={`Type the version number (${version.version}) to confirm`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" autoComplete="off" aria-label="Type the version number" />
        </Field>
        <Field label="Reason" hint="Recorded in the audit log (10 to 500 characters)." error={reasonProblem(reason) ?? undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why this version should go live" aria-label="Reason" />
        </Field>
        {needsOverride && (
          <Field label="Override reason" hint="A check fails. Say why it is acceptable to publish anyway (10 to 500 characters)." error={reasonProblem(override) ?? undefined}>
            <Textarea value={override} onChange={(e) => setOverride(e.target.value)} rows={2} aria-label="Override reason" />
          </Field>
        )}

        {fail && <Refusal fail={fail} currency={currency} />}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} className="min-h-11 sm:min-h-0">
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!ready} className="min-h-11 sm:min-h-0">
            {busy ? "Publishing…" : `Publish v${version.version}`}
          </Button>
        </div>
      </form>
    </>
  );
}
