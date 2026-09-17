import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

/**
 * WXT build config — the single source of the generated manifest.
 *
 * The autofill ENGINE stays as imported modules (see `entrypoints/*`): WXT owns the
 * build + manifest + entrypoints, nothing more. srcDir defaults to the project root, so
 * the existing `src/` tree is untouched and `entrypoints/` + `public/` sit alongside it.
 * `vendor/` and `icons/` live under `public/` (copied verbatim, preserving subpaths).
 *
 * STORE HYGIENE (W6.0): `manifest` is a FUNCTION of the build env so a production zip
 * carries only what it actually uses. Dev-only entries (a local API on :8080, the local
 * web app on :3000) are added back when `mode !== "production"` — i.e. for `wxt` /
 * `wxt build --mode development`, never for the `wxt build` that CI zips for the store.
 * Chrome rejects permissions it can see no use for, and the privacy tab has to be true.
 */
// The extension's public key — see the `key` note in the manifest below.
const MANIFEST_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3HE6lDTraXYRpYr+QKqb/QLbtCh0CjFRH/CQbZPOM221cYqh3cDRHmSsbkq1MwCN0M9eWYJgtysjIRHLGIjsuIP3B4hOop0Hq7wHlmlie8/W7llDB7jDfZeJ9N9dpXQNKouXNFtiXwE694eLaP4ioMxMuAnUpW8PaZOUeBPwODh8G7EHvSZtn5SirkpiLZ+fakzfXGDze+6w24tQ4hfnk3bCFQYTrceS8i+4REBKxTbpUjad32m1AVlCeh+qPcPv24zsyDukVcAOVcr1JY+hWUwb+GxX44h7vbTrWV84cD9RBZQhotHf39H83ZwseHa+LJgVVO5WQflLAX2iru5F7QIDAQAB";

export default defineConfig({
  // React for the side panel (W3) — adds @vitejs/plugin-react (JSX + Fast Refresh) + the react
  // auto-import preset. The engine entrypoints (background/content/popup/options/review) stay
  // framework-free; only the new React surfaces use it.
  modules: ["@wxt-dev/module-react"],
  // Tailwind v4 for the React panels. Create the plugin INSIDE the factory — WXT runs multiple
  // build steps and a shared stateful plugin instance can fail.
  vite: () => ({
    plugins: [tailwindcss()],
    // Force a SINGLE React copy into the bundle. In the workspace the extension and
    // @kiwiply/ui can otherwise resolve different physical React installs (root vs
    // job-autofill/node_modules) → two dispatchers → "Cannot read properties of null
    // (reading 'useId')" at runtime. Dedupe unifies them at bundle time (also protects CI).
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  }),
  manifest: ({ mode, browser }) => {
    // Dev builds only: a local API (`wxt`, or `wxt build --mode development`). The store zip
    // comes from `wxt build` (mode=production), which drops these.
    const dev = mode !== "production";
    const devApiHosts = ["http://localhost:8080/*", "http://127.0.0.1:8080/*"];
    // The local web app, for testing the /connect session handoff against a dev Next server.
    // NOTE: any page served on this origin can hand the extension a session, so it must never
    // ship — the service worker derives its accept-list from these matches, not from a
    // hardcoded origin, so dropping it here is enough (see service-worker.js).
    const devConnectOrigins = ["http://localhost:3000/*"];

    return {
      name: "Kiwiply — Job Application Autofill",
      version: "0.51.0",
      description:
        "Keep one consistent bio and many resume variants. Pick a resume, review, and autofill applications on Workday, Greenhouse, Lever, Ashby and more.",
      // Pins the unpacked extension ID (keeps the kiwiply.com /connect handoff working).
      // Chrome, not Firefox, which ignores `key` and whose linter flags it.
      // ⚠️ FIRST Chrome Web Store upload: a new item REJECTS `key` — remove it for that one
      // upload, let the store assign the ID, then paste the store's public key back here so
      // the dev and published IDs match forever. See DEPLOY.md §8.
      ...(browser === "firefox" ? {} : { key: MANIFEST_KEY }),
      // Firefox-only: Chrome ignores it, so don't ship it in the Chrome manifest.
      ...(browser === "firefox"
        ? {
            browser_specific_settings: {
              gecko: { id: "dossier@kiwiply.com", strict_min_version: "121.0" },
            },
          }
        : {}),
      permissions: ["storage", "unlimitedStorage", "scripting", "activeTab", "webNavigation"],
      host_permissions: [
        "https://*.myworkdayjobs.com/*",
        "https://*.myworkday.com/*",
        "https://*.greenhouse.io/*",
        "https://boards.greenhouse.io/*",
        "https://job-boards.greenhouse.io/*",
        "https://jobs.lever.co/*",
        "https://jobs.ashbyhq.com/*",
        "https://apply.workable.com/*",
        "https://*.workable.com/*",
        "https://*.icims.com/*",
        "https://*.taleo.net/*",
        "https://jobs.smartrecruiters.com/*",
        "https://*.bamboohr.com/*",
        "https://*.jobvite.com/*",
        "https://smartapply.indeed.com/*",
        // Optional BYO-key AI drafting — only ever called when the user supplies their own key.
        "https://api.anthropic.com/*",
        // GA4 Measurement Protocol (anonymous counts, off unless CI injected credentials).
        "https://www.google-analytics.com/*",
        "https://api.kiwiply.com/*",
        ...(dev ? devApiHosts : []),
      ],
      externally_connectable: {
        matches: [
          "https://kiwiply.com/*",
          "https://www.kiwiply.com/*",
          "https://app.kiwiply.com/*",
          ...(dev ? devConnectOrigins : []),
        ],
      },
      action: {
        default_title: "Kiwiply — open the autofill drawer",
        // No default_popup and no native side panel: background.ts's chrome.action.onClicked
        // injects panel.html as an on-page iframe drawer that floats over the site (see the
        // panel.html web_accessible_resources entry below). This avoids the native side panel,
        // which docks and compresses the page.
      },
      icons: {
        16: "icons/icon16.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png",
      },
      // Only the resources actually reached at runtime via chrome.runtime.getURL need to be
      // web-accessible: vendor/* (pdf.js dynamic import from the parser) and icons/* (the
      // fill overlay's logo, injected into the page). The legacy src/lib/* + src/config/*
      // WAR entries are gone — those modules are now bundled into entrypoints, not fetched.
      web_accessible_resources: [
        {
          // vendor/* (pdf.js dynamic import) + icons/* (fill-overlay logo) are injected into pages;
          // panel.html is the drawer, embedded as an iframe into the active tab by background.ts
          // (its own JS/CSS load same-origin from the extension, so only the HTML needs listing).
          resources: ["vendor/*", "icons/*", "panel.html"],
          matches: ["<all_urls>"],
        },
      ],
    };
  },
});
