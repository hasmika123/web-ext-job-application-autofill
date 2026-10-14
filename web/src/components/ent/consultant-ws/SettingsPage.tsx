"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  BellIcon,
  BriefcaseIcon,
  Button,
  ChevronRightIcon,
  ClockIcon,
  ErrorState,
  FileTextIcon,
  KeyIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  PencilIcon,
  Select,
  ShieldCheckIcon,
  ShieldIcon,
  Skeleton,
  SlidersIcon,
  Switch,
  UserIcon,
  ZapIcon,
  cn,
  useToast,
} from "@kiwiply/ui";
import type { IconProps } from "@kiwiply/ui";
import { CARD, TONES, type IconTone } from "@/components/ent/dashboard/parts";
import PageHeader, { ClaimsHelpCard, ClaimsMascot } from "@/components/ent/shell/ShellContext";
import { BASE, BeeCard, CompanyMark, Card, Empty, Pill, useWorkspaceData } from "./parts";
import { firstName } from "@/lib/ent/consultant-ws/home";
import {
  ACCOUNT_SETTINGS_PATH,
  LANGUAGE_LABEL,
  THEMES,
  THEME_LABEL,
  VISIBILITIES,
  VISIBILITY_LABEL,
  activityTone,
  applyPrivacy,
  availabilityText,
  employmentText,
  fetchSettings,
  inverseAppearance,
  inversePrivacy,
  levelOf,
  listText,
  privacyTile,
  profileTile,
  rateText,
  saveAppearance,
  savePrivacy,
  timezoneLabel,
  timezoneOptions,
  toolsTile,
  whenText,
  type AppearancePatch,
  type PrivacyPatch,
  type SettingsView,
  type WriteResult,
} from "@/lib/ent/consultant-ws/settings";

/**
 * Consultant Settings (design/enterprise-consultant/settings.webp): one call to `GET /api/orgs/{orgId}/me-workspace/settings` draws the page
 * for the signed-in consultant. Real, consultant-isolated writes: Privacy & Sharing and Appearance / Language / Timezone (optimistic, with an
 * Undo toast). Account facts and career preferences are read-only summaries with an Edit link to the Profile page. Password, two-factor and
 * sign-in alerts are NOT handled here (no self-service API for tenant members exists): the rows say so and link to the Kiwiply account page.
 * Connected tools are not available yet (no integrations module): the rows are disabled and nothing is ever shown as connected. No password,
 * token, key or phone number is displayed or stored; a phone is simply not collected.
 */

/* ── small pieces ───────────────────────────────────────────────────────────────────── */

function Tile({ title, icon: Icon, tone, value, sub, loading }: { title: string; icon: ComponentType<IconProps>; tone: IconTone; value: ReactNode; sub: ReactNode; loading: boolean }) {
  return (
    <section aria-label={title} data-stat-tile={title} data-state={loading ? "loading" : "ok"} className="flex min-h-[104px] min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-paper p-3.5">
      <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-[14px]", TONES[tone])}>
        <Icon size={26} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-bold leading-tight text-ink">{title}</h3>
        {loading ? (
          <>
            <Skeleton className="mt-2 h-8 w-20" />
            <Skeleton className="mt-2 h-4 w-24" />
          </>
        ) : (
          <>
            <p data-tile-value className="mt-1 min-w-0 truncate text-[24px] font-extrabold leading-none tabular-nums text-ink 2xl:text-[26px]">
              {value}
            </p>
            <p className="mt-2 min-h-5 text-[12px] text-muted">{sub}</p>
          </>
        )}
      </div>
    </section>
  );
}

function Tiles({ view }: { view: SettingsView | null }) {
  const profile = view ? profileTile(view.tiles.profileStatus) : null;
  const privacy = view ? privacyTile(view.tiles.privacy) : null;
  return (
    <section aria-label="Key numbers" data-settings-tiles className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      <Tile loading={!view} title="Profile Status" icon={UserIcon} tone="accent" value={profile?.value} sub={profile?.sub} />
      <Tile loading={!view} title="Privacy Level" icon={ShieldIcon} tone="violet" value={privacy?.value} sub={privacy?.sub} />
      <Tile loading={!view} title="Connected Tools" icon={LinkIcon} tone="green" value={view?.tiles.connectedTools.connected} sub={view ? toolsTile(view.tiles.connectedTools) : null} />
      <Tile
        loading={!view}
        title="Notifications Setup"
        icon={BellIcon}
        tone="coral"
        value="Notifications"
        sub={
          <Link href={`${BASE}/notifications`} className="font-semibold text-accent-deep hover:underline">
            Manage in Notifications
          </Link>
        }
      />
    </section>
  );
}

const EDIT = "inline-flex min-h-8 flex-none items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-accent-deep hover:bg-accent-soft";

function EditLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className={EDIT}>
      <PencilIcon size={14} />
      Edit
    </Link>
  );
}

/** A read-only label and value; an empty value is said plainly. */
function Fact({ label, value, empty = "Not set" }: { label: string; value: ReactNode; empty?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] items-center gap-2 text-[13px]">
      <dt className="text-ink-soft">{label}</dt>
      <dd data-fact={label} className={cn("min-w-0 break-words rounded-lg border border-line bg-paper-2/50 px-3 py-2", value ? "text-ink" : "text-muted")}>
        {value || empty}
      </dd>
    </div>
  );
}

/* ── cards ──────────────────────────────────────────────────────────────────────────── */

function AccountCard({ view }: { view: SettingsView }) {
  return (
    <Card id="settings-account" title="Account Information" icon={UserIcon} extra={<EditLink href={`${BASE}/profile`} label="Edit account information on your profile" />}>
      <dl className="grid gap-2.5">
        <Fact label="Full Name" value={view.account.name} />
        <Fact label="Email Address" value={view.account.email} />
        <Fact label="Phone Number" value={null} empty="Not collected" />
        <Fact label="Location" value={view.account.location} />
      </dl>
      <p className="mt-3 text-[12px] leading-snug text-muted">Read from your profile. Edit it there. A phone number is never collected.</p>
    </Card>
  );
}

function CareerCard({ view }: { view: SettingsView }) {
  const c = view.career;
  return (
    <Card id="settings-career" title="Career Preferences" icon={BriefcaseIcon} tone="accent" extra={<EditLink href={`${BASE}/profile`} label="Edit career preferences on your profile" />}>
      <dl className="grid gap-2.5">
        <Fact label="Preferred Job Types" value={employmentText(c.employmentTypes)} />
        <Fact label="Preferred Work Mode" value={c.workMode} />
        <Fact label="Target Roles" value={listText(c.targetRoles)} />
        <Fact label="Target Locations" value={listText(c.locations)} />
        <Fact label="Expected Rate (Hourly)" value={rateText(c.rateMinMinor, c.rateMaxMinor)} />
        <Fact label="Availability" value={availabilityText(c.availabilityStatus)} />
      </dl>
    </Card>
  );
}

function NotificationsCard() {
  return (
    <Card id="settings-notifications" title="Notification Preferences" icon={BellIcon} tone="amber" extra={<EditLink href={`${BASE}/notifications`} label="Open notification preferences" />}>
      <p className="text-[13px] leading-snug text-muted">Choose what you hear about, and how, on the Notifications page. Nothing is duplicated here, so there is one place to change it.</p>
      <Link href={`${BASE}/notifications`} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-paper p-3 text-[13.5px] font-semibold text-accent-deep hover:bg-paper-2/60">
        <span className="min-w-0 flex-1">Manage in Notifications</span>
        <ChevronRightIcon size={16} className="flex-none" />
      </Link>
    </Card>
  );
}

function PrivacyCard({ view, onChange }: { view: SettingsView; onChange: (patch: PrivacyPatch, what: string) => void }) {
  const s = view.settings;
  const vis = VISIBILITY_LABEL[s.profileVisibility](view.orgName);
  const options = VISIBILITIES.map((v) => ({ value: v, label: VISIBILITY_LABEL[v](view.orgName).title }));
  return (
    <Card id="settings-privacy" title="Privacy & Sharing" icon={ShieldIcon} tone="accent">
      <div className="grid gap-4">
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor="settings-visibility" className="text-[13.5px] font-bold text-ink">
            Profile Visibility
          </label>
          <Select id="settings-visibility" value={s.profileVisibility} options={options} onChange={(v) => onChange({ profileVisibility: v as PrivacyPatch["profileVisibility"] }, "Profile visibility")} />
          <p data-visibility-hint className="text-[12px] leading-snug text-muted">
            {vis.hint}
          </p>
        </div>
        <Switch
          label="Share My Profile with Employers"
          description={`Allow ${view.orgName} to share your profile with relevant employers.`}
          checked={s.shareProfileWithEmployers}
          onCheckedChange={(v) => onChange({ shareProfileWithEmployers: v }, "Sharing with employers")}
        />
        <Switch
          label="Show Contact Information"
          description="Keep your contact details private until you choose to share them."
          checked={s.showContactInformation}
          onCheckedChange={(v) => onChange({ showContactInformation: v }, "Contact information")}
        />
        <Switch label="Allow Analytics Usage" description="Help us improve your experience with anonymous usage data." checked={s.allowAnalytics} onCheckedChange={(v) => onChange({ allowAnalytics: v }, "Analytics usage")} />
      </div>
      {s.isDefault ? <p className="mt-3 text-[12px] text-muted">These are the default, private-leaning settings. Nothing has been changed yet.</p> : null}
    </Card>
  );
}

function ManagedRow({ icon: Icon, tone, title, hint }: { icon: ComponentType<IconProps>; tone: IconTone; title: string; hint: string }) {
  return (
    <li data-security-row={title} className="flex flex-wrap items-center gap-3">
      <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", TONES[tone])}>
        <Icon size={19} />
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-[13.5px] font-bold text-ink">{title}</p>
        <p className="text-[12px] leading-snug text-muted">{hint}</p>
      </div>
      <Pill tone="slate">Managed on your Kiwiply account</Pill>
    </li>
  );
}

function SecurityCard() {
  return (
    <Card id="settings-security" title="Security" icon={LockIcon} tone="accent" extra={<EditLink href={ACCOUNT_SETTINGS_PATH} label="Open your Kiwiply account settings" />}>
      <ul className="grid gap-4">
        <ManagedRow icon={KeyIcon} tone="amber" title="Password" hint="Change it in your account settings. It is never shown here." />
        <ManagedRow icon={ShieldCheckIcon} tone="green" title="Two-Factor Authentication" hint="Its status is not available on this page." />
        <ManagedRow icon={BellIcon} tone="coral" title="Login Notifications" hint="Sign-in alerts are managed in your account settings." />
      </ul>
      <Link href={ACCOUNT_SETTINGS_PATH} data-security-link className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-paper p-3 text-[13.5px] font-semibold text-accent-deep hover:bg-paper-2/60">
        <span className="min-w-0 flex-1">Open account settings</span>
        <ChevronRightIcon size={16} className="flex-none" />
      </Link>
    </Card>
  );
}

function ToolsCard({ view }: { view: SettingsView }) {
  return (
    <Card id="settings-tools" title="Connected Tools" icon={LinkIcon} tone="green">
      {view.tools.length === 0 ? (
        <Empty>No tools to connect yet.</Empty>
      ) : (
        <ul className="grid gap-3">
          {view.tools.map((t, i) => (
            <li key={t.key} data-tool={t.key} className="flex flex-wrap items-center gap-3">
              <CompanyMark name={t.name} tone={i} />
              <div className="min-w-0 flex-1 basis-32">
                <p className="text-[13.5px] font-bold text-ink">{t.name}</p>
              </div>
              <Pill tone="slate">Not available yet</Pill>
              <Button type="button" variant="accent-soft" size="sm" disabled aria-label={`Connect ${t.name} (not available yet)`}>
                Connect
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] leading-snug text-muted">Connections arrive with the integrations module. Nothing is shared with these services.</p>
    </Card>
  );
}

function DocumentsCard({ view }: { view: SettingsView }) {
  const n = view.documents.resumes;
  return (
    <Card id="settings-documents" title="Documents & Permissions" icon={FileTextIcon} tone="violet" extra={<EditLink href={`${BASE}/resumes`} label="Manage your resumes" />}>
      <ul className="grid gap-3">
        <li>
          <Link href={`${BASE}/resumes`} data-doc-row="resumes" className="flex min-h-12 items-center gap-3 rounded-xl hover:bg-paper-2/60">
            <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", TONES.violet)}>
              <FileTextIcon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-ink">My Resumes</span>
              <span className="block text-[12px] text-muted">Manage resume access and sharing</span>
            </span>
            <span data-resume-count className="flex-none text-[13px] text-ink-soft">
              {n === 1 ? "1 resume" : `${n} resumes`}
            </span>
            <ChevronRightIcon size={16} className="flex-none text-muted" />
          </Link>
        </li>
        <li data-doc-row="supporting" className="flex min-h-12 items-center gap-3">
          <span aria-hidden className={cn("grid h-10 w-10 flex-none place-items-center rounded-xl", TONES.green)}>
            <ShieldCheckIcon size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-bold text-ink">Supporting Documents</span>
            <span className="block text-[12px] text-muted">Identity and tax documents are never collected here.</span>
          </span>
          <Pill tone="slate">Not collected</Pill>
        </li>
      </ul>
    </Card>
  );
}

function AppearanceCard({ view, onChange }: { view: SettingsView; onChange: (patch: AppearancePatch, what: string) => void }) {
  const s = view.settings;
  const langs = (view.languages.length ? view.languages : Object.keys(LANGUAGE_LABEL)).map((l) => ({ value: l, label: LANGUAGE_LABEL[l] ?? l }));
  const zones = timezoneOptions(s.timezone).map((z) => ({ value: z, label: timezoneLabel(z) }));
  const themes = THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }));
  const row = (id: string, label: string, control: ReactNode) => (
    <div className="grid grid-cols-[minmax(0,0.6fr)_minmax(0,1.6fr)] items-center gap-2 text-[13px]">
      <label htmlFor={id} className="text-ink-soft">
        {label}
      </label>
      <div className="min-w-0">{control}</div>
    </div>
  );
  return (
    <Card id="settings-appearance" title="Appearance, Language & Timezone" icon={SlidersIcon} tone="accent">
      <div className="grid gap-3">
        {row("settings-theme", "Theme", <Select id="settings-theme" value={s.theme} options={themes} onChange={(v) => onChange({ theme: v as AppearancePatch["theme"] }, "Theme")} />)}
        {row("settings-language", "Language", <Select id="settings-language" value={s.language} options={langs} onChange={(v) => onChange({ language: v }, "Language")} />)}
        {row("settings-timezone", "Timezone", <Select id="settings-timezone" value={s.timezone} options={zones} onChange={(v) => onChange({ timezone: v }, "Timezone")} />)}
      </div>
      <p className="mt-3 text-[12px] leading-snug text-muted">Your choices are saved to your account. The language is a label only; the app is not translated yet.</p>
    </Card>
  );
}

/* ── the right rail ─────────────────────────────────────────────────────────────────── */

function QuickActions() {
  const items: { key: string; label: string; hint: string; icon: ComponentType<IconProps>; tone: IconTone; href: string }[] = [
    { key: "password", label: "Update Password", hint: "Keep your account secure", icon: LockIcon, tone: "accent", href: ACCOUNT_SETTINGS_PATH },
    { key: "notifications", label: "Manage Notifications", hint: "Customize your notification preferences", icon: BellIcon, tone: "accent", href: `${BASE}/notifications` },
    { key: "preferences", label: "Edit Preferences", hint: "Update your career and display preferences", icon: SlidersIcon, tone: "accent", href: `${BASE}/profile` },
    { key: "tools", label: "Connect Tools", hint: "Add or manage your connected accounts", icon: LinkIcon, tone: "accent", href: "#settings-tools" },
    { key: "marketer", label: "Contact My Marketer", hint: "Get personalized support", icon: MailIcon, tone: "accent", href: `${BASE}/marketer` },
  ];
  return (
    <Card id="settings-quick" title="Quick Actions" icon={ZapIcon}>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-1">
        {items.map((q) => {
          const Icon = q.icon;
          return (
            <li key={q.key} className="min-w-0">
              <Link href={q.href} data-quick={q.key} className="flex h-full min-h-[64px] w-full items-center gap-2.5 rounded-xl border border-line bg-paper p-2.5 text-left hover:bg-paper-2/60">
                <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-lg", TONES[q.tone])}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold leading-tight text-ink">{q.label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted">{q.hint}</span>
                </span>
                <ChevronRightIcon size={15} className="flex-none text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const DOT: Record<string, string> = { green: "bg-v2-green-ink", amber: "bg-v2-amber-ink", blue: "bg-accent-deep", red: "bg-v2-coral-ink", violet: "bg-v2-violet-ink", slate: "bg-muted" };

function ActivityCard({ view }: { view: SettingsView }) {
  return (
    <Card id="settings-activity" title="Recent Account Activity" icon={ClockIcon} tone="accent">
      {view.activity.length === 0 ? (
        <Empty>No activity yet. Changes you make here will show up.</Empty>
      ) : (
        <ol className="grid gap-3.5">
          {view.activity.map((a, i) => (
            <li key={`${a.kind}-${a.at}-${i}`} data-activity={a.kind} className="flex gap-3">
              <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 flex-none rounded-full", DOT[activityTone(a.kind)])} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] font-bold text-ink">
                  <span>{a.label}</span>
                  <span className="text-[11.5px] font-normal text-muted">{whenText(a.at)}</span>
                </p>
                {a.detail ? <p className="text-[12px] leading-snug text-muted">{a.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

const withPrivacy = (v: SettingsView, settings: SettingsView["settings"]): SettingsView => ({ ...v, settings, tiles: { ...v.tiles, privacy: { ...v.tiles.privacy, level: levelOf(settings) } } });

export interface SettingsPageProps {
  orgId: number;
  firstName: string;
}

export default function ConsultantSettingsPage({ orgId, firstName: first }: SettingsPageProps) {
  const toast = useToast();
  const { view, status, reload, setView } = useWorkspaceData(useCallback(() => fetchSettings(orgId), [orgId]));
  const [problem, setProblem] = useState<string | null>(null);
  const viewRef = useRef<SettingsView | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /** Optimistic write: show the new value at once, keep the API's answer, or put the old page back and say why. */
  const run = async (what: string, optimistic: (v: SettingsView) => SettingsView, send: () => Promise<WriteResult>, undo: (before: SettingsView) => (() => void) | null) => {
    const before = viewRef.current;
    if (!before) return;
    setProblem(null);
    setView(optimistic(before));
    const r = await send();
    if (r.kind === "OK") {
      setView(r.view);
      const back = undo(before);
      toast({ title: `${what} saved`, variant: "success", action: back ? { label: "Undo", onClick: back } : undefined });
      return;
    }
    setView(before);
    if (r.kind === "DENIED") void reload();
    const msg = r.kind === "INVALID" ? r.message : "That change wasn't saved. Nothing changed.";
    setProblem(msg);
    toast({ title: `${what} not saved`, description: msg, variant: "error" });
  };

  const changePrivacy = (patch: PrivacyPatch, what: string) =>
    run(
      what,
      (v) => withPrivacy(v, applyPrivacy(v.settings, patch)),
      () => savePrivacy(orgId, patch),
      (before) => {
        const inverse = inversePrivacy(before.settings, patch);
        return () => void run(`${what} restored`, (v) => withPrivacy(v, applyPrivacy(v.settings, inverse)),() => savePrivacy(orgId, inverse), () => null);
      },
    );

  const changeAppearance = (patch: AppearancePatch, what: string) =>
    run(
      what,
      (v) => ({ ...v, settings: { ...v.settings, ...patch, isDefault: false } }),
      () => saveAppearance(orgId, patch),
      (before) => {
        const inverse = inverseAppearance(before.settings, patch);
        return () => void run(`${what} restored`, (v) => ({ ...v, settings: { ...v.settings, ...inverse, isDefault: false } }), () => saveAppearance(orgId, inverse), () => null);
      },
    );

  if (status === "denied") return <ErrorState what="your workspace" title="This page isn't part of your role" description="Ask an organization admin if you should see it." variant="inline" />;

  return (
    <div data-consultant-settings data-status={status} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Settings" subtitle="Manage your account, preferences, privacy, and connected tools to personalize your experience." />
      <ClaimsMascot />
      <ClaimsHelpCard />

      {status === "failed" ? (
        <ErrorState what="your settings" description="Your settings didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className={cn(CARD, "")} />
      ) : (
        <>
          <Tiles view={view} />
          {problem ? (
            <p role="alert" data-settings-problem className="rounded-lg bg-v2-coral-soft p-3 text-[13px] text-v2-coral-ink">
              {problem}
            </p>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.42fr)]">
            {view ? (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <AccountCard view={view} />
                <CareerCard view={view} />
                <NotificationsCard />
                <PrivacyCard view={view} onChange={(p, w) => void changePrivacy(p, w)} />
                <SecurityCard />
                <ToolsCard view={view} />
                <DocumentsCard view={view} />
                <AppearanceCard view={view} onChange={(p, w) => void changeAppearance(p, w)} />
              </div>
            ) : (
              <div className="grid gap-4" aria-busy="true">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)]">
              <BeeCard
                name={firstName(first)}
                title="Your marketing buddy, here to help!"
                body="You can manage your account settings, privacy preferences, notification choices, and connected tools here. Keeping your information up to date helps us find better opportunities for you."
              />
              <QuickActions />
              {view ? <ActivityCard view={view} /> : <Skeleton className="h-64 w-full" />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
