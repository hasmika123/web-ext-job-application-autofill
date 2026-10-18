"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, StatePill, hasStateMap, registerStateMap, useToast } from "@kiwiply/ui";
import { isUpdate, parseTermsStatus, pendingDocuments } from "@/lib/terms-acceptance";
import type { TermsStatus } from "@/lib/terms-acceptance";

const DOMAIN = "terms-notice";
if (!hasStateMap(DOMAIN)) registerStateMap(DOMAIN, { UPDATED: "amber", CONFIRM: "grey" });

const SPRING = "/api/account/terms-acceptance";
const LATER_KEY = "kiwiply_terms_later";

function laterFor(version: string): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === version;
  } catch {
    return false;
  }
}

/**
 * The non-blocking banner of the signed-in app (T0.2): shown when the account has not accepted the terms of service or the privacy notice at the version now in force
 * (a new version was published, or the sign-up record is missing). Accept records the version in force; "Later" hides it until the next visit. It asks the API itself on
 * mount, so a normal page costs nothing extra on the server, and it stays away when the API cannot answer or the account is a demo (a demo cannot write).
 */
export default function TermsBanner({ demo = false }: { demo?: boolean }) {
  const toast = useToast();
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(SPRING, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const s = parseTermsStatus(await res.json().catch(() => null));
        if (alive && s && !s.upToDate && !laterFor(s.terms.currentVersion + "/" + s.privacy.currentVersion)) setStatus(s);
      } catch {
        /* the banner is a courtesy; no answer, no banner */
      }
    })();
    return () => {
      alive = false;
    };
  }, [demo]);

  if (!status) return null;
  const todo = pendingDocuments(status);
  if (!todo.length) return null;
  const update = isUpdate(status);

  async function accept() {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      for (const d of pendingDocuments(status)) {
        const res = await fetch(SPRING, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document: d.document, version: d.version, source: update ? "RECONFIRM" : "ACCOUNT" }),
        });
        if (!res.ok) {
          setError("Couldn't save that. Please try again.");
          return;
        }
      }
      setStatus(null);
      toast({ variant: "success", title: "Thanks, you're all set" });
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function later() {
    try {
      if (status) sessionStorage.setItem(LATER_KEY, status.terms.currentVersion + "/" + status.privacy.currentVersion);
    } catch {
      /* ignore */
    }
    setStatus(null);
  }

  const names = todo.map((d) => d.document);
  return (
    <div
      role="region"
      aria-label="Terms and privacy"
      data-testid="terms-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-paper-2 px-4 py-2.5 text-[13.5px] text-ink-soft"
    >
      <StatePill domain={DOMAIN} state={update ? "UPDATED" : "CONFIRM"} label={update ? "Updated" : "Please confirm"} />
      <span className="min-w-0 flex-1">
        {update ? "We updated our " : "Please confirm you accept our "}
        {names.includes("TERMS") && (
          <Link href="/terms" className="font-semibold text-ink underline">
            Terms of Service
          </Link>
        )}
        {names.length === 2 && " and "}
        {names.includes("PRIVACY") && (
          <Link href="/privacy" className="font-semibold text-ink underline">
            Privacy Policy
          </Link>
        )}
        .
        {error && (
          <span role="alert" className="ml-2 font-medium text-danger-text">
            {error}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <Button size="sm" variant="accent" disabled={busy} onClick={() => void accept()}>
          {busy ? "Saving…" : "Accept"}
        </Button>
        <button type="button" onClick={later} disabled={busy} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-ink-soft underline sm:min-h-0">
          Later
        </button>
      </span>
    </div>
  );
}
