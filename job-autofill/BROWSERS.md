# Browser support & porting notes

Where the Dossier extension runs, and what each browser needs. Phase 7 of `ROADMAP.md`.

## Compatibility matrix

| Browser | Status | Notes |
|---|---|---|
| **Chrome** | ✅ Supported (primary) | MV3; published via the Chrome Web Store (`DEPLOY.md` §8). |
| **Edge** | ✅ Supported (7.1) | Chromium/MV3 — runs the **same bundle unchanged**. See below. |
| **Firefox** | ✅ Supported, **121+** (7.2) | Same bundle; manifest carries a `gecko` block. **Needs a live `web-ext` verification pass** before publishing — see below. |
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

## Firefox (7.2)

Targets **Firefox 121+**, which supports the MV3 `background.service_worker` (so our
`importScripts`-based service worker runs) and exposes the `chrome.*` namespace as callback-style
aliases (so our `chrome.*` calls work without a polyfill). The **same bundle** is used — the only
Firefox-specific piece is a `browser_specific_settings.gecko` block in `manifest.json`, which Chrome
ignores:

```json
"browser_specific_settings": {
  "gecko": { "id": "dossier@kiwiply.com", "strict_min_version": "121.0" }
}
```

So one `manifest.json` and one zip serve Chrome, Edge, **and** Firefox/AMO. No code change, no
`browser.*` rewrite. (Chrome may log a harmless "Unrecognized manifest key" warning for the gecko
block; it loads and runs normally — this key is the standard cross-browser convention.)

### ⚠️ Verify on Firefox before publishing (REQUIRED)
The API audit and manifest are correct on paper, but Firefox's MV3 has historically had
background-service-worker quirks — confirm at runtime on a current Firefox:

1. Install tooling (one-off): `npm i -g web-ext` (or use `npx`).
2. **Lint:** from `job-autofill/`, run `web-ext lint`. It must pass with no errors. If it rejects
   `background.service_worker`, fall back to an event-page manifest for Firefox only
   (`"background": { "scripts": [...all the importScripts files...] }`) generated at package time —
   see the contingency note below.
3. **Run:** `web-ext run` (launches a temp Firefox with the extension), or sideload manually via
   `about:debugging` → **This Firefox** → **Load Temporary Add-on** → pick `manifest.json`.
4. **Smoke test the full path** on a real ATS: pick a resume → fill → confirm tracking (DRAFT →
   APPLIED), the popup "Save this job", BYO-key + Dossier-AI drafting, and that the **background
   service worker is alive** (check `about:debugging` → Inspect). These are the bits most likely to
   differ from Chrome.

**Contingency (only if `service_worker` background fails on Firefox):** keep Chrome on
`service_worker` and generate a Firefox manifest at package time that uses `background.scripts`
(listing the libs the SW `importScripts`es, in order) — a small packaging script like
`.github/scripts/inject-ga.js`. Not needed unless step 2/4 shows the SW doesn't run.

### Publish to Firefox Add-ons (AMO)
Submit the **same zip** the Chrome workflow builds to https://addons.mozilla.org (one-time free
developer account). AMO runs the same `web-ext lint` checks, so pass step 2 first. The
`gecko.id` above is the add-on's stable identifier.

## Safari (7.3) — deferred

Needs Apple's `safari-web-extension-converter` plus an Xcode project and a Mac, and is a bigger
lift — done last. See `ROADMAP.md` Phase 7.
