/**
 * Options UI — the slim settings page (device-local settings + connected account + bug
 * report), redesigned on the shared @kiwiply/ui design system (W5.3): a sectioned nav rail +
 * consistent Cards and controls (Switch/Field/Input/Select/Button/Badge). Engine logic lives
 * in actions.ts (unchanged). Profile/resumes/board are managed on kiwiply.com — no login here.
 */
import { useEffect, useRef, useState } from "react";
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
} from "@kiwiply/ui";
import { loadSettings, saveSettings, readAccount, signOut, sendBug, WEB, type Settings, type Account } from "./actions";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "ai", label: "AI drafting" },
  { id: "filling", label: "Filling" },
  { id: "bug", label: "Feedback" },
] as const;

const subhead = "text-[11.5px] font-bold uppercase tracking-[0.06em] text-accent-deep";
const hint = "text-[12.5px] leading-relaxed text-muted";

export function OptionsApp() {
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [account, setAccount] = useState<Account>({ connected: false, who: "" });
  const [bug, setBug] = useState({ category: "BUG", message: "", consent: true });
  const [bugStatus, setBugStatus] = useState<{ msg: string; kind: "ok" | "err" | "neutral" }>({ msg: "", kind: "neutral" });
  const [bugSending, setBugSending] = useState(false);

  const bugMsgRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSettings().then(setForm);
    readAccount().then(setAccount);
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
        <header className="flex items-center gap-3.5">
          <img src="/icons/logo-icon.png" alt="Kiwiply" className="h-[42px] w-auto" />
          <div>
            <h1 className="font-display text-[22px] font-semibold">Extension settings</h1>
            <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-muted">
              Your profile, resumes, and job board live on <b>kiwiply.com</b>. This page only holds the extension&rsquo;s device settings.
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
                    className="block rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-paper hover:text-ink"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-5">
            {/* Account */}
            <Card id="account" className="scroll-mt-6">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Account</CardTitle>
                  <Badge variant={account.connected ? "ok" : "neutral"}>
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
                  label="Use Kiwiply AI to draft answers"
                  description="Sends the question + a short profile summary to your Kiwiply account, which uses Google Gemini (free tier — Google may use it to improve its services) to draft an answer you review. Off by default; requires being connected + your consent. Your own key takes priority."
                />
                <Switch
                  checked={!!form?.serverAiConsent}
                  onCheckedChange={(v) => patch({ serverAiConsent: v })}
                  label="I consent to sending my question + profile summary to Google Gemini for drafting"
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
                {saved && <span className="text-[12.5px] font-semibold text-accent-deep">Saved ✓</span>}
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
                  <Select value={bug.category} onChange={(e) => setBug((b) => ({ ...b, category: e.target.value }))}>
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
                {bugStatus.msg && <span className={`text-[12.5px] font-medium ${bugColor}`}>{bugStatus.msg}</span>}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
