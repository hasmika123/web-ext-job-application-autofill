import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

/**
 * WXT build config — W0.2 of the extension UI-platform migration.
 *
 * This file is the single source of the generated manifest; it MIRRORS the legacy
 * `manifest.json` exactly so the WXT build is at parity with the current extension.
 * The autofill ENGINE stays as imported modules (see `entrypoints/*`): WXT owns the
 * build + manifest + entrypoints, nothing more.
 *
 * srcDir defaults to the project root, so the existing `src/` tree is untouched and the
 * new `entrypoints/` + `public/` sit alongside it. `vendor/` and `icons/` live under
 * `public/` (copied verbatim to the output root, preserving subpaths).
 */
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
  manifest: {
    name: "Kiwiply — Job Application Autofill",
    version: "0.49.0",
    description:
      "Keep one consistent bio and many resume variants. Pick a resume, review, and autofill applications on Workday, Greenhouse, Lever, Ashby and more.",
    // Preserve the manifest key so the unpacked extension ID stays stable (keeps the
    // kiwiply.com /connect handoff via externally_connectable working).
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3HE6lDTraXYRpYr+QKqb/QLbtCh0CjFRH/CQbZPOM221cYqh3cDRHmSsbkq1MwCN0M9eWYJgtysjIRHLGIjsuIP3B4hOop0Hq7wHlmlie8/W7llDB7jDfZeJ9N9dpXQNKouXNFtiXwE694eLaP4ioMxMuAnUpW8PaZOUeBPwODh8G7EHvSZtn5SirkpiLZ+fakzfXGDze+6w24tQ4hfnk3bCFQYTrceS8i+4REBKxTbpUjad32m1AVlCeh+qPcPv24zsyDukVcAOVcr1JY+hWUwb+GxX44h7vbTrWV84cD9RBZQhotHf39H83ZwseHa+LJgVVO5WQflLAX2iru5F7QIDAQAB",
    browser_specific_settings: {
      gecko: {
        id: "dossier@kiwiply.com",
        strict_min_version: "121.0",
      },
    },
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
      "https://raw.githubusercontent.com/*",
      "https://gist.githubusercontent.com/*",
      "https://api.anthropic.com/*",
      "https://www.google-analytics.com/*",
      "https://api.kiwiply.com/*",
      "http://localhost:8080/*",
      "http://127.0.0.1:8080/*",
    ],
    externally_connectable: {
      matches: [
        "https://kiwiply.com/*",
        "https://www.kiwiply.com/*",
        "https://app.kiwiply.com/*",
        "http://localhost:3000/*",
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
  },
});
