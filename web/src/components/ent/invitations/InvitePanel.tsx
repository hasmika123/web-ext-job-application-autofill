"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, Field, IconButton, Input, MailIcon, SendIcon, Select, Textarea, Tooltip, XIcon } from "@kiwiply/ui";
import { invitationsApi, isEmail, problemText, rowProblem, type FormOptions, type InviteBody } from "@/lib/ent/invitations";
import RoleSelect from "./RoleSelect";

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
  const [errors, setErrors] = useState<{ email?: string; role?: string; dept?: string; form?: string }>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (focusSignal > 0) emailRef.current?.focus();
  }, [focusSignal]);

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
    setErrors(next);
    if (Object.keys(next).length > 0) {
      (document.getElementById(`${uid}-${next.email ? "email" : next.role ? "role" : "dept"}`) as HTMLElement | null)?.focus();
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
          <p className="mt-1.5 whitespace-nowrap text-[13px] text-muted">Send an invitation to join your organization.</p>
        </div>
        {onClose && (
          <Tooltip content="Close">
            <IconButton aria-label="Close the invite panel" onClick={onClose} className="!h-[34px] !w-[34px] flex-none rounded-full border border-line bg-paper text-accent shadow-sm">
              <XIcon size={16} />
            </IconButton>
          </Tooltip>
        )}
      </div>

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

      {errors.form && (
        <p role="alert" className="text-[13px] text-danger-text">
          {errors.form}
        </p>
      )}
      <Button type="submit" variant="accent" size="lg" disabled={busy} className="w-full">
        <SendIcon aria-hidden size={18} />
        {busy ? "Sending…" : "Send Invitation"}
      </Button>
      <p role="status" aria-live="polite" className="min-h-4 text-center text-[12.5px] text-accent-deep">
        {sentTo ? `Invitation sent to ${sentTo}.` : ""}
      </p>
    </form>
  );
}
