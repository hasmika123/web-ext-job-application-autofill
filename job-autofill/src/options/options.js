/* options.js — slim extension settings + account status.
 *
 * Profile, resumes, and the job board are managed on kiwiply.com (the single source of
 * truth). This page only holds device-local settings (AI key, filling defaults, analytics)
 * and shows / manages the connected account. Sign-in happens on the web (the /connect
 * handoff stores the session); there is no login form here. */
const S = window.JAF.storage;
const TRACK = window.JAF.tracking;
const $ = (id) => document.getElementById(id);

const WEB = "https://kiwiply.com";
const tokenStore = TRACK.chromeTokenStore();

function readToken() {
  // Read directly (not via the cached token store) so the connect handoff reflects live.
  return new Promise((res) => chrome.storage.local.get("trackingAuth", (o) => res((o && o.trackingAuth) || {})));
}

async function init() {
  const s = await S.getSettings();
  $("llm").checked = !!s.llmEnabled;
  $("apikey").value = s.apiKey || "";
  $("server-ai").checked = !!s.serverAiEnabled;
  $("server-ai-consent").checked = !!s.serverAiConsent;
  $("autoadv-default").checked = !!s.autoAdvance;
  $("autoadd-default").checked = s.autoAddRows !== false; // default on
  $("analytics").checked = !s.analyticsOptOut; // checkbox = "share"; opt-out is the inverse

  $("save-settings").onclick = saveSettings;
  $("connect").onclick = () => window.open(WEB + "/connect", "_blank", "noopener");
  $("signout").onclick = signOut;
  $("manage").href = WEB + "/dashboard";
  $("bug-send").onclick = () => sendBug().catch((e) => setBugStatus(String(e.message || e), "err"));

  // The popup's bug icon deep-links here with #bug — land the user on the form.
  if (location.hash === "#bug") {
    $("bug").scrollIntoView({ behavior: "smooth", block: "start" });
    $("bug-message").focus({ preventScroll: true });
  }

  await refreshAccount();
}

function setBugStatus(msg, state) {
  const s = $("bug-status");
  s.textContent = msg;
  s.style.color = state === "ok" ? "var(--ok)" : state ? "var(--warn)" : "var(--muted)";
}

// Report a bug / idea — submits via the same tracking seam the popup used (auth-optional:
// the access token is attached if connected, but the endpoint accepts anonymous reports too).
async function sendBug() {
  const message = $("bug-message").value.trim();
  if (!message) return setBugStatus("Please describe the issue.", "err");

  const s = await S.getSettings();
  const report = { message, category: $("bug-category").value, appVersion: chrome.runtime.getManifest().version };
  if ($("bug-consent").checked) report.userAgent = navigator.userAgent; // diagnostic context, opt-in

  setBugStatus("Sending…");
  $("bug-send").disabled = true;
  try {
    const provider = TRACK.createKiwiplyProvider({ baseUrl: s.apiBaseUrl || "https://api.kiwiply.com", tokenStore });
    await provider.submitBugReport(report);
    $("bug-message").value = "";
    setBugStatus("Thanks! Your report was sent.", "ok");
  } catch (e) {
    setBugStatus("Couldn't send — please try again.", "err");
  } finally {
    $("bug-send").disabled = false;
  }
}

async function saveSettings() {
  const s = await S.getSettings();
  s.llmEnabled = $("llm").checked;
  s.apiKey = $("apikey").value.trim();
  s.serverAiEnabled = $("server-ai").checked;
  s.serverAiConsent = $("server-ai-consent").checked;
  s.autoAdvance = $("autoadv-default").checked;
  s.autoAddRows = $("autoadd-default").checked;
  s.analyticsOptOut = !$("analytics").checked;
  if (!s.apiBaseUrl) s.apiBaseUrl = "https://api.kiwiply.com";
  await S.saveSettings(s);
  $("settings-saved").textContent = "Saved ✓";
  setTimeout(() => ($("settings-saved").textContent = ""), 1500);
}

async function refreshAccount() {
  const tok = await readToken();
  const connected = !!(tok && tok.access);
  $("acct-connected").classList.toggle("hidden", !connected);
  $("acct-disconnected").classList.toggle("hidden", connected);
  if (connected) $("acct-who").textContent = tok.username || "your account";
}

async function signOut() {
  try {
    const s = await S.getSettings();
    const provider = TRACK.createKiwiplyProvider({ baseUrl: s.apiBaseUrl || "https://api.kiwiply.com", tokenStore });
    if (provider.logout) await provider.logout();
  } catch (e) {
    /* best-effort revoke */
  }
  await tokenStore.clear();
  await refreshAccount();
}

// Reflect the connect handoff (stored by the service worker) without a reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.trackingAuth) refreshAccount();
});

init();
