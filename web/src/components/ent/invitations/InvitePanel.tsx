"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, Field, IconButton, Input, MailIcon, SendIcon, Select, Textarea, Tooltip, XIcon } from "@kiwiply/ui";
import { accountsApi, invitationsApi, isEmail, passwordIssue, problemText, rowProblem, type AccountBody, type FormOptions, type InviteBody } from "@/lib/ent/invitations";
import TempPasswordDialog from "@/components/ent/shared/TempPasswordDialog";
import RoleSelect from "./RoleSelect";

/** How a person is added: an account now (temporary password, the default) or the invitation e-mail they accept themselves. */
export type AddMode = "account" | "invite";

export const MESSAGE_MAX = 500;

export interface Sent {
  email: string;
  body: InviteBody;
}

/**
 * The "Invite Employee" panel, which is also the create form (no Save button: Send Invitation is the one deliberate step). One
 * address, an optional name, one or more roles, a department (required only when the organization has departments) and an
 * optional note. A refused entry says why under the field it belongs to; a sent one clears the form for the next person and
 * tells the page (which offers Undo, a revoke, in a toast).
 */
export default function InvitePanel({
  orgId,
  options,
  onSent,
  onClose,
  focusSignal = 0,
  headingId,
}: {
  orgId: number | string;
  options: FormOptions | null;
  onSent: (sent: Sent) => void;
  /** Shown as the X when the panel is closable. */
  onClose?: () => void;
  /** Bump this number to move focus to the address field ("Invite your first teammate"). */
  focusSignal?: number;
  headingId?: string;
}) {
  const uid = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [dept, setDept] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; role?: string; dept?: string; password?: string; form?: string }>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [mode, setMode] = useState<AddMode>("account");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creds, setCreds] = useState<{ who: string; password: string | null; expiresAt: string | null } | null>(null);
  const [createdNote, setCreatedNote] = useState<string | null>(null);

  useEffect(() => {
    if (focusSignal > 0) emailRef.current?.focus();
  }, [focusSignal]);

  /** A fresh generated password for the field (nothing is stored on the server for it). */
  async function suggest() {
    const r = await accountsApi.suggest(orgId);
    if (r.ok) setPassword(r.data.password);
  }
  useEffect(() => {
    if (mode !== "account") return;
    let live = true;
    void accountsApi.suggest(orgId).then((r) => {
      if (live && r.ok) setPassword((current) => current || r.data.password); // fetched once per switch to account mode; never over what was typed
    });
    return () => {
      live = false;
    };
  }, [mode, orgId]);

  const departments = options?.departments ?? [];
  const needsDept = departments.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter the person's email address.";
    else if (!isEmail(email)) next.email = "That doesn't look like an email address.";
    if (roleIds.length === 0) next.role = "Pick at least one role.";
    if (needsDept && !dept) next.dept = "Pick a department.";
    if (mode === "account") {
      const issue = passwordIssue(password);
      if (issue) next.password = issue;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      (document.getElementById(`${uid}-${next.email ? "email" : next.role ? "role" : "dept"}`) as HTMLElement | null)?.focus();
      return;
    }
    if (mode === "account") {
      const account: AccountBody = {
        email: email.trim(),
        password,
        roleIds,
        ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        ...(dept ? { departmentGroupId: Number(dept) } : {}),
      };
      setBusy(true);
      setSentTo(null);
      setCreatedNote(null);
      const made = await accountsApi.create(orgId, account);
      setBusy(false);
      if (!made.ok) {
        setErrors(made.code === "ROLE_CEILING" ? { role: problemText(made) } : made.code === "ALREADY_MEMBER" ? { email: "Already a member of this organization." } : made.code === "ORG_INVALID" && /password/i.test(made.message) ? { password: made.message } : { form: problemText(made) });
        return;
      }
      const who = email.trim();
      setErrors({});
      setEmail("");
      setFullName("");
      setPassword("");
      if (made.data.mode === "ACCOUNT_CREATED") {
        setCreds({ who, password: made.data.tempPassword ?? account.password ?? null, expiresAt: made.data.tempPasswordExpiresAt });
        setCreatedNote(`Account created for ${who}.`);
        void suggest();
      } else {
        // Legacy (shared-account) organizations only: the API sends INVITED when it could not create a new account, and the normal invitation went out instead.
        setCreatedNote(`An invitation was sent to ${who} instead of a new account. They accept it with the account they already use.`);
        onSent({ email: who, body: { emails: [who], roleIds, ...(dept ? { departmentGroupId: Number(dept) } : {}) } });
        void suggest();
      }
      emailRef.current?.focus();
      return;
    }
    const body: InviteBody = {
      emails: [email.trim()],
      roleIds,
      ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
      ...(dept ? { departmentGroupId: Number(dept) } : {}),
      ...(message.trim() ? { message: message.trim() } : {}),
    };
    setBusy(true);
    setSentTo(null);
    const r = await invitationsApi.invite(orgId, body);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.code === "ROLE_CEILING" ? { role: problemText(r) } : { form: problemText(r) });
      return;
    }
    const row = r.data.rows?.[0];
    const problem = row ? rowProblem(row) : r.data.invited?.length ? null : "Couldn't send that invitation.";
    if (problem) {
      setErrors({ email: problem });
      emailRef.current?.focus();
      return;
    }
    setErrors({});
    setSentTo(email.trim());
    setEmail("");
    setFullName("");
    setMessage("");
    onSent({ email: body.emails[0], body });
    emailRef.current?.focus();
  }

  return (
    <form onSubmit={submit} noValidate data-invite-panel aria-labelledby={headingId ?? `${uid}-h`} className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId ?? `${uid}-h`} className="flex items-center gap-3 text-[20px] font-bold text-ink">
            <span aria-hidden className="grid h-[34px] w-[34px] flex-none place-items-center rounded-lg bg-accent-soft text-accent">
              <MailIcon aria-hidden size={20} />
            </span>
            Invite Employee
          </h2>
          <p className="mt-1.5 text-[13px] text-muted">{mode === "account" ? "Create their organization account now with a temporary password. Any personal Kiwiply account they have is not touched or linked." : "Send an invitation to join your organization."}</p>
        </div>
        {onClose && (
          <Tooltip content="Close">
            <IconButton aria-label="Close the invite panel" onClick={onClose} className="!h-[34px] !w-[34px] flex-none rounded-full border border-line bg-paper text-accent shadow-sm">
              <XIcon size={16} />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0" data-invite-mode-group>
        <legend className="sr-only">How to add this person</legend>
        <div role="radiogroup" aria-label="How to add this person" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-paper-2 p-1 text-[13px] font-semibold">
          {(
            [
              ["account", "Create account now", "temporary password"],
              ["invite", "Send invitation", "they accept by e-mail"],
            ] as const
          ).map(([value, label, sub]) => (
            <label key={value} className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-2.5 py-1 leading-tight ${mode === value ? "bg-paper text-accent-deep shadow-sm" : "text-ink-soft"}`}>
              <input type="radio" name={`${uid}-mode`} value={value} checked={mode === value} onChange={() => { setMode(value); setErrors({}); setCreatedNote(null); }} data-invite-mode={value} className="sr-only" />
              <span>{label}</span>
              <span className="text-[11px] font-normal text-muted">({sub})</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field className="!mb-0" label="Email Address" required error={errors.email} htmlFor={`${uid}-email`}>
        <Input
          id={`${uid}-email`}
          ref={emailRef}
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
          }}
        />
      </Field>

      <Field className="!mb-0" label={<>Full Name <span className="font-normal text-muted">(Optional)</span></>} htmlFor={`${uid}-name`}>
        <Input id={`${uid}-name`} autoComplete="off" placeholder="Enter full name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
      </Field>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <Field
          className="!mb-0"
          label="Role"
          required
          error={errors.role}
          htmlFor={`${uid}-role`}
          hint={options && !options.rolesAvailable ? "Roles couldn't be loaded. Try again in a moment." : undefined}
          render={({ describedBy, invalid }) => (
            <RoleSelect id={`${uid}-role`} options={options?.roles ?? []} value={roleIds} onChange={(ids) => { setRoleIds(ids); if (errors.role) setErrors((x) => ({ ...x, role: undefined })); }} invalid={invalid} describedBy={describedBy} placeholder="Select a role" />
          )}
        >
          <span />
        </Field>
        <Field
          className="!mb-0"
          label="Department"
          required={needsDept}
          error={errors.dept}
          htmlFor={`${uid}-dept`}
          hint={options && !needsDept ? "No departments yet. This person will join without one." : undefined}
        >
          <Select
            id={`${uid}-dept`}
            aria-label="Department"
            value={dept}
            onChange={(v) => {
              setDept(v);
              if (errors.dept) setErrors((x) => ({ ...x, dept: undefined }));
            }}
            placeholder={needsDept ? "Select a department" : "None"}
            disabled={!needsDept}
            options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
          />
        </Field>
      </div>

      {mode === "account" && (
        <Field className="!mb-0" label="Temporary password" required error={errors.password} htmlFor={`${uid}-pw`} hint="They must choose their own at first sign-in. You will see it once after saving." render={({ id, describedBy, invalid }) => (
          <div className="flex items-stretch gap-2">
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              spellCheck={false}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
              }}
              className="min-w-0 flex-1 font-mono"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} className="min-h-11 flex-none sm:min-h-0">
              {showPassword ? "Hide" : "Show"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void suggest()} className="min-h-11 flex-none sm:min-h-0">
              Generate
            </Button>
          </div>
        )}>
          <span />
        </Field>
      )}

      {mode === "invite" && (
      <Field
        className="!mb-0"
        label={<>Personal Message <span className="font-normal text-muted">(Optional)</span></>}
        htmlFor={`${uid}-msg`}
        render={({ id }) => (
          <div className="relative">
            <Textarea
              id={id}
              rows={2}
              maxLength={MESSAGE_MAX}
              placeholder="Add a personal message to your invitation..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="pb-6"
            />
            <span aria-live="off" className="pointer-events-none absolute bottom-2 right-3 text-[11.5px] tabular-nums text-muted">
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
        )}
      >
        <span />
      </Field>
      )}

      {errors.form && (
        <p role="alert" className="text-[13px] text-danger-text">
          {errors.form}
        </p>
      )}
      <Button type="submit" variant="accent" size="lg" disabled={busy} className="w-full">
        <SendIcon aria-hidden size={18} />
        {mode === "account" ? (busy ? "Creating…" : "Create Account") : busy ? "Sending…" : "Send Invitation"}
      </Button>
      <p role="status" aria-live="polite" className="min-h-4 text-center text-[12.5px] text-accent-deep">
        {mode === "invite" && sentTo ? `Invitation sent to ${sentTo}.` : mode === "account" ? (createdNote ?? "") : ""}
      </p>
      <TempPasswordDialog
        open={creds !== null}
        title="Account created"
        who={creds?.who ?? ""}
        password={creds?.password ?? null}
        expiresAt={creds?.expiresAt}
        hint="They sign in with their e-mail and this password, then choose their own."
        onClose={() => setCreds(null)}
      />
    </form>
  );
}
