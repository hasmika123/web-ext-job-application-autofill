# Browser support & porting notes

Where the Dossier extension runs, and what each browser needs. Phase 7 of `ROADMAP.md`.

## Compatibility matrix

| Browser | Status | Notes |
|---|---|---|
| **Chrome** | ✅ Supported (primary) | MV3; published via the Chrome Web Store (`DEPLOY.md` §8). |
| **Edge** | ✅ Supported (7.1) | Chromium/MV3 — runs the **same bundle unchanged**. See below. |
| **Firefox** | 🚧 Planned (7.2) | MV3 with `browser.*` differences + a `browser_specific_settings.gecko.id`; AMO submission. |
| **Safari** | ⏸️ Deferred (7.3) | Needs Apple's converter + Xcode/Mac; bigger lift, done last. |

## Why Edge is free

Edge is Chromium-based and implements the same MV3 extension platform as Chrome. The whole
surface we use is supported there:

- `chrome.storage.local` / `unlimitedStorage`
- `chrome.runtime` (`onInstalled`, `onMessage`, `sendMessage`, `getURL`, `openOptionsPage`, `lastError`)
- `chrome.tabs` (`create`, `query`, `sendMessage`, `onRemoved`)
- `chrome.webNavigation` (`onCompleted`, `getAllFrames`)
- `chrome.scripting` (`executeScript`)
- `chrome.action`

No Chrome-exclusive APIs are used (no `declarativeNetRequest`, `identity`, `gcm`, etc.), so there
is **no code change and no separate build** for Edge — the same `manifest.json` and the same
packaged zip work.

### Test it on Edge (sideload, ~2 min)
1. Open `edge://extensions`.
2. Toggle **Developer mode** (left sidebar).
3. **Load unpacked** → select the `job-autofill/` folder (or unzip the
   `dossier-extension` artifact and select that).
4. Pin it and run the same smoke test you'd run on Chrome (pick a resume, fill an ATS form,
   confirm tracking + the AI/BYO-key paths). Behavior should be identical.

### Publish to Edge Add-ons
The Edge Add-ons store takes the **same zip** the Chrome publish workflow builds
(`publish-extension.yml` → the `dossier-extension` artifact):
1. Register on the [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge)
   (Edge Program — one-time, free).
2. **Create new extension** → upload the zip → fill the listing (reuse the Chrome store copy and
   the `PRIVACY.md` data-use disclosure) → submit for certification.
3. *Automated updates (optional, later):* Edge has a Partner Center API; a `wdzeng/edge-addon`-style
   CI step could mirror the Chrome auto-publish once the first listing exists. Not wired yet —
   first submission is manual, same as Chrome.

> The analytics master switch and AI feature flags behave identically on Edge — they're
> driven by build-time config / server env, not the browser.

## Firefox (7.2) and Safari (7.3)

Tracked but not done. Firefox needs `browser.*`/`chrome.*` reconciliation (a small polyfill or the
WebExtension `browser` namespace), a `browser_specific_settings.gecko.id`, and AMO submission;
service-worker vs. background-script differences need a check. Safari needs Apple's
`safari-web-extension-converter` plus an Xcode project and is deferred. See `ROADMAP.md` Phase 7.
