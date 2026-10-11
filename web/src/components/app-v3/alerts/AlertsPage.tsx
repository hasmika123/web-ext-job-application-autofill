"use client";

import { useMemo, useState } from "react";
import {
  BellIcon,
  Dialog,
  Field,
  Input,
  MailIcon,
  PencilIcon,
  PlusIcon,
  Select,
  TrashIcon,
  ClockIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import { IconTile, KebabMenu, SectionCard, StatusChip, TONE, Toggle, UnderlineTabs } from "../../app-v2/common";
import { HeroBand } from "@/components/app-v2/common";
import {
  ALERTS,
  ALERT_CHANNELS,
  ALERT_FREQUENCIES,
  ALERT_JOB_TYPES,
  ALERT_SETTINGS,
  type AlertChannel,
  type AlertFrequency,
  type AlertSample,
} from "../sample-data";
import type { Tone } from "../../app-v2/common";

type TabKey = "active" | "paused" | "settings";

interface Draft {
  title: string;
  location: string;
  jobType: string;
  frequency: AlertFrequency;
  channels: AlertChannel[];
}

const EMPTY_DRAFT: Draft = { title: "", location: "", jobType: "Any", frequency: "Daily", channels: ["Email", "In-app"] };
const TONES: Tone[] = ["blue", "violet", "green", "teal", "amber", "coral", "pink"];

const channelLabel = (c: AlertChannel[]) => (c.length === 0 ? "No channel" : c.join(" & "));
const jobTypeOf = (a: AlertSample) => a.meta.find((m) => ALERT_JOB_TYPES.includes(m as (typeof ALERT_JOB_TYPES)[number])) ?? "Any";

/**
 * Job Alerts (APP-V3-SPEC 2.6). All client state over sample data: the toggles, Edit, delete and the
 * Create Alert dialog work locally; nothing is saved. The "Active" tab lists every alert (the board
 * shows its paused row there too, with the toggle off) and the "Paused" tab lists the ones switched off.
 */
export default function AlertsPage() {
  const toast = useToast();
  const [alerts, setAlerts] = useState<AlertSample[]>(ALERTS);
  const [tab, setTab] = useState<TabKey>("active");
  const [dialog, setDialog] = useState<{ id: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [titleError, setTitleError] = useState(false);
  const [settings, setSettings] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALERT_SETTINGS.map((s) => [s.id, s.on])),
  );

  const paused = useMemo(() => alerts.filter((a) => !a.active), [alerts]);
  const rows = tab === "paused" ? paused : alerts;

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setTitleError(false);
    setDialog({ id: null });
  };
  const openEdit = (a: AlertSample) => {
    setDraft({
      title: a.title,
      location: a.location,
      jobType: jobTypeOf(a),
      frequency: a.frequency,
      channels: a.channels,
    });
    setTitleError(false);
    setDialog({ id: a.id });
  };
  const close = () => setDialog(null);

  const save = () => {
    const title = draft.title.trim();
    if (!title) {
      setTitleError(true);
      return;
    }
    const meta = draft.jobType !== "Any" ? [draft.jobType] : [];
    const location = draft.location.trim() || "Anywhere";
    if (dialog?.id) {
      setAlerts((list) =>
        list.map((a) =>
          a.id === dialog.id
            ? { ...a, title, location, meta: [...meta, ...a.meta.filter((m) => m.startsWith("$"))], frequency: draft.frequency, channels: draft.channels }
            : a,
        ),
      );
      toast({ title: "Alert updated", description: title });
    } else {
      const id = `new-${Date.now()}`;
      setAlerts((list) => [
        { id, title, location, meta, tags: [], frequency: draft.frequency, channels: draft.channels, active: true, tone: TONES[list.length % TONES.length] },
        ...list,
      ]);
      setTab("active");
      toast({ title: "Alert created", description: `${title} — we'll notify you ${draft.frequency.toLowerCase()}.` });
    }
    close();
  };

  const toggleChannel = (c: AlertChannel) =>
    setDraft((d) => ({ ...d, channels: d.channels.includes(c) ? d.channels.filter((x) => x !== c) : [...d.channels, c] }));

  const setActive = (id: string, active: boolean) =>
    setAlerts((list) => list.map((a) => (a.id === id ? { ...a, active } : a)));

  const remove = (a: AlertSample) => {
    setAlerts((list) => list.filter((x) => x.id !== a.id));
    toast({ title: "Alert deleted", description: a.title });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <HeroBand
        title="Job Alerts"
        subtitle="Get notified about new opportunities that match your preferences."
        mascot="mascot-binoculars"
        note="Never miss a match!"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-v2-lime px-5 text-[14.5px] font-bold text-v2-navy transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue"
          >
            <PlusIcon size={17} />
            Create Alert
          </button>
        }
      />

      <UnderlineTabs
        ariaLabel="Alert views"
        padded
        value={tab}
        onChange={(id) => setTab(id as TabKey)}
        tabs={[
          { id: "active", label: "Active", count: alerts.length },
          { id: "paused", label: "Paused", count: paused.length },
          { id: "settings", label: "Notification Settings" },
        ]}
      />

      {tab === "settings" ? (
        <SectionCard title="Notification Settings" subtitle="Choose how Kiwiply tells you about new matches.">
          <ul className="divide-y divide-v2-line/60">
            {ALERT_SETTINGS.map((s) => (
              <li key={s.id} className="py-3.5 first:pt-1 last:pb-1">
                <Toggle
                  label={s.label}
                  description={s.description}
                  checked={settings[s.id]}
                  onCheckedChange={(v) => setSettings((p) => ({ ...p, [s.id]: v }))}
                />
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-v2-line bg-paper px-6 py-14 text-center">
          <p className="font-display text-[17px] font-bold text-ink">
            {tab === "paused" ? "No paused alerts" : "No alerts yet"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[14px] text-ink-soft">
            {tab === "paused"
              ? "Turn an alert off and it will wait here until you switch it back on."
              : "Create an alert and we will tell you when a matching job appears."}
          </p>
          {tab === "active" && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-v2-lime px-4 text-[14px] font-bold text-v2-navy hover:brightness-95"
            >
              <PlusIcon size={16} />
              Create Alert
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((a) => (
            <li
              key={a.id}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-5 lg:flex-row lg:items-center lg:gap-5",
                !a.active && "bg-paper-2/60",
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3.5">
                <IconTile tone={a.tone} className={cn("h-11 w-11", !a.active && "opacity-60")}>
                  <BellIcon size={20} />
                </IconTile>
                <div className="min-w-0">
                  <h3 className="font-display text-[16px] font-bold leading-tight text-ink">{a.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-snug text-ink-soft">{[a.location, ...a.meta].join(" · ")}</p>
                  {a.tags.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {a.tags.map((t) => (
                        <li key={t}>
                          <StatusChip tone="slate">{t}</StatusChip>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <dl className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13.5px] text-ink-soft lg:flex-none">
                <div className="flex items-center gap-1.5 lg:w-[104px]">
                  <dt className="sr-only">Frequency</dt>
                  <ClockIcon size={15} className="text-v2-muted" />
                  <dd className="font-semibold text-ink">{a.frequency}</dd>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap lg:w-[140px]">
                  <dt className="sr-only">Channels</dt>
                  <MailIcon size={15} className="text-v2-muted" />
                  <dd className="font-semibold text-ink">{channelLabel(a.channels)}</dd>
                </div>
              </dl>

              <div className="flex items-center gap-3 lg:flex-none">
                <Toggle
                  checked={a.active}
                  onCheckedChange={(v) => {
                    setActive(a.id, v);
                    toast({ title: v ? "Alert on" : "Alert paused", description: a.title });
                  }}
                  aria-label={`${a.active ? "Pause" : "Turn on"} alert ${a.title}`}
                />
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-v2-line px-3 text-[13px] font-semibold text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue"
                >
                  <PencilIcon size={14} />
                  Edit
                </button>
                <KebabMenu
                  label={`More actions for ${a.title}`}
                  items={[
                    { label: "Edit alert", icon: <PencilIcon size={15} />, onSelect: () => openEdit(a) },
                    {
                      label: a.active ? "Pause alert" : "Turn on",
                      icon: <BellIcon size={15} />,
                      onSelect: () => setActive(a.id, !a.active),
                    },
                    { separator: true },
                    { label: "Delete", icon: <TrashIcon size={15} />, danger: true, onSelect: () => remove(a) },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={dialog?.id ? "Edit Alert" : "Create Alert"}
        description="Tell us what to watch for. Alerts are examples for now and are not saved."
        footer={
          <>
            <button
              type="button"
              onClick={close}
              className="h-10 rounded-xl border border-v2-line px-4 text-[14px] font-semibold text-ink hover:bg-paper-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="h-10 rounded-xl bg-v2-lime px-5 text-[14px] font-bold text-v2-navy hover:brightness-95"
            >
              {dialog?.id ? "Save changes" : "Create Alert"}
            </button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label="Title" required error={titleError ? "Add a job title for this alert." : undefined}>
            <Input
              value={draft.title}
              onChange={(e) => {
                setDraft((d) => ({ ...d, title: e.target.value }));
                if (titleError) setTitleError(false);
              }}
              placeholder="e.g. Frontend Developer"
              autoComplete="off"
            />
          </Field>
          <Field label="Location">
            <Input
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              placeholder="e.g. Remote, San Francisco, CA"
              autoComplete="off"
            />
          </Field>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Job type">
              <Select
                value={draft.jobType}
                onChange={(v) => setDraft((d) => ({ ...d, jobType: v }))}
                options={ALERT_JOB_TYPES.map((v) => ({ value: v, label: v }))}
              />
            </Field>
            <Field label="Frequency">
              <Select
                value={draft.frequency}
                onChange={(v) => setDraft((d) => ({ ...d, frequency: v as AlertFrequency }))}
                options={ALERT_FREQUENCIES.map((v) => ({ value: v, label: v }))}
              />
            </Field>
          </div>
          <fieldset className="mb-1">
            <legend className="mb-1.5 text-[12.5px] font-semibold text-ink-soft">Channels</legend>
            <div className="flex flex-wrap gap-2">
              {ALERT_CHANNELS.map((c) => {
                const on = draft.channels.includes(c);
                return (
                  <label
                    key={c}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-[13.5px] font-semibold transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-v2-blue",
                      on ? cn("border-v2-green/50", TONE.green.soft, TONE.green.ink) : "border-v2-line text-ink-soft hover:bg-paper-2",
                    )}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleChannel(c)} className="h-4 w-4 accent-[var(--color-v2-green)]" />
                    {c}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <button type="submit" className="sr-only" tabIndex={-1}>
            Save
          </button>
        </form>
      </Dialog>
    </div>
  );
}
