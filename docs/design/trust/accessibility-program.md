# Design — Accessibility program: WCAG 2.2 AA, EAA posture, CI gate, statement (area `trust`, epic T4)

Status: design 2026-10-11. Related stories in other areas do the page-level work (U19.1 user app,
O15.3 org, A15.3 admin, R6.2 builder, U0.2 primitives); this area owns the **target, the shared
tooling, the statement, the audits and the procurement artefact**. Today: no axe, no jsx-a11y, no
Lighthouse in CI; 27 files in `packages/ui/src` + `web/src/components/app-v3` carry `aria-*` /
reduced-motion work; keyboard and screen-reader use "never verified" (HANDOFF-V2 §6).

## 0. Decisions

| # | Decision |
|---|---|
| D1 | **Target: WCAG 2.2 AA** for the web app, marketing site, org and admin surfaces, the extension drawer/options, and exported resume PDFs (tagged PDF, reading order, language). EN 301 549 is the mapping used for the statement. |
| D2 | **EAA posture**: AutomoraLab LLC is probably a *microenterprise* (< 10 staff and ≤ €2 M) and so likely exempt from the EAA's service obligations — **we conform anyway** (ADA Title III exposure in the US, org buyers' procurement, and the audience). The accessibility statement says what we conform to and does not claim EAA applicability either way until counsel confirms (L11). |
| D3 | **One CI gate for all surfaces**: `@axe-core/playwright` on a route list per surface at 390/1440, light + dark; `eslint-plugin-jsx-a11y` (strict) on `web`, `packages/ui`, `job-autofill/entrypoints`; Lighthouse accessibility ≥ 95 on five marketing + five app routes. A violation of `serious`/`critical` impact fails the build; `moderate` is reported. Baseline file for known issues with an expiry date (no permanent allow-list). |
| D4 | **The design system carries the contract**: `packages/ui` primitives guarantee focus-visible ring (3 px, ≥ 3:1), 44 × 44 CSS px targets (WCAG 2.5.8 is 24 px; we keep 44 for thumbs), text contrast tokens ≥ 4.5:1 in both themes (a token test computes it), `prefers-reduced-motion` honoured in every animation, `forced-colors` safe, live regions for toasts, `aria-*` props required by TypeScript on icon-only buttons (`IconButton` demands `label`). BottomSheet/SwipeRow (U0.2) ship with the keyboard fallback. |
| D5 | **Manual audits are scheduled, not aspirational**: NVDA + Chrome (Windows), VoiceOver + Safari (iOS, 390 px), keyboard-only, 200 % zoom, for six journeys: sign up → onboarding; search → save; tracker update; resume upload → review; billing upgrade; extension connect → fill → review. Findings become stories in the owning area with the `a11y` tag; this area re-audits each half-year and before each launch gate. |
| D6 | **Extension drawer**: the injected iframe gets a labelled dialog, focus moves in on open and back to the page on close, `Esc` closes, a keyboard command (`Alt+Shift+K`) opens it, fill results are announced (`aria-live="polite"`: "Filled 14 of 16 fields; 2 need you"), the on-page overlay badges have ≥ 3:1 contrast and are not the only indicator (the drawer lists them). Never trap focus on the ATS page. |
| D7 | **Accessibility statement page** `/accessibility`: conformance claim (partial/full, date), scope, known issues with target dates, testing method, feedback channel (`accessibility@kiwiply.com` → support queue, 5-business-day reply), alternative routes (email support can do what the UI cannot). Versioned like the legal content (T0.3). |
| D8 | **ACR (VPAT-style report)** for org procurement: generated from the statement + audit findings, WCAG 2.2 table with Supports / Partially / Does not support, updated with each audit. Universities ask for it; produce it before the org launch. |
| D9 | **Content rules**: plain language (reading level ≈ grade 8 for app copy), no colour-only meaning, captions for any video, alt text policy for mascot art (decorative → `alt=""`). Resume templates: semantic heading order, tagged PDF export (R0.6 sidecar prints with `--export-tagged-pdf`). |

## 1. CI gate shape

```
.github/workflows/ci.yml
  a11y-web:    npx playwright test --project=a11y   (routes: /, /pricing, /privacy, /login, /signup, /dashboard, /jobs, /applications, /settings, /resume-builder/[id], /org, /admin)
  a11y-ext:    wxt build → playwright loads panel.html + options.html in an extension context → axe
  lint:        eslint (jsx-a11y strict) in the existing lint step
  lighthouse:  lhci autorun (a11y category only) on the built web
Artifacts: axe JSON per route; baseline in web/a11y-baseline.json {ruleId, selector, expires}
```
Shared helper `packages/ui/test/a11y.ts` (axe config, impact threshold, theme toggling) so the four
areas' test suites use one definition of "passes".

## 2. Token test

`packages/ui/test/contrast.test.ts` parses `styles/theme-v2.css` light + dark token pairs
(`--ink` on `--bg`, `--muted` on `--card`, `--on-accent` on `--accent`, status chip pairs) and asserts
≥ 4.5:1 for text, ≥ 3:1 for UI components; the roadmap page's palette is a known-good reference.

## 3. Statement page (390 px)

```
┌──────────────────────────────┐
│ Accessibility at Kiwiply     │
│ We aim for WCAG 2.2 AA.      │
│ Status: partially conformant │
│ (checked 11 Oct 2026)        │
│ What works ▸ Known issues ▸  │
│ • Job filter sheet: focus    │
│   order (fix by Nov 2026)    │
│ • PDF export: untagged       │
│   (fix with R0.6)            │
│ How we test ▸  Tell us ▸     │
│ accessibility@kiwiply.com    │
│ Reply within 5 business days │
│ Download the ACR (PDF) ▸     │
└──────────────────────────────┘
```

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| axe false positive on a third-party widget (Stripe, Google button) | scoped exclusion with a comment and an expiry in the baseline |
| Dark mode token fails contrast | build fails; the token test names the pair |
| Extension drawer on an ATS with its own focus traps (Workday modals) | drawer opens as a sibling of `body`, focus handling scoped to the iframe; `Esc` returns focus to the invoking element; tested on captured Workday DOM |
| Audit finds a serious issue before a launch gate | launch checklist (15.4) carries "no open serious a11y issue on the six journeys" |

## 5. Needs a lawyer (L11)

EAA applicability (microenterprise test, "existing service" transition to 2030, which member states'
transpositions reach a US LLC selling B2C subscriptions); ADA Title III exposure and the statement
wording; whether the ACR can be shared under NDA only.

## 6. Tests

The CI gate itself; `contrast.test.ts`; `IconButton` type test (label required); Playwright keyboard
journeys (Tab order snapshot per route, Esc closes sheets, focus returns); extension `drawer-a11y.test`
(dialog role, focus in/out, live region text); PDF tag check in the R0.6 smoke (`pdfinfo`-style
"Tagged: yes").

## 7. Rollout

T4.2 CI gate + baseline (reports only for one week, then enforce) → T4.3 ui contract + token test →
T4.1 statement page → T4.4 manual audit #1 (findings to areas) → T4.5 extension drawer → T4.6 ACR
before the org launch.
