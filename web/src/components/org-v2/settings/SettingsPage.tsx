"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  BellIcon,
  BuildingIcon,
  MapPinIcon,
  PlusIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  GearIcon,
  Input,
  RefreshIcon,
  Select,
  ShieldCheckIcon,
  SparklesIcon,
  Switch,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import {
  InitialsAvatar,
  StatusChip,
  SectionCard,
  ToolbarButton,
  UnderlineTabs,
  type TabDef,
} from "@/components/app-v2/common";
import OrgPageHero from "../shell/OrgPageHero";
import {
  ABOUT_COMPANY,
  ADMIN_ROLES,
  APPROVAL_RULES,
  COMPANY_SIZES,
  DEFAULT_ROLES,
  INDUSTRIES,
  PERMISSION_TOGGLES,
  SECURITY_CHECKS,
} from "../sample-data";

const TABS: TabDef[] = [
  { id: "profile", label: "Organization Profile", icon: <BuildingIcon /> },
  { id: "permissions", label: "Team Permissions", icon: <UsersIcon /> },
  { id: "notifications", label: "Notification Rules", icon: <BellIcon /> },
  { id: "workflow", label: "Placement Workflow", icon: <RefreshIcon /> },
  { id: "branding", label: "Branding", icon: <SparklesIcon /> },
  { id: "security", label: "Security & SSO", icon: <ShieldCheckIcon /> },
  { id: "audit", label: "Audit Logs", icon: <ClipboardIcon /> },
];

const ABOUT_MAX = 500;
const FIELD = "rounded-[10px]! border-[#DCE2EE]! py-2.5! text-[13.5px]! text-v2-navy!";

function Labeled({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-semibold text-v2-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

/** "Save Changes" button that confirms for a moment (no persistence yet - board data only). */
function SaveButton() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <ToolbarButton size="md"
      variant="solid"
      icon={saved ? <CheckIcon /> : undefined}
      onClick={() => {
        setSaved(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setSaved(false), 1800);
      }}
    >
      {saved ? "Saved" : "Save Changes"}
    </ToolbarButton>
  );
}

function PanelHeader({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-bold leading-tight tracking-normal text-v2-navy">{title}</h2>
        <p className="mt-1 text-[13px] text-v2-ink-soft">{body}</p>
      </div>
      <SaveButton />
    </div>
  );
}

function OrganizationProfile() {
  const id = useId();
  const [name, setName] = useState("Acme Corp");
  const [industry, setIndustry] = useState("Technology");
  const [email, setEmail] = useState("careers@acmecorp.com");
  const [size, setSize] = useState("501 - 1,000 employees");
  const [site, setSite] = useState("https://www.acmecorp.com");
  const [loc, setLoc] = useState("San Francisco, CA");
  const [about, setAbout] = useState(ABOUT_COMPANY);

  return (
    <div>
      <PanelHeader title="Organization Profile" body="Manage your company information and workspace settings." />

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <span className="flex h-[76px] w-[76px] flex-none items-center justify-center rounded-2xl border border-dashed border-[#C9D3E8] bg-v2-blue-soft text-v2-blue [&>svg]:h-8 [&>svg]:w-8">
          <BuildingIcon />
        </span>
        <div>
          <ToolbarButton size="md" variant="outline">Change Logo</ToolbarButton>
          <p className="mt-1.5 text-[12px] text-v2-muted">JPG, PNG up to 2MB</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
        <Labeled label="Company Name" htmlFor={`${id}-name`}>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        </Labeled>
        <Labeled label="Industry">
          <Select aria-label="Industry" value={industry} onChange={setIndustry} options={INDUSTRIES.map((o) => ({ value: o, label: o }))} className={FIELD} />
        </Labeled>
        <Labeled label="Company Email" htmlFor={`${id}-email`}>
          <Input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
        </Labeled>
        <Labeled label="Company Size">
          <Select aria-label="Company Size" value={size} onChange={setSize} options={COMPANY_SIZES.map((o) => ({ value: o, label: o }))} className={FIELD} />
        </Labeled>
        <Labeled label="Website" htmlFor={`${id}-site`}>
          <Input id={`${id}-site`} type="url" value={site} onChange={(e) => setSite(e.target.value)} className={FIELD} />
        </Labeled>
        <Labeled label="Location" htmlFor={`${id}-loc`}>
          <div className="relative">
            <MapPinIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v2-coral" />
            <Input id={`${id}-loc`} value={loc} onChange={(e) => setLoc(e.target.value)} className={cn(FIELD, "pl-9!")} />
          </div>
        </Labeled>
        <div className="md:col-span-2">
          <Labeled label="About Company" htmlFor={`${id}-about`}>
            <div className="relative">
              <textarea
                id={`${id}-about`}
                rows={4}
                maxLength={ABOUT_MAX}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="w-full resize-y rounded-[10px] border border-[#DCE2EE] bg-white px-3.5 py-3 pb-7 text-[16px] leading-relaxed text-v2-navy outline-none placeholder:text-v2-muted focus:border-v2-blue/50 focus:shadow-[0_0_0_3px_var(--color-v2-blue-soft)] sm:text-[13.5px]"
              />
              <span className="pointer-events-none absolute bottom-2.5 right-3.5 text-[12px] text-v2-muted">
                {about.length}/{ABOUT_MAX}
              </span>
            </div>
          </Labeled>
        </div>
      </div>
    </div>
  );
}

function TeamPermissions() {
  const [role, setRole] = useState("Recruiter");
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(PERMISSION_TOGGLES.map((t) => [t.id, t.on])));
  return (
    <div>
      <PanelHeader title="Team Permissions" body="Set default permissions and access levels for your team members." />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF1F7] pb-5">
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-v2-navy">Default Role for New Members</div>
          <p className="mt-0.5 text-[12.5px] text-v2-ink-soft">Set the default role when inviting new team members.</p>
        </div>
        <div className="w-full sm:w-[200px]">
          <Select aria-label="Default role for new members" value={role} onChange={setRole} options={DEFAULT_ROLES.map((o) => ({ value: o, label: o }))} className={FIELD} />
        </div>
      </div>

      <ul className="divide-y divide-[#EEF1F7]">
        {PERMISSION_TOGGLES.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <div id={`perm-${t.id}`} className="text-[14px] font-bold text-v2-navy">
                {t.label}
              </div>
              <p className="mt-0.5 text-[12.5px] text-v2-ink-soft">{t.body}</p>
            </div>
            <Switch
              aria-labelledby={`perm-${t.id}`}
              checked={on[t.id]}
              onCheckedChange={(v) => setOn((p) => ({ ...p, [t.id]: v }))}
              className={on[t.id] ? "bg-v2-green!" : ""}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl bg-[#F6F8FC] px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-v2-blue-soft text-v2-blue">
        <GearIcon className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-[17px] font-bold tracking-normal text-v2-navy">{label}</h2>
      <p className="mt-1 text-[13px] text-v2-ink-soft">Coming soon — we&apos;re still building this part of your workspace settings.</p>
    </div>
  );
}

function AdminRoles() {
  return (
    <SectionCard title="Admin Roles" action={{ label: "View all", href: "/org/team" }}>
      <ul className="divide-y divide-[#EEF1F7]">
        {ADMIN_ROLES.map((a) => (
          <li key={a.email} className="flex items-center gap-3 py-3">
            <InitialsAvatar name={a.name} size={38} />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold text-v2-navy">{a.name}</div>
              <div className="truncate text-[12px] text-v2-muted">{a.email}</div>
            </div>
            <StatusChip tone={a.tone}>{a.role}</StatusChip>
          </li>
        ))}
      </ul>
      <ToolbarButton size="md" variant="soft-blue" className="mt-3 w-full" icon={<PlusIcon />}>
        Add Admin
      </ToolbarButton>
    </SectionCard>
  );
}

function ApprovalRules() {
  return (
    <SectionCard title="Approval Rules" headerExtra={<button type="button" className="cursor-pointer text-[13px] font-semibold text-v2-blue hover:underline">Edit</button>}>
      <ul className="divide-y divide-[#EEF1F7]">
        {APPROVAL_RULES.map((r) => (
          <li key={r.title}>
            <button type="button" className="flex w-full cursor-pointer items-center gap-3 py-3 text-left hover:bg-[#F9FBFF]">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-v2-navy">{r.title}</span>
                <span className="block text-[12.5px] text-v2-ink-soft">{r.body}</span>
              </span>
              <ChevronRightIcon className="h-4 w-4 flex-none text-v2-muted" />
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function SecurityStatus() {
  return (
    <SectionCard title="Security Status" action={{ label: "View details", href: "/org/settings" }}>
      <div className="flex items-center gap-3.5 rounded-xl bg-v2-green-soft p-3.5">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white text-v2-green [&>svg]:h-6 [&>svg]:w-6">
          <ShieldCheckIcon />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold text-[#168A2E]">Secure</div>
          <p className="text-[12.5px] leading-snug text-v2-ink-soft">Your workspace is protected with enterprise-grade security.</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2.5">
        {SECURITY_CHECKS.map((c) => (
          <li key={c} className="flex items-center gap-2.5 text-[13px] text-v2-navy">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-v2-green-soft text-v2-green">
              <CheckIcon className="h-3 w-3" strokeWidth={3} />
            </span>
            {c}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Settings body (spec 6.4). Renders inside the org shell. */
export default function SettingsPage() {
  const [tab, setTab] = useState("profile");
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="space-y-4">
      <OrgPageHero
        title="Settings"
        icon={<GearIcon />}
        subtitle="Configure your enterprise workspace, manage permissions, and customize your hiring experience."
        note="Build a stronger team together."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 rounded-2xl bg-white shadow-v2-card">
          <UnderlineTabs tone="blue" padded tabs={TABS} value={tab} onChange={setTab} ariaLabel="Settings sections" className="px-2 sm:px-3" />
          <div className="p-4 sm:p-6" role="tabpanel" aria-label={current.label}>
            {tab === "profile" ? <OrganizationProfile /> : tab === "permissions" ? <TeamPermissions /> : <ComingSoon label={current.label} />}
          </div>
        </section>

        <div className="space-y-4">
          <AdminRoles />
          <ApprovalRules />
          <SecurityStatus />
        </div>
      </div>
    </div>
  );
}
