"use client";

import { useId, useRef, useState } from "react";
import { Field, Input, MemberAvatar, SavedTick, useSavedFlash } from "@kiwiply/ui";
import { Button } from "@/components/ui";
import NotificationPrefsProvider from "@/components/app-v3/settings/NotificationPrefsProvider";
import NotificationsPanel from "@/components/app-v3/settings/NotificationsPanel";
import TimeZoneField from "@/components/app-v3/settings/TimeZoneField";
import { SettingsCard } from "@/components/app-v3/settings/panels";
import PageHeader from "@/components/ent/shell/ShellContext";
import { passwordProblem } from "@/components/ent/login/ForcedPasswordChange";
import { tenantPrefsView, type NotificationPrefsView } from "@/lib/notification-preferences";
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo";

/**
 * My profile (D6, 2026-10-16 audit; requirements section 7): the ONE basic profile every member has, on every role, at `/me`. Photo, name, work email, phone,
 * job title, time zone, language, notification preferences, account security and the roles they hold here. It is not the consultant's career profile (that is
 * the organization's record of their work, on `/w/consultant/profile`). Everything saves as you go (no Save buttons): a check appears beside what stuck.
 * The work email, job title, language and roles are read-only here: the sign-in address is the account's identity, and the title and roles are the
 * administrator's to set.
 */
export interface MyProfileProps {
  orgName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  langLabel: string;
  jobTitle: string | null;
  joinedAt: string | null;
  imageUrl: string | null;
  roles: { name: string; isPrimary: boolean }[];
  /** A shared demo account: shown, not saved. */
  demo: boolean;
  notificationPrefs: NotificationPrefsView | null;
}

type Edit = "firstName" | "lastName" | "phone";

export default function MyProfilePage(p: MyProfileProps) {
  const flash = useSavedFlash<string>();
  const [values, setValues] = useState({ firstName: p.firstName, lastName: p.lastName, phone: p.phone });
  const saved = useRef({ firstName: p.firstName, lastName: p.lastName, phone: p.phone });
  const [problem, setProblem] = useState<string | null>(null);
  const uid = useId();
  const fullName = `${values.firstName} ${values.lastName}`.trim() || p.email || "You";

  async function commit(key: Edit) {
    const next = values[key].trim();
    if (next === saved.current[key]) return;
    if (p.demo) {
      setProblem(DEMO_READ_ONLY_MESSAGE);
      setValues((v) => ({ ...v, [key]: saved.current[key] }));
      return;
    }
    setProblem(null);
    try {
      const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [key]: next }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setProblem(data.error ?? "That didn't save. Nothing changed.");
        setValues((v) => ({ ...v, [key]: saved.current[key] }));
        return;
      }
      saved.current[key] = next;
      setValues((v) => ({ ...v, [key]: next }));
      flash.flash(key);
    } catch {
      setProblem("Couldn't reach the server. Nothing changed.");
      setValues((v) => ({ ...v, [key]: saved.current[key] }));
    }
  }

  const editable = (key: Edit, label: string, extra: { autoComplete: string; inputMode?: "tel" | "text"; maxLength: number }) => (
    <Field
      label={label}
      htmlFor={`${uid}-${key}`}
      render={() => (
        <div className="flex items-center gap-2">
          <Input
            id={`${uid}-${key}`}
            name={key}
            value={values[key]}
            maxLength={extra.maxLength}
            autoComplete={extra.autoComplete}
            inputMode={extra.inputMode}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            onBlur={() => void commit(key)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <SavedTick flash={flash} id={key} />
        </div>
      )}
    >
      {null}
    </Field>
  );

  return (
    <NotificationPrefsProvider initial={p.notificationPrefs ? tenantPrefsView(p.notificationPrefs) : null} demo={p.demo}>
      <div data-my-profile className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-5">
        <PageHeader title="My profile" subtitle={`Your details at ${p.orgName}. Everything saves as you go.`} />
        <nav aria-label="My profile sections" className="flex flex-wrap gap-2 text-[13.5px] font-semibold">
          {[
            ["profile", "Profile"],
            ["notifications", "Notifications"],
            ["security", "Security"],
            ["organization", "Organization"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-ink-soft hover:bg-paper-2">
              {label}
            </a>
          ))}
        </nav>

        <SettingsCard id="profile" title="Profile">
          {p.demo && <p className="mb-3 rounded-[var(--radius)] border border-v2-amber/40 bg-v2-amber-soft px-3 py-2 text-[13px] font-medium text-v2-amber">{DEMO_READ_ONLY_MESSAGE}</p>}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <MemberAvatar name={fullName} src={p.imageUrl} size={88} />
              <p className="max-w-[9rem] text-center text-[12px] leading-snug text-muted">Changing your photo isn&apos;t available here yet.</p>
            </div>
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
              {editable("firstName", "First name", { autoComplete: "given-name", maxLength: 80 })}
              {editable("lastName", "Last name", { autoComplete: "family-name", maxLength: 80 })}
              <Field label="Work email" hint="This is how you sign in, so it can't be changed here.">
                <Input value={p.email ?? ""} readOnly aria-readonly="true" />
              </Field>
              {editable("phone", "Phone (optional)", { autoComplete: "tel", inputMode: "tel", maxLength: 40 })}
              <Field label="Job title" hint="Set by your administrator.">
                <Input value={p.jobTitle ?? ""} placeholder="Not set" readOnly aria-readonly="true" />
              </Field>
              <Field label="Language">
                <Input value={p.langLabel} readOnly aria-readonly="true" />
              </Field>
              <Field label="Time zone" htmlFor={`${uid}-tz`} render={() => <TimeZoneField id={`${uid}-tz`} />}>
                {null}
              </Field>
            </div>
          </div>
          {problem ? (
            <p role="alert" data-profile-problem className="mt-3 text-[13px] font-medium text-danger-text">
              {problem}
            </p>
          ) : null}
        </SettingsCard>

        <div id="notifications" className="scroll-mt-20">
          <NotificationsPanel />
        </div>

        <SecurityCard demo={p.demo} />

        <SettingsCard id="organization" title="Organization">
          <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted">Organization</dt>
            <dd className="font-medium text-ink">{p.orgName}</dd>
            <dt className="text-muted">Member since</dt>
            <dd className="font-medium text-ink">{p.joinedAt ? new Date(p.joinedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Not recorded"}</dd>
            <dt className="text-muted">Your roles</dt>
            <dd data-my-roles className="flex flex-wrap gap-1.5">
              {p.roles.length === 0 ? (
                <span className="text-muted">None yet</span>
              ) : (
                p.roles.map((r) => (
                  <span key={r.name} className="rounded-md bg-accent-soft px-2 py-0.5 text-[12.5px] font-semibold text-accent-deep">
                    {r.name}
                    {r.isPrimary ? " (main)" : ""}
                  </span>
                ))
              )}
            </dd>
          </dl>
          <p className="mt-3 text-[12.5px] text-muted">Your roles decide what you can open. Only an administrator changes them.</p>
        </SettingsCard>
      </div>
    </NotificationPrefsProvider>
  );
}

/** Account security: change the password (current + new, twice). The BFF checks the current one; the rules are the platform's. */
function SecurityCard({ demo }: { demo: boolean }) {
  const uid = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const problem = passwordProblem(current, next, again);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return setMsg({ ok: false, text: DEMO_READ_ONLY_MESSAGE });
    if (problem) return setMsg({ ok: false, text: problem });
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setMsg({ ok: false, text: data.error ?? "The password could not be changed." });
      setCurrent("");
      setNext("");
      setAgain("");
      setMsg({ ok: true, text: "Your password is changed." });
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server. Nothing was changed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard id="security" title="Security">
      <form onSubmit={submit} className="grid max-w-md gap-3" noValidate>
        <p className="text-[13.5px] text-ink-soft">Change the password you sign in with.</p>
        <Field label="Current password" htmlFor={`${uid}-cur`}>
          <Input id={`${uid}-cur`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor={`${uid}-new`}>
          <Input id={`${uid}-new`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Repeat the new password" htmlFor={`${uid}-again`}>
          <Input id={`${uid}-again`} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        {msg ? (
          <p role={msg.ok ? "status" : "alert"} data-security-message className={msg.ok ? "text-[13px] font-medium text-ok" : "text-[13px] font-medium text-danger-text"}>
            {msg.text}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={busy || (current === "" && next === "" && again === "")}>
            {busy ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}
