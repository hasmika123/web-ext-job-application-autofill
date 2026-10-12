# Design — `/pricing`: honest money (area `mkt`, epic M2)

Status: decided 2026-10-11. `/pricing` is real (`(marketing)/pricing/page.tsx`,
`components/pricing/PricingSections.tsx`, `web/src/lib/catalog.ts`): plan cards, "What's included"
pop-ups, services, per-person menu, Contact-us routing, plan-aware Pro button. What it lacks is the
thing the benchmark says wins this category: **saying the money rules out loud** (G29). Billing
complaints are the #1 one-star theme at Teal, Simplify, JobRight, Jobscan, Resume.io
(`AUDIT-mkt.md` §4; `COMPETITIVE-LANDSCAPE.md` §1). Our locked rules — public prices, monthly or
3-month only, no weekly, no trial, no refunds, cancel keeps the paid period, nothing unlimited, Free
is identical autofill — are a marketing asset once they are on the page in one screenshot-able block.

Locked constraints honoured: prices (Pro $19.99 · $49.99/3 mo → $24.99 · $54.99 at Launch 2;
Autopilot $39.99 · $99.99/3 mo), no annual, no trial, "no refunds, cancel anytime", resume caps
3/25/50, AI budgets $3/$8 and $6/$16 per period, Free has no server AI except resume parsing,
Stripe is the truth, catalog in code until Phase 18 moves it to the DB (A3.1).

## 0. Summary

1. **The money block** ("How billing works — the whole deal") sits directly under the plan cards on
   every viewport: six sentences, each a register claim, each true today.
2. **A full comparison table** generated from `catalog.ts` (`COMPARE` + the limits that are missing
   from it today: AI budget per period, matches per day, resume cap, learned-answer sync, inbox,
   Autopilot daily/monthly caps), with "Free" first and identical autofill shown as identical.
3. **Plan FAQ** with `FAQPage` JSON-LD and `Product`/`Offer` JSON-LD per plan (M3.1 helper).
4. **Org section**: setup fee + per-person items with a small calculator (people × items), "above
   individual prices" stated, Contact-us unchanged.
5. **Context-aware arrival**: links from the in-app 402 sheet (`?reason=PRO_REQUIRED&feature=…`)
   highlight the row that gates the feature; the back link returns to where the user was.
6. **Practice-only statement** for interview prep (G27): "We help you practise. We will never feed
   you answers in a live interview."

## 1. The money block (copy, each line = register id)

```
How billing works — the whole deal
• Prices are public and the same for everyone. Monthly or 3-month. No weekly plan, no annual plan.   (prices, no-weekly)
• No free trial. Free is a real plan, not a countdown.                                                (no-trial)
• No refunds. Cancel any time and you keep Pro until the end of the period you paid for.             (no-trial-no-refund)
• We email you 3 days before a renewal, every time.                                                   (renewal-reminder — ships with U15.3; until then this line is omitted by the register, not fudged)
• Cancel in Settings › Billing. Two taps, no call, no chat.                                           (cancel-two-taps — ships with the in-app cancel; until then: "Cancel in Settings › Billing via the Stripe portal")
• Nothing is unlimited: AI has a budget per period (shown on your meter), resumes have a cap, and downgrading never deletes anything.  (nothing-unlimited, resume-cap)
```

The block renders only claims whose status is `ships`; `planned` lines are omitted (not shown as
"coming") because a money promise with "soon" next to it reads as a trick.

## 2. Comparison table (data)

Extend `catalog.ts` `COMPARE` rows (strings or booleans) to cover, in this order:

| Row | Free | Pro | Autopilot |
|---|---|---|---|
| Autofill on supported ATS + label matching | ✓ | ✓ (same) | ✓ (same) |
| Review before anything is written; you submit | ✓ | ✓ | ✓ |
| Resumes kept (non-archived) | 3 | 25 | 50 |
| Resume parsing into your profile (AI) | 1 per resume | 1 per resume | 1 per resume |
| Learned answers | this device | synced across devices | synced |
| Daily job matches | 3, rules-ranked, in app | 10–20 AI-scored + daily email + 👍/👎 (16.1) | same |
| Inbox tracking (Gmail) | — | ✓ | ✓ |
| AI drafting, tailoring, ATS score, fit | BYO key | included, $3/mo · $8 per 3 months budget | included, $6/mo · $16 per 3 months |
| Autopilot (prepares, never submits) | — | — | 30/day · 300/month (Phase 19) |
| Interview practice (text) | — | Phase 20.1 | Phase 20.1 |
| Price | $0 | $19.99/mo · $49.99/3 mo | $39.99/mo · $99.99/3 mo |

Rows for features not yet shipped carry the "Coming" chip and the phase; prices never carry chips.
When Phase 18 lands, the same table reads `GET /api/catalog/public` (A3.1) and `catalog.ts` becomes
the fallback for dev/CI (M2.6).

## 3. JSON-LD

`Product` per plan with `Offer` (`price`, `priceCurrency: USD`, `billingIncrement` via
`UnitPriceSpecification` for monthly/3-month, `availability: InStock`), `FAQPage` from the plan FAQ,
`BreadcrumbList`. Services (human) as `Service` with `Offer`. No aggregate ratings (we have none).

## 4. Org section and calculator

Reads `CONSULTANCY`, `PER_PERSON`, `CONSULTANCY_ADDONS`. Calculator: people (1–50) × chosen items
→ monthly total + one-time setup fee; "Prices for organizations are above individual prices on
purpose: they include admin, consent-scoped visibility and support" (`org-pricing-above`, ships).
Ops add-on shows "Custom" until 23.0. CTA stays Contact us (`/contact?topic=organization`) — no
checkout (15.6 decision).

## 5. Arrival from the app (402)

`/pricing?reason=PRO_REQUIRED&feature=inbox&back=/settings/inbox`: the matching table row and the
Pro card get a highlight + "This is what you tapped"; the Pro button's return URL (`success_url`)
carries `back` so `/billing/success` can offer "Back to Inbox". U15.1's in-app sheet is the primary
path; this is the fallback and the deep link from emails.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Billing disabled (blank Stripe key) | Pro button says "Payments open soon" (exists); money block still renders (true regardless) |
| Catalog API down (post-Phase 18) | Fallback to `catalog.ts` with a server log; prices in code are kept in sync by the A3 admin test |
| Launch 2 price change | Catalog change + `prices` claim text; grandfathering sentence appears for one cycle ("Existing subscribers keep $19.99 for one more period") |
| A money line not yet true | The register omits it (status `planned`) — never shown with "soon" |

## 7. Tests

- `catalog.test.ts`: every COMPARE row has three cells; prices match the register `prices` claim;
  no "unlimited" string anywhere in the catalog.
- JSON-LD snapshot test validates against schema fixtures (Offer prices equal catalog).
- Playwright 390 px: money block visible without scrolling past the cards on a 390×844 viewport
  after one scroll; `?reason=` highlight; org calculator maths; services pop-ups unchanged; Stripe
  buttons unchanged (mock API).
- Claims lint: the pricing page contains no numbers outside catalog-bound expressions.

## 8. Rollout

M2.2 money block (register-driven) → M2.3 comparison table rows + "Coming" chips → M2.4 JSON-LD +
FAQ → M2.5 org calculator → M2.6 context-aware arrival + catalog API switch (after A3.1).

## 9. Wireframe (390 px)

```
┌──────────────────────────────────────┐
│ Pricing                              │
│ Simple plans. Public prices. No trial│
│ tricks.                              │
│ ┌──────────────────────────────────┐ │
│ │ Free            $0               │ │
│ │ Autofill, review, submit yourself│ │
│ │ 3 resumes · 3 matches/day        │ │
│ │ [ Get started free ]             │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Pro   $19.99/mo · $49.99/3 mo    │ │
│ │ Inbox tracking, AI drafting,     │ │
│ │ 25 resumes, synced answers       │ │
│ │ [ Upgrade to Pro ]  What's in it?│ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Autopilot $39.99/mo · $99.99/3mo │ │
│ │ Prepares 30 a day. You submit.   │ │
│ │ [ Contact us ]        (Launch 2) │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ How billing works — the deal     │ │
│ │ • Public prices. Monthly or 3-mo.│ │
│ │   No weekly, no annual.          │ │
│ │ • No free trial.                 │ │
│ │ • No refunds. Cancel any time,   │ │
│ │   keep Pro to the period's end.  │ │
│ │ • Nothing is unlimited; the AI   │ │
│ │   budget is on your meter.       │ │
│ └──────────────────────────────────┘ │
│ Compare plans ▾                      │
│ Organizations ▾   Expert services ▾  │
│ FAQ ▾                                │
└──────────────────────────────────────┘
```
