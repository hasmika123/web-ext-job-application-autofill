"use client";

import { useCallback, useRef, useState } from "react";
import type { SaveStatus } from "@kiwiply/ui";
import { adminFetch } from "@/lib/admin-client";
import type { AdminOutcome } from "@/lib/admin-client";
import type { PlanComponent, PlanVersion } from "@/lib/admin-plans";

/** One row of PUT .../components, the shape the API takes (a full replacement list). */
export interface ComponentRequest {
  featureKey: string;
  role: string;
  productId: number | null;
  allowanceOverride: number | null;
  limitOverrides: unknown;
  defaultQuantity: number;
  maxQuantity: number | null;
  componentDiscountBp: number | null;
  sortOrder: number;
  marketingLabel: string | null;
}

/** The request row for a component the page already has (so an edit of one row re-sends all the others unchanged). */
export function toRequest(c: PlanComponent, index: number): ComponentRequest {
  return {
    featureKey: c.featureKey,
    role: c.role,
    productId: c.productId,
    allowanceOverride: c.allowanceOverride,
    limitOverrides: c.limitOverrides ?? null,
    defaultQuantity: c.defaultQuantity,
    maxQuantity: c.maxQuantity,
    componentDiscountBp: c.componentDiscountBp,
    sortOrder: index,
    marketingLabel: c.marketingLabel,
  };
}

export interface PlanDraft {
  version: PlanVersion;
  status: SaveStatus;
  savedAt: number | null;
  error: string | null;
  /** 409 VERSION_CONFLICT: somebody else changed this draft; the page offers a reload. */
  conflict: boolean;
  /** Bumps after every accepted write, so the preview and the margin ticks re-read. */
  tick: number;
  /** Replace the DRAFT fields present in `fields` (PATCH). */
  patch: (fields: Record<string, unknown>) => Promise<AdminOutcome>;
  /** Replace the whole component list (PUT). `next` is the PlanComponent list to show meanwhile. */
  putComponents: (next: PlanComponent[]) => Promise<AdminOutcome>;
  /** Create a DRAFT price row for a product (POST /catalog/prices), then re-read the version. */
  createPrice: (productId: number, interval: string, amountMinor: number, currency: string) => Promise<AdminOutcome>;
  /** Re-read the version from the API (after a conflict, or after a publish). */
  reload: () => Promise<void>;
  /** Swap the version in without a request (the publish flow returns the published one). */
  adopt: (v: PlanVersion) => void;
}

/**
 * The draft writer of the plan editor (K4.2). Every change is sent to the API as soon as it is made: one request at a time (a
 * queue, so two quick edits never race), the next body is built when its turn comes with the freshest `updatedAt`
 * (`expectedUpdatedAt`, so another admin's edit is a 409 instead of a silent overwrite), and the response replaces the page's copy
 * of the version only when nothing newer is waiting. A draft is not money: nothing here calls Stripe.
 */
export function usePlanDraft(planKey: string, initial: PlanVersion): PlanDraft {
  const [version, setVersionState] = useState(initial);
  const ref = useRef(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [tick, setTick] = useState(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const waiting = useRef(0);

  const setVersion = useCallback((v: PlanVersion) => {
    ref.current = v;
    setVersionState(v);
  }, []);
  const path = `/plans/${planKey}/versions/${initial.version}`;

  /** Runs `fn` after everything queued before it; reports the outcome on the status chip. */
  const enqueue = useCallback((fn: () => Promise<{ outcome: AdminOutcome; next?: PlanVersion }>): Promise<AdminOutcome> => {
    waiting.current += 1;
    setStatus("saving");
    const run = async (): Promise<AdminOutcome> => {
      const { outcome, next } = await fn();
      waiting.current -= 1;
      if (next) {
        // always remember the newest updatedAt (the next body needs it); show the whole response only when nothing newer is queued
        if (waiting.current === 0) setVersion(next);
        else setVersion({ ...ref.current, updatedAt: next.updatedAt });
      }
      if (outcome.ok) {
        setError(null);
        setSavedAt(Date.now());
        setTick((t) => t + 1);
        if (waiting.current === 0) setStatus("saved");
      } else if (outcome.code === "VERSION_CONFLICT") {
        setConflict(true);
        setStatus("conflict");
      } else {
        setError(outcome.error);
        if (waiting.current === 0) setStatus("error");
      }
      return outcome;
    };
    const p = chain.current.then(run, run);
    chain.current = p;
    return p;
  }, [setVersion]);

  const patch = useCallback(
    (fields: Record<string, unknown>) => {
      setVersion({ ...ref.current, ...(fields as Partial<PlanVersion>) });
      return enqueue(async () => {
        const res = await adminFetch<PlanVersion>("PATCH", path, { ...fields, expectedUpdatedAt: ref.current.updatedAt });
        return res.ok ? { outcome: { ok: true } as AdminOutcome, next: res.data } : { outcome: res };
      });
    },
    [enqueue, path, setVersion],
  );

  const putComponents = useCallback(
    (next: PlanComponent[]) => {
      setVersion({ ...ref.current, components: next });
      return enqueue(async () => {
        const res = await adminFetch<PlanVersion>("PUT", `${path}/components`, { components: next.map(toRequest), expectedUpdatedAt: ref.current.updatedAt });
        return res.ok ? { outcome: { ok: true } as AdminOutcome, next: res.data } : { outcome: res };
      });
    },
    [enqueue, path, setVersion],
  );

  const reload = useCallback(async () => {
    const res = await adminFetch<PlanVersion>("GET", path);
    if (res.ok) {
      setVersion(res.data);
      setConflict(false);
      setError(null);
      setStatus("saved");
      setTick((t) => t + 1);
    } else {
      setError(res.error);
    }
  }, [path, setVersion]);

  const createPrice = useCallback(
    (productId: number, interval: string, amountMinor: number, currency: string) =>
      enqueue(async () => {
        const made = await adminFetch("POST", "/catalog/prices", {
          productId,
          audience: ref.current.audience,
          interval,
          amountMinor,
          currency,
          reason: `Plan builder draft price for ${planKey} v${initial.version}`,
        });
        if (!made.ok) return { outcome: made };
        const fresh = await adminFetch<PlanVersion>("GET", path);
        return fresh.ok ? { outcome: { ok: true } as AdminOutcome, next: fresh.data } : { outcome: fresh };
      }),
    [enqueue, initial.version, path, planKey],
  );

  return { version, status, savedAt, error, conflict, tick, patch, putComponents, createPrice, reload, adopt: setVersion };
}
