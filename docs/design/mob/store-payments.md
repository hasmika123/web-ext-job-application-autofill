# Design — App-store payment rules vs Stripe (area `mob`, epic N7)

Status: decided 2026-10-11. Hard constraints (root `CLAUDE.md`, Phase 12 locked): **Stripe is the
truth; only webhooks write the `subscription` mirror; `EntitlementService` is the only entitlement
source; no free trial; no refunds; no annual plan; billing disabled when the Stripe key is blank.**
Companion: `docs/design/org/billing.md`, `docs/design/admin/catalog-margin-entitlements.md`.

## 0. Decisions

1. **The PWA sells through Stripe exactly as the website does.** A web app on the home screen is
   not distributed through any store; Apple's and Google's billing rules do not apply. Nothing in
   U15 (upgrade sheet, Checkout, Portal) changes for installed users.
2. **No in-app purchase (IAP / Play Billing) in any native shell, ever, in v1.** IAP would create a
   second subscription source that is not Stripe, with its own renewals, refunds (Apple refunds
   without asking us), prices (Apple's tiers ≠ $19.99/$49.99 exactly) and a 15–30 % cut that
   breaks the ≥ 80 % margin floor at our price points. Reconciling two sources into one mirror is
   the kind of bug that charges people twice.
3. **The shell is a "status + link-out" surface:**
   - **US storefront (Apple) / US Play**: the shell may show prices and a "Continue on
     kiwiply.com" button that opens the **system browser** (never a WebView) at Stripe Checkout,
     returning via a universal link. Lawful under the Epic injunction (Apple guidelines updated
     May 2025; Google policy 2025-10-29 + programs 2025-12-09). Google's external-links program
     requires enrolment and **fee reporting** (deadline extended to 2026-12-01) — see §3.
   - **Everywhere else**: the shell shows the plan the user already has, usage meters and
     "Manage your plan on kiwiply.com" **without a link, price or button** (Apple 3.1.1 still
     forbids steering outside the US; EU DMA alternatives carry Core Technology fees we won't pay
     for a shell this small). Users who want Pro open the site themselves.
4. **One `purchaseSurface` resolver decides what to render** (§2). Billing code never asks "am I
   in the shell?" ad hoc.
5. **Prices are never hidden on the open web.** `/pricing` and the upgrade sheet in a browser or
   PWA always show them; only the native shell outside the US is status-only.
6. **Re-check the legal position every quarter** (N7.3): the Ninth Circuit remanded the
   zero-commission remedy in December 2025 and Apple is still appealing; Google's revised
   settlement awaits court approval. The resolver's `region` rules are a runtime setting (A5.1)
   so a change is a config flip, not a release.

## 1. Surfaces

| Surface | Detect | Show prices | Checkout | Portal (cancel, card) | Notes |
|---|---|---|---|---|---|
| Browser (any device) | default | yes | Stripe Checkout (redirect) | Stripe Portal | unchanged |
| PWA installed (iOS/Android) | `display-mode: standalone`, no shell UA | yes | Stripe Checkout; return lands in the standalone window (scope `/`) | Portal opens in-scope; iOS shows it in the in-app Safari sheet — fine, Portal is Stripe-hosted and returns to `/settings?billing=1` | N0.3 round-trip rules |
| Native shell, **US** | shell UA + `region=US` | yes | "Continue on kiwiply.com" → `openSystemBrowser(checkoutUrl)` → universal link back | same, system browser | Apple: no entitlement needed on the US storefront since May 2025; neutral "leaving the app" sheet is Apple's, not ours |
| Native shell, **non-US** | shell UA + other region | **no** | **none** | **none** — "Manage your plan on kiwiply.com" text only | Apple 3.1.1 steering ban; Play outside the US follows its 2026–2027 rollout (settings flip when a region opens) |
| Org-paid seats (O3.*) | plan `via org` | n/a | n/a | n/a | shell shows "Pro via Acme" like the extension (O3.4) |

`region` = the App Store / Play storefront country reported by the shell bridge
(`StoreKit.Storefront` / `BillingClient` country) — **not** IP geolocation, which is what reviewers
check. Unknown → treat as non-US (safe default).

## 2. Code shape

```ts
// web/src/lib/purchase-surface.ts
export type PurchaseSurface = "web" | "pwa" | "shell-linkout" | "shell-status-only";
export function purchaseSurface(ctx: { displayMode: DisplayMode; shell?: { platform: "ios"|"android"; storefront?: string } ; rules: SurfaceRules }): PurchaseSurface
// rules come from GET /api/mobile/config → { linkoutStorefronts: ["US"], ... }  (runtime setting, A5.1)
```
- `UpgradeSheet` (U15.1), `PlanCard`, `/pricing` and the Settings billing panel all branch on
  `purchaseSurface()` — four call sites, one function, one test matrix.
- Shell bridge: `window.KiwiplyShell.openExternal(url)` (system browser) and
  `window.KiwiplyShell.storefront()`; the web falls back to `window.open` when absent.
- Checkout return: Stripe `success_url = https://kiwiply.com/billing/success?cs={CHECKOUT_SESSION_ID}`
  — a universal link the shell claims (`apple-app-site-association` + `assetlinks.json` served from
  `web/public/.well-known/`, N6.2) so the system browser bounces back into the app; `SuccessPoller`
  then polls `GET /api/billing/me` (exists) until the webhook has written the mirror. No state
  crosses the hop except the URL.
- API: **no change to billing**. `GET /api/mobile/config` is a new read-only endpoint
  (`{minShellVersion, linkoutStorefronts, features}`) backed by runtime settings.

## 3. Compliance checklist (N7.3 — items marked ⚖ need a lawyer's eyes; see the trust area)

- ⚖ Apple App Review Guidelines 3.1.1 / 3.1.1(a) / 3.1.3 current text on the day we submit; the
  US carve-out wording; whether the StoreKit External Purchase Link entitlement (2024 program,
  commissioned) is required or merely optional for our flow.
- ⚖ Google Play: enrol in the **external content links program** before the first US link-out;
  report transactions and pay any service fee by the stated deadline (2026-12-01 as of 2026-09-17);
  keep the Payments policy disclosures in the listing.
- ⚖ Account deletion in-app (Apple 5.1.1(v)) — exists on the web (`AccountDeletionResource`); the
  shell reaches it through the same page.
- Privacy nutrition labels (Apple) and Data safety (Play) must list: email, name, profile data,
  resumes, inbox metadata (Pro), diagnostics; "data not linked to you" is **not** claimable.
- No prices in screenshots or the store description outside the US storefront (a reviewer sees
  the EU listing too).
- Copy for status-only: "You're on Pro · renews 12 Nov" / "You're on Free — manage your plan on
  kiwiply.com". No "Upgrade" verb in the non-US shell.
- Log every `purchaseSurface` decision as an event prop (N8.3) so we can prove what was shown.

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| Storefront unknown in the shell | status-only (safe) |
| Universal link fails to re-open the shell after Checkout | the system browser lands on `/billing/success` in Safari/Chrome, which is signed in via the cookie and shows success; the shell shows the new plan on next open (plan travels on `GET /api/profile/version`) |
| Apple wins the appeal and commissions return | flip `linkoutStorefronts` to `[]`; the shell becomes status-only worldwide — no release needed |
| User bought on the web, shell still shows Free | `getPlan()` is fetched per layout; pull-to-refresh on Settings re-reads it |
| Reviewer tests non-US with a VPN | we key on storefront, not IP, so the status-only screen is what they see |

## 5. Security and privacy

No payment data ever touches the shell or the web app (Stripe-hosted Checkout/Portal — unchanged).
`openExternal` only accepts `https://kiwiply.com/*` and `https://checkout.stripe.com/*`,
`https://billing.stripe.com/*`.

## 6. Cost

$0 on the PWA. US link-out from a shell: Stripe fees only (already in the margin model). Play's
external-links service fee (reported 10 % on the first $1M) **would** apply to US Android shell
sales if we enrol — at $19.99 that leaves 90 % − Stripe ≈ 86 % gross before AI budget, still
above the 80 % floor only if the AI budget is within the catalog's margin guard (A3.3 must be
rerun with a per-surface fee column: N7.1 AC).

## 7. Tests

- vitest: `purchaseSurface()` matrix (12 cases: 3 display modes × US/non-US/unknown × shell
  platform), snapshot of each surface's copy.
- Playwright mobile: PWA upgrade sheet shows prices and reaches Checkout stub; shell UA + non-US
  shows status-only with **no** button; shell UA + US shows "Continue on kiwiply.com".
- API IT: `GET /api/mobile/config` reflects the runtime setting; unknown setting → `[]`.

## 8. Rollout

N7.1 resolver + config endpoint (before any shell work; PWA behaviour unchanged) → N7.3 checklist
with the user/lawyer → N7.2 link-out only inside N6.2.

## 9. Wireframes (390 px)

```
Shell · US storefront                         Shell · non-US storefront
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│ Plan                                 │     │ Plan                                 │
│ Free                                 │     │ Free                                 │
│ 3 resumes · 2 alerts · BYO AI key    │     │ 3 resumes · 2 alerts · BYO AI key    │
│                                      │     │                                      │
│ Pro  $19.99/mo · $49.99 / 3 months   │     │ Manage your plan on kiwiply.com      │
│ Auto-renews, cancel anytime,         │     │                                      │
│ no refunds.                          │     │                                      │
│ [ Continue on kiwiply.com ↗ ]        │     │                                      │
│  Opens your browser to pay securely  │     │                                      │
└──────────────────────────────────────┘     └──────────────────────────────────────┘
```
