"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dialog, ErrorState, Field, GlobeIcon, Input, LockIcon, Select, Skeleton, Textarea, useToast } from "@kiwiply/ui";
import { CARD } from "@/components/ent/dashboard/parts";
import { fetchOrgSettings, saveGeneral, saveSecurity, type OrgSettings, type SettingsResult } from "@/lib/ent/org-settings";

/**
 * The General and Security sections of Organization Settings (X2.9). General: the legal name is shown but never editable; the display name, time zone
 * (IANA), default language and the contact e-mail (shown on the support page) are saved together with one button. Security: the idle-session timeout and
 * the password minimum, each inside the bounds the platform allows (shown beside the field), saved only with a REASON, and only after a confirm
 * dialog says what changes. The API checks every bound, the reason and the audit; this page draws what it answers.
 */
export default function GeneralSecuritySettings({ orgId }: { orgId: number }) {
  const toast = useToast();
  const [data, setData] = useState<OrgSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed" | "denied">("loading");

  const [displayName, setDisplayName] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  const [locale, setLocale] = useState("en");
  const [contact, setContact] = useState("");
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [savingGeneral, setSavingGeneral] = useState(false);

  const [timeout, setTimeoutText] = useState("");
  const [minLen, setMinLen] = useState("");
  const [reason, setReason] = useState("");
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);

  const adopt = useCallback((s: OrgSettings) => {
    setData(s);
    setDisplayName(s.general.displayName);
    setTimeZone(s.general.timeZone);
    setLocale(s.general.locale);
    setContact(s.general.contactEmail ?? "");
    setTimeoutText(s.security.sessionTimeoutMinutes === null ? "" : String(s.security.sessionTimeoutMinutes));
    setMinLen(s.security.passwordMinLength === null ? "" : String(s.security.passwordMinLength));
    setReason("");
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    const r = await fetchOrgSettings(orgId);
    if (r.kind === "OK") {
      adopt(r.settings);
      setStatus("ready");
    } else setStatus(r.kind === "DENIED" ? "denied" : "failed");
  }, [orgId, adopt]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const zones = useMemo(() => {
    let all: string[] = [];
    try {
      all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      all = [];
    }
    if (!all.includes("UTC")) all = ["UTC", ...all];
    if (data && !all.includes(data.general.timeZone)) all = [data.general.timeZone, ...all];
    return all;
  }, [data]);

  if (status === "loading") return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (status === "denied") return null; // the page's own section already says it
  if (status === "failed" || !data) return <ErrorState what="the general and security settings" description="Please refresh in a moment." onRetry={() => void load()} />;

  const b = data.security.bounds;
  const outcome = (r: SettingsResult, setError: (m: string | null) => void, done: string): boolean => {
    if (r.kind === "OK") {
      adopt(r.settings);
      setError(null);
      toast({ title: done, variant: "success" });
      return true;
    }
    if (r.kind === "DEMO") return false; // the shell's one demo notice already says it
    if (r.kind === "DENIED") void load();
    setError(r.kind === "INVALID" ? r.message : "That change wasn't saved. Nothing changed.");
    return false;
  };

  const generalDirty =
    displayName.trim() !== data.general.displayName || timeZone !== data.general.timeZone || locale !== data.general.locale || contact.trim() !== (data.general.contactEmail ?? "");

  const submitGeneral = async () => {
    setSavingGeneral(true);
    const r = await saveGeneral(orgId, { displayName: displayName.trim(), timeZone, locale, contactEmail: contact.trim() });
    setSavingGeneral(false);
    outcome(r, setGeneralError, "General settings saved");
  };

  const parsed = (text: string): number | null | "bad" => {
    const t = text.trim();
    if (t === "") return null;
    return /^\d{1,7}$/.test(t) ? Number(t) : "bad";
  };
  const tOut = parsed(timeout);
  const mOut = parsed(minLen);
  const securityChanged = tOut !== "bad" && mOut !== "bad" && (tOut !== data.security.sessionTimeoutMinutes || mOut !== data.security.passwordMinLength);
  const reasonOk = reason.trim().length >= data.security.reasonMinChars;

  const review = () => {
    if (tOut === "bad" || mOut === "bad") return setSecurityError("Use whole numbers, or leave a field empty for the platform default.");
    if (tOut !== null && (tOut < b.sessionTimeoutMin || tOut > b.sessionTimeoutMax)) return setSecurityError(`Session timeout must be between ${b.sessionTimeoutMin} and ${b.sessionTimeoutMax} minutes.`);
    if (mOut !== null && (mOut < b.passwordMinFloor || mOut > b.passwordMinCeiling)) return setSecurityError(`Password minimum must be between ${b.passwordMinFloor} and ${b.passwordMinCeiling} characters.`);
    setSecurityError(null);
    setConfirm(true);
  };

  const submitSecurity = async () => {
    setConfirm(false);
    setSavingSecurity(true);
    const r = await saveSecurity(orgId, { sessionTimeoutMinutes: tOut === "bad" ? null : tOut, passwordMinLength: mOut === "bad" ? null : mOut, reason: reason.trim() });
    setSavingSecurity(false);
    outcome(r, setSecurityError, "Security settings saved");
  };

  const describe = (v: number | null | "bad", unit: string) => (v === null || v === "bad" ? "the platform default" : `${v} ${unit}`);

  return (
    <>
      <section aria-labelledby="org-set-general" className={`${CARD} p-5`} data-org-general>
        <div className="flex items-center gap-2">
          <GlobeIcon size={18} className="text-muted" />
          <h2 id="org-set-general" className="text-[16px] font-bold text-ink">
            General
          </h2>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" hint="The name on your agreement. Ask support to change it.">
            <Input value={data.general.legalName} readOnly disabled />
          </Field>
          <Field label="Display name" hint="Shown to your people on the sign-in page and in e-mails.">
            <Input value={displayName} maxLength={120} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Time zone" hint="Used for dates and times your organization sees.">
            <Select aria-label="Time zone" value={timeZone} onChange={setTimeZone} options={zones.map((z) => ({ value: z, label: z }))} />
          </Field>
          <Field label="Default language">
            <Select aria-label="Default language" value={locale} onChange={setLocale} options={data.locales.map((l) => ({ value: l, label: l }))} />
          </Field>
          <Field label="Contact e-mail" hint="Shown on your support page so people know where to write. Use a shared work address.">
            <Input type="email" value={contact} maxLength={254} placeholder="support@yourcompany.com" onChange={(e) => setContact(e.target.value)} />
          </Field>
        </div>
        {generalError ? (
          <p role="alert" className="mt-3 text-[13px] text-red-600" data-general-error>
            {generalError}
          </p>
        ) : null}
        <div className="mt-4">
          <Button onClick={() => void submitGeneral()} disabled={!generalDirty || savingGeneral} data-save-general>
            Save changes
          </Button>
        </div>
      </section>

      <section aria-labelledby="org-set-security" className={`${CARD} p-5`} data-org-security>
        <div className="flex items-center gap-2">
          <LockIcon size={18} className="text-muted" />
          <h2 id="org-set-security" className="text-[16px] font-bold text-ink">
            Security
          </h2>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Sign out after being idle (minutes)" hint={`Between ${b.sessionTimeoutMin} and ${b.sessionTimeoutMax}. Empty keeps the platform default.`}>
            <Input inputMode="numeric" value={timeout} placeholder="Platform default" onChange={(e) => setTimeoutText(e.target.value)} />
          </Field>
          <Field label="Minimum password length" hint={`Between ${b.passwordMinFloor} and ${b.passwordMinCeiling}. Empty keeps the platform default.`}>
            <Input inputMode="numeric" value={minLen} placeholder="Platform default" onChange={(e) => setMinLen(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Reason for the change" required hint={`At least ${data.security.reasonMinChars} characters. It is kept in your audit log.`}>
            <Textarea rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        {securityError ? (
          <p role="alert" className="mt-3 text-[13px] text-red-600" data-security-error>
            {securityError}
          </p>
        ) : null}
        <div className="mt-4">
          <Button onClick={review} disabled={!securityChanged || !reasonOk || savingSecurity} data-save-security>
            Review and save
          </Button>
        </div>
      </section>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Change security settings?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} className="max-sm:min-h-11" data-confirm-cancel>
              Cancel
            </Button>
            <Button className="max-sm:min-h-11" onClick={() => void submitSecurity()} data-confirm-security>
              Save security settings
            </Button>
          </>
        }
      >
        <div className="text-sm text-ink-soft" data-confirm-security-copy>
          <p>Idle sign-out becomes {describe(tOut, "minutes")}. Minimum password length becomes {describe(mOut, "characters")}.</p>
          <p className="mt-2">People signed in now keep their session until it next renews. This change is recorded in your audit log with your reason.</p>
        </div>
      </Dialog>
    </>
  );
}
