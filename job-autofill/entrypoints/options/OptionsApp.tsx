/**
 * Options UI (W4.2) — the React port of the slim settings page (device-local settings + connected
 * account + bug report), on the shared design tokens (Tailwind). Engine logic lives in actions.ts.
 * Profile/resumes/board are managed on kiwiply.com; there is no login form here.
 */
import { useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings, readAccount, signOut, sendBug, WEB, type Settings, type Account } from "./actions";

const card = "mb-4 rounded-2xl border border-line bg-paper px-5 py-[18px]";
const h2 = "mb-2.5 text-base font-semibold text-ink";
const toggle = "my-2 flex cursor-pointer items-center gap-[9px] text-[13.5px] text-ink";
const input =
  "w-full rounded-[10px] border border-line bg-white px-[11px] py-[9px] text-[13.5px] text-ink outline-none focus:border-accent focus:outline-2 focus:outline-offset-[-1px] focus:outline-accent";
const hint = "my-1 max-w-[60ch] text-xs leading-relaxed text-muted";
const opthead = "text-[12.5px] font-bold uppercase tracking-[0.05em] text-accent-deep";
const primary = "rounded-[11px] bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-paper transition-colors hover:bg-ink-soft disabled:opacity-50";
const ghost = "rounded-[11px] border border-line bg-white px-[18px] py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-accent";
const cb = "accent-[var(--accent)]";

export function OptionsApp() {
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [account, setAccount] = useState<Account>({ connected: false, who: "" });
  const [bug, setBug] = useState({ category: "BUG", message: "", consent: true });
  const [bugStatus, setBugStatus] = useState<{ msg: string; kind: "ok" | "err" | "neutral" }>({ msg: "", kind: "neutral" });
  const [bugSending, setBugSending] = useState(false);

  const bugRef = useRef<HTMLElement>(null);
  const bugMsgRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadSettings().then(setForm);
    readAccount().then(setAccount);
    const onChange = (changes: { [k: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.trackingAuth) readAccount().then(setAccount);
    };
    chrome.storage.onChanged.addListener(onChange);
    // The popup's bug icon deep-links here with #bug — land the user on the form.
    if (location.hash === "#bug") {
      bugRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const bugColor = bugStatus.kind === "ok" ? "text-ok" : bugStatus.kind === "err" ? "text-warn" : "text-muted";

  return (
    <main className="mx-auto max-w-[640px] px-5 pb-14 pt-[30px] font-body text-ink">
      <header className="mb-[22px] flex items-center gap-3.5">
        <img src="/icons/logo-icon.png" alt="Kiwiply" className="h-[42px] w-auto" />
        <div>
          <h1 className="font-display text-[22px] font-semibold">Extension settings</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Your profile, resumes, and job board live on <b>kiwiply.com</b>. This page only holds the extension&rsquo;s device settings.
          </p>
        </div>
      </header>

      {/* Account */}
      <section className={card}>
        <h2 className={h2}>Account</h2>
        {account.connected ? (
          <>
            <p className="text-sm">
              Connected as <b>{account.who}</b>.
            </p>
            <div className="mt-3.5 flex items-center gap-3.5">
              <a className={`${primary} inline-flex items-center no-underline`} href={WEB + "/dashboard"} target="_blank" rel="noopener">
                Manage profile &amp; resumes →
              </a>
              <button className={ghost} onClick={onSignOut}>Sign out</button>
            </div>
          </>
        ) : (
          <>
            <p className={hint}>
              Sign in on the web to connect the extension to your account. Your profile and resumes sync down automatically for autofill — editing happens on kiwiply.com.
            </p>
            <div className="mt-3.5 flex items-center gap-3.5">
              <button className={primary} onClick={() => window.open(WEB + "/connect", "_blank", "noopener")}>Connect to kiwiply.com</button>
            </div>
          </>
        )}
      </section>

      {/* AI */}
      <section className={card}>
        <h2 className={h2}>AI answer drafting</h2>
        <p className={hint}>Open-ended questions (&ldquo;Why this role?&rdquo;) can get a draft you edit before using — your choice of two ways.</p>
        <div className="mt-3 border-t border-line pt-3">
          <div className={opthead}>Bring your own key</div>
          <label className={toggle}>
            <input type="checkbox" className={cb} checked={!!form?.llm} onChange={(e) => patch({ llm: e.target.checked })} /> Use the Anthropic API for cleaner parsing + unlimited drafting
          </label>
          <p className={hint}>Stored locally on this device only; sent only to api.anthropic.com.</p>
          <input
            className={input}
            type="password"
            placeholder="sk-ant-… (only used if the toggle is on)"
            value={form?.apikey ?? ""}
            onChange={(e) => patch({ apikey: e.target.value })}
          />
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <div className={opthead}>Kiwiply AI · no key needed</div>
          <label className={toggle}>
            <input type="checkbox" className={cb} checked={!!form?.serverAi} onChange={(e) => patch({ serverAi: e.target.checked })} /> Use Kiwiply AI to draft answers
          </label>
          <p className={hint}>
            Sends the question + a short profile summary to your Kiwiply account, which uses <b>Google Gemini</b> (free tier — Google may use it to improve its services) to draft
            an answer you review. Off by default; requires being connected + your consent. Your own key takes priority.
          </p>
          <label className={toggle}>
            <input type="checkbox" className={cb} checked={!!form?.serverAiConsent} onChange={(e) => patch({ serverAiConsent: e.target.checked })} /> I consent to sending my
            question + profile summary to Google Gemini for drafting
          </label>
        </div>
      </section>

      {/* Filling */}
      <section className={card}>
        <h2 className={h2}>Filling</h2>
        <label className={toggle}>
          <input type="checkbox" className={cb} checked={!!form?.autoAdv} onChange={(e) => patch({ autoAdv: e.target.checked })} /> Auto-advance: click <b>Next / Continue</b> after
          filling (never Submit)
        </label>
        <label className={toggle}>
          <input type="checkbox" className={cb} checked={!!form?.autoAdd} onChange={(e) => patch({ autoAdd: e.target.checked })} /> Auto-add rows for every resume role (Workday)
        </label>
        <hr className="my-6 border-line" />
        <label className={toggle}>
          <input type="checkbox" className={cb} checked={!!form?.analytics} onChange={(e) => patch({ analytics: e.target.checked })} /> Share anonymous usage analytics
        </label>
        <p className={hint}>
          Only anonymous event counts with a random ID — <b>never</b> your bio, resumes, answers, or the pages you visit. See <code>PRIVACY.md</code>.
        </p>
        <div className="mt-3.5 flex items-center gap-3.5">
          <button className={primary} onClick={onSave} disabled={!form}>Save settings</button>
          {saved && <span className="text-[12.5px] text-ok">Saved ✓</span>}
        </div>
      </section>

      {/* Bug report */}
      <section className={card} id="bug" ref={bugRef}>
        <h2 className={h2}>Report a bug or idea</h2>
        <p className={hint}>
          Found something broken, or have a suggestion? Send it straight to the team. Mention the site/page in your message — reports from settings aren&rsquo;t tied to a specific
          job page.
        </p>
        <select className={input} value={bug.category} onChange={(e) => setBug((b) => ({ ...b, category: e.target.value }))}>
          <option value="BUG">Bug</option>
          <option value="IDEA">Idea / feedback</option>
          <option value="OTHER">Other</option>
        </select>
        <textarea
          ref={bugMsgRef}
          className={`${input} mt-2.5 min-h-16 resize-y`}
          rows={4}
          maxLength={4000}
          placeholder="What happened, or what would you like?"
          value={bug.message}
          onChange={(e) => setBug((b) => ({ ...b, message: e.target.value }))}
        />
        <label className={toggle}>
          <input type="checkbox" className={cb} checked={bug.consent} onChange={(e) => setBug((b) => ({ ...b, consent: e.target.checked }))} /> Include my browser &amp; extension
          version to help us debug
        </label>
        <div className="mt-3.5 flex items-center gap-3.5">
          <button className={primary} onClick={onSendBug} disabled={bugSending}>Send report</button>
          {bugStatus.msg && <span className={`text-[12.5px] ${bugColor}`}>{bugStatus.msg}</span>}
        </div>
      </section>
    </main>
  );
}
