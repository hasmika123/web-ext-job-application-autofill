# Browser support & porting notes

Where the Dossier extension runs, and what each browser needs. Phase 7 of `ROADMAP.md`.

## Compatibility matrix

| Browser | Status | Notes |
|---|---|---|
| **Chrome** | ✅ Supported (primary) | MV3; published via the Chrome Web Store (`DEPLOY.md` §8). |
| **Edge** | ✅ Supported (7.1) | Chromium/MV3 — runs the **same bundle unchanged**. See below. |
| **Firefox** | ✅ Supported, **140+** (7.2 / W6.1) | **Its own build** (`npm run build:firefox` → `.output/firefox-mv3`) and its own session-handoff path. `web-ext lint` passes with 0 errors. **Needs a live smoke test** before publishing — see below. |
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
is **no code change and no separate build** for Edge — the same generated manifest and the same
packaged zip work. (Firefox is the exception: it gets its own build — see below.)

### Test it on Edge (sideload, ~2 min)
1. Open `edge://extensions`.
2. Toggle **Developer mode** (left sidebar).
3. **Load unpacked** → select `job-autofill/.output/chrome-mv3` (build it first with
   `npm run build`), or unzip the `dossier-extension` artifact and select that.
4. Pin it and run the same smoke test you'd run on Chrome (pick a resume, fill an ATS form,
   confirm tracking + the AI/BYO-key paths). Behavior should be identical.

### Publish to Edge Add-ons
The Edge Add-ons store takes the **same zip** the Chrome publish workflow builds
(`publish-extension.yml` → the `dossier-extension` artifact). Edge really is the same artifact —
**Firefox is not**, see below:
1. Register on the [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge)
   (Edge Program — one-time, free).
2. **Create new extension** → upload the zip → fill the listing (reuse the Chrome store copy and
   the `PRIVACY.md` data-use disclosure) → submit for certification.
3. *Automated updates (optional, later):* Edge has a Partner Center API; a `wdzeng/edge-addon`-style
   CI step could mirror the Chrome auto-publish once the first listing exists. Not wired yet —
   first submission is manual, same as Chrome.

> The analytics master switch and AI feature flags behave identically on Edge — they're
> driven by build-time config / server env, not the browser.

## Firefox (7.2 / W6.1)

Targets **Firefox 140+** and needs **its own build** — this is the one browser where "same zip"
does not hold:

```bash
npm run build:firefox     # -> .output/firefox-mv3
npm run zip:firefox       # AMO-ready zip
```

### What differs from the Chrome build

| | Chrome / Edge | Firefox |
|---|---|---|
| Manifest | MV3, `background.service_worker` | MV3 **event page** (`background.scripts`) — Firefox has no MV3 service worker |
| Toolbar | `action` | `action` (same — MV3, not MV2's `browser_action`) |
| `key` | present (pins the unpacked ID) | omitted (Firefox ignores it and `web-ext lint` flags it) |
| Identity | from `key` / the store | `browser_specific_settings.gecko.id` = `dossier@kiwiply.com` |
| Data disclosure | CWS Privacy tab | `gecko.data_collection_permissions` **in the manifest** |
| Session handoff | `externally_connectable`, direct | **connect-relay content script** (see below) |

WXT defaults Firefox to **MV2**; we deliberately pass `--mv3` (see `package.json`) so there is one
code path rather than two. MV2 would mean `browser_action` instead of `action`, plus a manifest
Mozilla is phasing out.

**Why 140+, not 121:** two independent floors. Firefox only shows and grants an MV3 extension's
host permissions at install from **127** (before that the extension installs and then sits dead on
every ATS), and `data_collection_permissions` — which AMO now requires — only exists from **140**.
140 is also the current ESR, so this is not an aggressive floor. Android needs **142** for the same
key and carries its own `gecko_android.strict_min_version`; it isn't a tested target (the UI is a
400px desktop drawer) but the declared minimum is at least honest.

### The session handoff is different on Firefox (the important part)

Sign-in has exactly one path — kiwiply.com/connect hands the extension a session, because the
extension deliberately has no login of its own. On Chrome that is `externally_connectable` +
`runtime.onMessageExternal`. **Firefox implements neither** — not the manifest key, and not
web-page `runtime.sendMessage` ([bug 1319168](https://bugzil.la/1319168), open since 2016). Left
alone, a Firefox user could install the extension and never be able to sign in.

So the Firefox build ships a content script on our own web origins,
`entrypoints/connect-relay.content.ts`:

1. `/connect` posts `KIWIPLY_CONNECT_PING` to itself; the relay answers `…_PONG`. No relay, no
   pong → the page says "install the extension" **without** minting a session nobody collects.
2. `/connect` posts `KIWIPLY_CONNECT` with the tokens.
3. The relay checks `event.source === window` and `event.origin === location.origin`, then
   forwards it to the background with `chrome.runtime.sendMessage`.
4. The background applies **the same origin gate as the Chrome path** (`connectOriginAllowed`,
   derived from `externally_connectable.matches`) and additionally requires `sender.tab`, so
   neither a content script on an ATS page nor an extension page can inject a session.
5. The relay posts `KIWIPLY_CONNECT_RESULT` back and the page reports success.

The trust boundary is unchanged: `externally_connectable` also trusts a whole origin, and the
relay's `matches` are exactly the origins in that key. Both lists drop the dev origin in
production builds. Covered by `test/connect_handoff.test.js` (52 cases, both transports).

Chrome does **not** ship the relay (`include: ["firefox"]`), so its manifest gains no content
script and no host permission on kiwiply.com.

### Data collection declaration (AMO requirement)

Since 2025-11-03 a new AMO extension is **rejected at signing** without
`browser_specific_settings.gecko.data_collection_permissions`. Ours declares, and this must stay in
step with `PRIVACY.md` — it is the same disclosure, enforced by the browser:

- **required:** `personallyIdentifyingInfo` (the profile we fill), `authenticationInfo` (the
  handed-over session), `websiteContent` (we read the application page; a saved job sends
  role/company/location/salary to the user's own account)
- **optional:** `technicalAndInteraction` (the anonymous GA4 counts — off unless CI injected
  credentials, opt-out either way). Mozilla requires this value to be optional, never required.

### Lint status

`npx web-ext lint --source-dir .output/firefox-mv3 --self-hosted` → **0 errors, 20 warnings**, all
expected and none manifest-related:

- **16 × `DANGEROUS_EVAL`** — the vendored `pdf.js` and `mammoth` builds use the `Function`
  constructor. Third-party libraries, needed for resume parsing, no remote code involved.
- **4 × `UNSAFE_VAR_ASSIGNMENT`** — `innerHTML` in the fill overlay and in the bundled deps.
  Ours is a false positive: every interpolated value in `src/content/filler.js` goes through
  `esc()` (escapes `& < > "`, and every attribute is double-quoted). Worth knowing verbatim,
  because an AMO reviewer will ask.

### ⚠️ Live smoke test before publishing (REQUIRED)

Lint and the unit tests cannot prove the runtime works. On a current Firefox:

1. `npx web-ext run --source-dir .output/firefox-mv3`, or `about:debugging` → **This Firefox** →
   **Load Temporary Add-on** → pick `.output/firefox-mv3/manifest.json`.
2. **The handoff:** open kiwiply.com/connect and confirm the extension ends up signed in. This is
   the Firefox-specific code path — if anything breaks, it is most likely here.
3. **The drawer:** click the toolbar icon on a real ATS page. It must float over the page without
   resizing it (`chrome.scripting.executeScript` with `func` works on Firefox 102+, and
   `panel.html` is web-accessible). A site with a strict `frame-src` CSP can block the iframe —
   the fill overlay is immune because it uses shadow DOM.
4. **A full fill** on a real form, plus "Save this job", and confirm the **event page** is alive in
   `about:debugging` → Inspect.
5. Walk `W5-QA.md` in Firefox too if you intend to advertise Firefox support.

### Publish to Firefox Add-ons (AMO)

Submit the **Firefox** zip (`npm run zip:firefox`) — not the Chrome one — to
https://addons.mozilla.org (one-time free developer account). `gecko.id` is the stable identifier.

**Source-code submission:** AMO requires the original source whenever the submitted code is
minified, concatenated or machine-generated. Ours is (WXT/Vite output plus the vendored
`pdf.js`/`mammoth` builds), so expect to upload a source archive and build instructions —
`npm ci && npm run build:firefox --workspace job-autofill` at the repo root, Node 20.

## Safari (7.3) — deferred

Needs Apple's `safari-web-extension-converter` plus an Xcode project and a Mac, and is a bigger
lift — done last. See `ROADMAP.md` Phase 7.
