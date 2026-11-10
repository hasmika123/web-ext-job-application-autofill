"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronRightIcon,
  ErrorState,
  Select,
  ShieldIcon,
  Skeleton,
  SlidersIcon,
  Switch,
  cn,
  useToast,
} from "@kiwiply/ui";
import { CARD } from "@/components/ent/dashboard/parts";
import PageHeader from "@/components/ent/shell/ShellContext";
import FeaturesPage from "./FeaturesPage";
import { PageTabs, useUrlTab } from "./tabs";
import { BASE, Card, useWorkspaceData } from "./parts";
import {
  LANGUAGE_LABEL,
  THEMES,
  THEME_LABEL,
  VISIBILITIES,
  VISIBILITY_LABEL,
  applyPrivacy,
  fetchSettings,
  inverseAppearance,
  inversePrivacy,
  levelOf,
  saveAppearance,
  savePrivacy,
  timezoneLabel,
  timezoneOptions,
  type AppearancePatch,
  type PrivacyPatch,
  type SettingsView,
  type WriteResult,
} from "@/lib/ent/consultant-ws/settings";

/**
 * Consultant Settings (design/enterprise-consultant/settings.webp): one call to `GET /api/orgs/{orgId}/me-workspace/settings` draws the page
 * for the signed-in consultant. Real, consultant-isolated writes: Privacy & Sharing and Appearance / Language / Timezone (optimistic, with an
 * Undo toast). Account facts and career preferences are read-only summaries with an Edit link to the Profile page. Password, two-factor and
 * sign-in alerts are NOT handled here (no self-service API for tenant members exists): the rows say so and link to the account settings page.
 * Connected tools are not available yet (no integrations module): the rows are disabled and nothing is ever shown as connected. No password,
 * token, key or phone number is displayed or stored; a phone is simply not collected.
 */

/* ── small pieces ───────────────────────────────────────────────────────────────────── */

function PrivacyCard({ view, onChange }: { view: SettingsView; onChange: (patch: PrivacyPatch, what: string) => void }) {
  const s = view.settings;
  const vis = VISIBILITY_LABEL[s.profileVisibility](view.orgName);
  const options = VISIBILITIES.map((v) => ({ value: v, label: VISIBILITY_LABEL[v](view.orgName).title }));
  return (
    <Card id="settings-privacy" title="Privacy" icon={ShieldIcon} tone="accent">
      <div className="grid gap-4">
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor="settings-visibility" className="text-[13.5px] font-bold text-ink">
            Profile visibility
          </label>
          <Select id="settings-visibility" value={s.profileVisibility} options={options} onChange={(v) => onChange({ profileVisibility: v as PrivacyPatch["profileVisibility"] }, "Profile visibility")} />
          <p data-visibility-hint className="text-[12px] leading-snug text-muted">
            {vis.hint}
          </p>
        </div>
        <Switch
          label="Share with employers"
          description={`Allow ${view.orgName} to share your profile with relevant employers.`}
          checked={s.shareProfileWithEmployers}
          onCheckedChange={(v) => onChange({ shareProfileWithEmployers: v }, "Sharing with employers")}
        />
        <Switch
          label="Show contact information"
          description="Keep your contact details private until you choose to share them."
          checked={s.showContactInformation}
          onCheckedChange={(v) => onChange({ showContactInformation: v }, "Contact information")}
        />
        <Switch label="Analytics" description="Help us improve your experience with anonymous usage data." checked={s.allowAnalytics} onCheckedChange={(v) => onChange({ allowAnalytics: v }, "Analytics usage")} />
      </div>
      {s.isDefault ? <p className="mt-3 text-[12px] text-muted">These are the default, private-leaning settings. Nothing has been changed yet.</p> : null}
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
    <Card id="settings-appearance" title="Appearance" icon={SlidersIcon} tone="accent">
      <div className="grid gap-3">
        {row("settings-theme", "Theme", <Select id="settings-theme" value={s.theme} options={themes} onChange={(v) => onChange({ theme: v as AppearancePatch["theme"] }, "Theme")} />)}
        {row("settings-language", "Language", <Select id="settings-language" value={s.language} options={langs} onChange={(v) => onChange({ language: v }, "Language")} />)}
        {row("settings-timezone", "Time zone", <Select id="settings-timezone" value={s.timezone} options={zones} onChange={(v) => onChange({ timezone: v }, "Timezone")} />)}
      </div>
      <p className="mt-3 text-[12px] leading-snug text-muted">Your choices are saved to your account. English only for now.</p>
    </Card>
  );
}

/* ── the page ───────────────────────────────────────────────────────────────────────── */

const withPrivacy = (v: SettingsView, settings: SettingsView["settings"]): SettingsView => ({ ...v, settings, tiles: { ...v.tiles, privacy: { ...v.tiles.privacy, level: levelOf(settings) } } });

export interface SettingsPageProps {
  orgId: number;
  firstName?: string;
  /** The member holds `features.view`: the Plan & features tab is drawn only then (the route reads it from the tenant session). */
  canViewFeatures?: boolean;
}

const TABS_ALL = ["privacy", "appearance", "features"] as const;
const TABS_NO_FEATURES = ["privacy", "appearance"] as const;
const TAB_LABEL = { privacy: "Privacy", appearance: "Appearance", features: "Plan & features" } as const;

/** The three links at the top: what used to be cards here now lives on My Profile and on the account page. */
const LINKS = [
  { key: "profile", label: "Profile and contact details", to: "My Profile", href: `${BASE}/profile` },
  { key: "notifications", label: "Notifications", to: "My profile › Notifications", href: "/me#notifications" },
  { key: "security", label: "Password and security", to: "My profile › Security", href: "/me#security" },
] as const;

export default function ConsultantSettingsPage({ orgId, canViewFeatures = true }: SettingsPageProps) {
  const tabKeys = canViewFeatures ? TABS_ALL : TABS_NO_FEATURES;
  const [tab, setTab] = useUrlTab(tabKeys, "privacy");
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
      <PageHeader title="Settings" subtitle="Privacy, appearance and your plan." />
      <ul aria-label="Other settings" data-settings-links className="grid gap-2 sm:grid-cols-3">
        {LINKS.map((x) => (
          <li key={x.key}>
            <Link href={x.href} data-settings-link={x.key} className="flex min-h-14 items-center gap-2.5 rounded-xl border border-line bg-paper px-3 py-2 hover:bg-paper-2/60">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold leading-tight text-ink">{x.label}</span>
                <span className="block text-[12px] leading-snug text-muted">{x.to}</span>
              </span>
              <ChevronRightIcon size={15} className="flex-none text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <PageTabs label="Settings views" tabs={tabKeys.map((k) => ({ value: k, label: TAB_LABEL[k] }))} value={tab} onChange={setTab} />

      {status === "failed" ? (
        <ErrorState what="your settings" description="Your settings didn't load. Nothing has changed." onRetry={() => void reload()} variant="inline" className={cn(CARD, "")} />
      ) : (
        <>
          {problem ? (
            <p role="alert" data-settings-problem className="rounded-lg bg-v2-coral-soft p-3 text-[13px] text-v2-coral-ink">
              {problem}
            </p>
          ) : null}
          {tab === "features" ? (
            <FeaturesPage orgId={orgId} />
          ) : view ? (
            <div className="grid max-w-2xl min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 sm:gap-5">
              {tab === "appearance" ? <AppearanceCard view={view} onChange={(p, w) => void changeAppearance(p, w)} /> : <PrivacyCard view={view} onChange={(p, w) => void changePrivacy(p, w)} />}
            </div>
          ) : (
            <div className="grid max-w-2xl gap-4" aria-busy="true">
              <Skeleton className="h-64 w-full" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
