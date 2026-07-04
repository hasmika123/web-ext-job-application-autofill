/**
 * Options UI — the slim settings page (device-local settings + connected account + bug
 * report), redesigned on the shared @kiwiply/ui design system (W5.3): a sectioned nav rail +
 * consistent Cards and controls (Switch/Field/Input/Select/Button/Badge). Engine logic lives
 * in actions.ts (unchanged). Profile/resumes/board are managed on kiwiply.com — no login here.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Field,
  Input,
  Select,
  Switch,
  Badge,
  inputClass,
  MonitorIcon,
  MoonIcon as SharedMoonIcon,
  SunIcon as SharedSunIcon,
} from "@kiwiply/ui";
import { BrandLogo } from "../../lib/Brand";
import { loadSettings, saveSettings, readAccount, signOut, sendBug, WEB, type Settings, type Account } from "./actions";
import { getThemePref, setThemePref, type ThemePref } from "../../lib/theme";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "ai", label: "AI drafting" },
  { id: "filling", label: "Filling" },
  { id: "bug", label: "Feedback" },
] as const;

const THEMES: { value: ThemePref; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "system", label: "System", icon: <SystemIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

const subhead = "text-[11px] font-bold uppercase tracking-[.1em] text-accent-deep";
const hint = "text-[12.5px] leading-relaxed text-muted";

export function OptionsApp() {
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [account, setAccount] = useState<Account>({ connected: false, who: "" });
  const [bug, setBug] = useState({ category: "BUG", message: "", consent: true });
  const [bugStatus, setBugStatus] = useState<{ msg: string; kind: "ok" | "err" | "neutral" }>({ msg: "", kind: "neutral" });
  const [bugSending, setBugSending] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("account");
  const [theme, setTheme] = useState<ThemePref>("system");

  const bugMsgRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSettings().then(setForm);
    readAccount().then(setAccount);
    getThemePref().then(setTheme);
    const onChange = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.trackingAuth) readAccount().then(setAccount);
    };
    chrome.storage.onChanged.addListener(onChange);
    // The popup's bug link deep-links here with #bug — land the user on the form.
    if (location.hash === "#bug") {
      document.getElementById("bug")?.scrollIntoView({ behavior: "smooth", block: "start" });
      bugMsgRef.current?.focus({ preventScroll: true });
    }
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // Scroll-spy: highlight the nav link for the section currently in view.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const patch = (p: Partial<Settings>) => setForm((f) => (f ? { ...f, ...p } : f));

  async function onSave() {
    if (!form) return;
    await saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function onSignOut() {
    await signOut();
    setAccount(await readAccount());
  }

  function onPickTheme(v: ThemePref) {
    setTheme(v);
    void setThemePref(v); // the global initTheme() listener applies .dark across surfaces
  }

  async function onSendBug() {
    if (!bug.message.trim()) return setBugStatus({ msg: "Please describe the issue.", kind: "err" });
    setBugSending(true);
    setBugStatus({ msg: "Sending…", kind: "neutral" });
    try {
      await sendBug(bug);
      setBug((b) => ({ ...b, message: "" }));
      setBugStatus({ msg: "Thanks! Your report was sent.", kind: "ok" });
    } catch {
      setBugStatus({ msg: "Couldn't send — please try again.", kind: "err" });
    } finally {
      setBugSending(false);
    }
  }

  const bugColor = bugStatus.kind === "ok" ? "text-accent-deep" : bugStatus.kind === "err" ? "text-danger" : "text-muted";

  return (
    <div className="min-h-screen bg-app-bg">
      <main className="mx-auto max-w-[880px] px-6 pb-16 pt-10 font-body text-ink">
        <header className="flex flex-col gap-4">
          <BrandLogo height={24} />
          <div>
            <h1 className="font-display text-[26px] font-semibold leading-tight">Extension settings</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Your profile, resumes, and job board live on <b className="text-ink">kiwiply.com</b>. This page holds the extension&rsquo;s device settings.
            </p>
          </div>
        </header>

        <div className="mt-8 grid gap-8 md:grid-cols-[168px_1fr]">
          {/* Sectioned nav rail (wide screens) */}
          <nav className="hidden self-start md:sticky md:top-10 md:block" aria-label="Settings sections">
            <ul className="flex flex-col gap-0.5">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={activeSection === s.id ? "true" : undefined}
                    className={`block rounded-[var(--radius)] px-3 py-2 text-[13.5px] font-medium transition-colors ${
                      activeSection === s.id ? "bg-accent-soft font-semibold text-accent-deep" : "text-ink-soft hover:bg-paper-2"
                    }`}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="kiwi-fade-in flex min-w-0 flex-col gap-5">
            {/* Account */}
            <Card id="account" className="scroll-mt-6">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Account</CardTitle>
                  <Badge variant={account.connected ? "ready" : "review"}>
                    {account.connected ? "Connected" : "Not connected"}
                  </Badge>
                </div>
              </CardHeader>
              {account.connected ? (
                <>
                  <p className="text-sm text-ink-soft">
                    Connected as <b className="text-ink">{account.who}</b>.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <a href={WEB + "/dashboard"} target="_blank" rel="noopener" className="inline-flex">
                      <Button>Manage profile &amp; resumes →</Button>
                    </a>
                    <Button variant="ghost" onClick={onSignOut}>
                      Sign out
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className={hint}>
                    Sign in on the web to connect the extension to your account. Your profile and resumes sync down automatically for
                    autofill — editing happens on kiwiply.com.
                  </p>
                  <div className="mt-4">
                    <Button onClick={() => window.open(WEB + "/connect", "_blank", "noopener")}>Connect to kiwiply.com</Button>
                  </div>
                </>
              )}
            </Card>

            {/* Appearance */}
            <Card id="appearance" className="scroll-mt-6">
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Choose a theme for the extension&rsquo;s popup, settings, and review panel.</CardDescription>
              </CardHeader>
              <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-[var(--radius)] border border-line bg-paper-2 p-1">
                {THEMES.map((t) => {
                  const selected = theme === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onPickTheme(t.value)}
                      className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        selected ? "bg-paper text-ink shadow-[var(--shadow-sm)]" : "text-muted hover:text-ink"
                      }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 text-[12.5px] text-muted">System follows your device&rsquo;s light/dark setting.</p>
            </Card>

            {/* AI */}
            <Card id="ai" className="scroll-mt-6">
              <CardHeader>
                <CardTitle>AI answer drafting</CardTitle>
                <CardDescription>
                  Open-ended questions (&ldquo;Why this role?&rdquo;) can get a draft you edit before using — your choice of two ways.
                </CardDescription>
              </CardHeader>

              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <div className={subhead}>Bring your own key</div>
                <Switch
                  checked={!!form?.llm}
                  onCheckedChange={(v) => patch({ llm: v })}
                  label="Use the Anthropic API for cleaner parsing + unlimited drafting"
                  description="Stored locally on this device only; sent only to api.anthropic.com."
                />
                <Field label="Anthropic API key" className="mt-1">
                  <Input
                    type="password"
                    placeholder="sk-ant-… (only used if the toggle is on)"
                    value={form?.apikey ?? ""}
                    onChange={(e) => patch({ apikey: e.target.value })}
                  />
                </Field>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
                <div className={subhead}>Kiwiply AI · no key needed</div>
                <Switch
                  checked={!!form?.serverAi}
                  onCheckedChange={(v) => patch({ serverAi: v })}
                  label="Use Kiwiply AI to draft answers and parse resumes"
                  description="Drafting sends the question + a short profile summary; resume parsing sends the resume you upload. Both go to your Kiwiply account, which uses Google Gemini (free tier — Google may use it to improve its services); you review the result. Off by default; requires being connected + your consent. Your own key takes priority."
                />
                <Switch
                  checked={!!form?.serverAiConsent}
                  onCheckedChange={(v) => patch({ serverAiConsent: v })}
                  label="I consent to sending my question + profile summary (and, when parsing, my resume) to Google Gemini"
                />
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
                <div className={subhead}>Job-detail enrichment</div>
                <Switch
                  checked={!!form?.jobAi}
                  onCheckedChange={(v) => patch({ jobAi: v })}
                  label="Use AI to fill gaps in captured job details (job type, workplace, salary)"
                  description="When a posting states these only in prose, sends the job posting's public text — never your profile or resume — to the AI you chose above (your key first, else Kiwiply AI) and fills only the missing fields; details the page states directly are never overridden. Off by default; needs one of the two AI options above turned on."
                />
              </div>
            </Card>

            {/* Filling */}
            <Card id="filling" className="scroll-mt-6">
              <CardHeader>
                <CardTitle>Filling</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-3.5">
                <Switch
                  checked={!!form?.autoAdv}
                  onCheckedChange={(v) => patch({ autoAdv: v })}
                  label="Auto-advance: click Next / Continue after filling (never Submit)"
                />
                <Switch
                  checked={!!form?.autoAdd}
                  onCheckedChange={(v) => patch({ autoAdd: v })}
                  label="Auto-add rows for every resume role (Workday)"
                />
                <div className="border-t border-line pt-3.5">
                  <Switch
                    checked={!!form?.analytics}
                    onCheckedChange={(v) => patch({ analytics: v })}
                    label="Share anonymous usage analytics"
                    description="Only anonymous event counts with a random ID — never your bio, resumes, answers, or the pages you visit. See PRIVACY.md."
                  />
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
                <Button onClick={onSave} disabled={!form}>
                  Save settings
                </Button>
                <span role="status" aria-live="polite" className="text-[12.5px] font-semibold text-accent-deep">
                  {saved ? "Saved ✓" : ""}
                </span>
              </div>
            </Card>

            {/* Bug report */}
            <Card id="bug" className="scroll-mt-6">
              <CardHeader>
                <CardTitle>Report a bug or idea</CardTitle>
                <CardDescription>
                  Found something broken, or have a suggestion? Send it straight to the team. Mention the site/page in your message —
                  reports from settings aren&rsquo;t tied to a specific job page.
                </CardDescription>
              </CardHeader>
              <div className="flex flex-col gap-3">
                <Field label="Type">
                  <Select aria-label="Type" value={bug.category} onChange={(v) => setBug((b) => ({ ...b, category: v }))}>
                    <option value="BUG">Bug</option>
                    <option value="IDEA">Idea / feedback</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </Field>
                <Field label="Message">
                  <textarea
                    ref={bugMsgRef}
                    className={`${inputClass} min-h-24 resize-y`}
                    rows={4}
                    maxLength={4000}
                    placeholder="What happened, or what would you like?"
                    value={bug.message}
                    onChange={(e) => setBug((b) => ({ ...b, message: e.target.value }))}
                  />
                </Field>
                <Switch
                  checked={bug.consent}
                  onCheckedChange={(v) => setBug((b) => ({ ...b, consent: v }))}
                  label="Include my browser & extension version to help us debug"
                />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={onSendBug} disabled={bugSending}>
                  Send report
                </Button>
                <span role="status" aria-live="polite" className={`text-[12.5px] font-medium ${bugColor}`}>
                  {bugStatus.msg}
                </span>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

// Shared icons (@kiwiply/ui), wrapped to keep this surface's established size.
function SunIcon() {
  return <SharedSunIcon className="h-4 w-4" />;
}

function MoonIcon() {
  return <SharedMoonIcon className="h-4 w-4" />;
}

function SystemIcon() {
  return <MonitorIcon strokeWidth={1.6} className="h-4 w-4" />;
}
