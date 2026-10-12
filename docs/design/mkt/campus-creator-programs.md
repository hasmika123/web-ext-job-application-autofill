# Design — Campus, creator and affiliate programmes (area `mkt`, epic M7)

Status: decided 2026-10-11 **except the student discount (G34), which is the user's call** (listed in
`COMPETITIVE-GAPS.md` §G.1 and `PLAN-mkt.md` §6). Benchmarks: Kickresume gives Premium free to
students/teachers (ISIC/UNiDAYS) and uses gift vouchers as referral; Big Interview/Yoodli/Handshake
are free *via schools*; Simplify is campus-born; Huntr pays affiliates 30 % of the first 3 months
(30-day cookie, no self-referral, no paid ads); Rezi pays 30 % for 12 months (90-day last click, FTC
disclosure required); Jobscan pays 15 % via Impact and runs a separate career-centre partnerships
track. Locked constraints: ≥ 80 % gross margin per subscription in the worst case; nothing is
unlimited; organizations = setup fee + per-person items above individual prices; no refunds/trial/annual.

## 0. Summary

Three programmes, one ledger, one admin page:

| Programme | Who | What they get | What we get | Cost bound |
|---|---|---|---|---|
| **Campus ambassadors** (M7.3) | 1–3 verified students per campus, applied and approved | Pro while active (an `entitlement_grant`, reason `AMBASSADOR`, renewed monthly while they hit a light activity bar), a kit, a campus code, a monthly email with their numbers, a reference letter at the end | Signups via their code (attributed through `user_acquisition.ref_code`), campus events, honest feedback | ≤ $3.30/ambassador/month (AI budget + infra); cap 150 ambassadors in year one |
| **Creators / affiliates** (M7.2) | Career creators, student orgs, bloggers; applied, reviewed | **30 % of the first 3 months** of every Pro/Autopilot subscription attributed to their link (30-day first-click cookie), paid quarterly once ≥ $50 accrued | Content we don't have to write; audiences on TikTok/Instagram/YouTube | 30 % × 3 months of a $19.99 plan = $18 per converted subscriber; the subscription itself still clears the floor because the commission is a one-time acquisition cost, not a recurring discount (see §5) |
| **Career-centre partners** (M7.4) | University career centres, bootcamps, workforce programmes | The organization product (O-area) at org prices, a `/campus` page, a partner inquiry topic, co-branded help articles | Cohort distribution; the lawful consent story as the pitch | None beyond O-area; no free org seats |
| **Verified-student discount** (M7.1, **decision**) | Students with a school email or ISIC/UNiDAYS-style proof | A catalog-defined % off Pro that the margin guard (A3) proves still clears 80 % | A Gen Z cohort at list-minus instead of never | Bounded by the guard; proposal: **20 % off Pro monthly ($15.99) for 12 months**, re-verify yearly |

Payouts for affiliates are the only place money moves. We do not build a payout rail: payouts run as
**manual quarterly PayPal/bank transfers recorded in the ledger** by admin (same "record, never
move" discipline as the Ops add-on), or through Stripe Connect Express later if volume justifies it.

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Attribution for all three | One `ref_code` on `user_acquisition` (M8.1) + the `kw_src` cookie; codes are typed `R-` (referral, M6), `C-` (campus), `A-` (affiliate) | One capture path, three programmes |
| Affiliate commission | 30 % of the first 3 months' net (after Stripe fees) of Pro/Autopilot; services and org plans excluded | Huntr's bar; bounded; services have thin margins |
| Cookie | 30 days, first click | Cheapest to explain; stops coupon-site hijacking |
| Disclosure | Required (FTC): the kit includes the line; violating content = removal | Rezi does this; protects the brand |
| No paid search on brand terms, no coupon sites, no self-referral, no incentivised signups | Terms | Jobscan/Huntr terms; margin guard |
| Ambassador activity bar | ≥ 5 attributed signups **or** 1 event per month (self-reported, spot-checked) to keep the grant | Keeps it a programme, not a free-Pro list |
| Student discount mechanics (if yes) | Catalog `discount` row (A3) with eligibility `STUDENT_VERIFIED`; verification = school email domain list (`web/src/lib/edu-domains.ts`, generated from the public Hipo/university-domains list) **or** admin-reviewed upload; re-verify every 12 months; Stripe coupon applied at checkout | The guard proves the margin; no new pricing primitive |
| Hire bounties (Simplify) | No | Requires an employer side we don't have and conflicts with "we only work for you" |

## 2. Data model (MySQL, additive; `entitlement_grant` from `referral-program.md`)

```sql
CREATE TABLE partner (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('AMBASSADOR','AFFILIATE','CAMPUS_PARTNER') NOT NULL,
  user_id BIGINT NULL,                       -- ambassadors/affiliates are users; campus partners may be orgs
  org_id BIGINT NULL,
  display_name VARCHAR(120) NOT NULL,
  code CHAR(10) NOT NULL UNIQUE,             -- C-XXXXX / A-XXXXX
  status ENUM('APPLIED','ACTIVE','PAUSED','ENDED','REJECTED') NOT NULL DEFAULT 'APPLIED',
  campus VARCHAR(160) NULL, channel_url VARCHAR(300) NULL,
  commission_bps INT NULL,                   -- affiliates: 3000
  commission_months TINYINT NULL,            -- affiliates: 3
  payout_method ENUM('PAYPAL','BANK','NONE') NULL, payout_handle_enc VARBINARY(512) NULL,
  terms_accepted_at TIMESTAMP NULL, terms_version VARCHAR(20) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL,
  INDEX idx_partner_kind_status (kind, status)
);

CREATE TABLE partner_attribution (            -- one row per attributed user
  partner_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
  attributed_at TIMESTAMP NOT NULL, source ENUM('LINK','CODE') NOT NULL,
  PRIMARY KEY (user_id),
  INDEX idx_attr_partner (partner_id, attributed_at)
);

CREATE TABLE partner_commission (             -- affiliates only; written by the Stripe webhook handler
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  partner_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
  invoice_id VARCHAR(64) NOT NULL UNIQUE,     -- Stripe invoice
  invoice_month TINYINT NOT NULL,             -- 1..3 of the attributed subscription
  net_cents INT NOT NULL, commission_cents INT NOT NULL,
  status ENUM('ACCRUED','REVERSED','PAID') NOT NULL DEFAULT 'ACCRUED',
  reversed_reason VARCHAR(40) NULL,           -- REFUND, DISPUTE, FRAUD
  payout_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE partner_payout (                 -- a record of a transfer made outside the system
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  partner_id BIGINT NOT NULL, period_start DATE NOT NULL, period_end DATE NOT NULL,
  amount_cents INT NOT NULL, method ENUM('PAYPAL','BANK','STRIPE_CONNECT') NOT NULL,
  reference VARCHAR(120) NULL, recorded_by BIGINT NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE student_verification (           -- only if M7.1 is approved
  user_id BIGINT PRIMARY KEY,
  method ENUM('EDU_EMAIL','UPLOAD') NOT NULL, school_domain VARCHAR(120) NULL,
  verified_at TIMESTAMP NOT NULL, expires_at TIMESTAMP NOT NULL,
  reviewed_by BIGINT NULL
);
```

## 3. API

- `POST /api/partners/apply {kind, displayName, campus?, channelUrl?, pitch}` (signed in) → APPLIED;
  admin approves (`POST /api/admin/partners/{id}/approve`, audited) → code + kit email.
- `GET /api/partners/me` → code, link, kit URL, stats (signups, activated, paying; affiliates:
  accrued/paid), terms version.
- `GET /p/{code}` web route → sets `kw_src` with `ref`, shows a landing variant ("Shared by <display
  name>" for affiliates, "Your campus" for ambassadors), CTA `/signup`.
- Stripe webhook (`BillingWebhookResource`): on `invoice.paid` for a user with `partner_attribution`
  to an ACTIVE affiliate and `invoice_month ≤ commission_months`, insert `partner_commission`; on
  refund/dispute → REVERSED.
- Monthly `AmbassadorRenewalJob`: ACTIVE ambassadors meeting the bar get next month's grant; others
  PAUSED with an email; two paused months → ENDED.
- Admin: `GET /api/admin/partners`, `/{id}`, `POST …/payout` (records a payout; marks commissions
  PAID), CSV export; the A16 margin report adds "partner cost" = grants' marginal cost + commissions.
- Student (if approved): `POST /api/account/student-verify {email}` → magic link to the school
  address → `student_verification`; checkout applies the catalog discount when valid.

## 4. State machines

Partner: `APPLIED → ACTIVE → (PAUSED ⇄ ACTIVE) → ENDED`; `APPLIED → REJECTED`. Commission:
`ACCRUED → PAID`, `ACCRUED → REVERSED` (refund/dispute within 90 days; a PAID commission later
reversed is netted from the next payout).

## 5. Economics against the floor

The floor is per subscription in the worst case: AI budget fully spent + Stripe fees. An affiliate
commission is **acquisition cost**, booked in the month it accrues, not a discount on the plan. On a
$19.99 Pro month: net after Stripe (2.9 % + 30 ¢) ≈ $19.11; commission 30 % ≈ $5.73 for months 1–3
= $17.19 per subscriber; our marginal cost ≈ $3.30/mo. Even if every affiliate-sourced subscriber
churned after month 3, revenue $57.33 − cost $9.90 − commission $17.19 = $30.24 (53 % net on the
cohort, and the floor on the subscription itself is untouched). The admin margin report shows
partner cost as a line so the user can throttle (`commission_bps`) without code.

Student discount at 20 % ($15.99): net ≈ $15.23; worst-case AI $3 + infra $0.30 → 78 % — **fails
the 80 % floor by a hair**. Options for the decision: 15 % ($16.99 → ≈ 80.1 %, passes), or 20 % with
a student AI budget of $2.50. The guard decides; this is why the discount lives in the catalog.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Affiliate buys ads on "kiwiply" | Terms violation → PAUSED, commissions REVERSED for the period, audited |
| Self-referral via affiliate code | Same checks as M6 (email, IP+UA hash); affiliate codes never apply to the partner's own account |
| Coupon/deal site posts the link | 30-day first-click + terms; admin can END with reason |
| Refund/dispute after payout | Netted from next payout; if ENDED, written off and logged |
| Ambassador stops responding | PAUSED → ENDED automatically; grant lapses; nothing to claw back |
| School-domain list false positives (alumni emails) | Re-verify yearly; admin can revoke; the discount is small by design |

## 7. Security / privacy

Payout handles encrypted at rest (same `EncryptionService` as inbox credentials); shown masked; never
exported. Attribution rows deleted with the user account; commissions keep `user_id` nulled but the
amounts (financial record, 7-year retention per trust area). Ambassador campus names are public on
`/campus` only with consent. Minors: ambassadors and affiliates must be 18+ (terms); the student
discount follows the 16+ rule from the org design (T-area review).

## 8. Cost

No new services. Manual quarterly payouts (≈ 30 minutes/quarter at launch). Kit = one page + three
assets from the screenshot pipeline (M10.3). Ambassador grants ≤ 150 × $3.30 = $495/month worst case.

## 9. Tests

- `PartnerServiceIT`: apply/approve/code uniqueness; attribution precedence (cookie vs code; R/C/A
  codes never double-attribute); commission math from invoice fixtures; reversal on refund; renewal
  job bar; payout recording marks commissions PAID; margin report line.
- Webhook IT: `invoice.paid` → commission only for months 1–3, only for Pro/Autopilot, only when
  partner ACTIVE.
- Web: `/p/CODE` variants; `/partners` dashboard at 390 px; kit download; terms acceptance gate.
- Student (if approved): domain verification, expiry, checkout coupon applied, re-verify flow.

## 10. Rollout

M7.2 partner schema + apply/approve + `/p/` + attribution (no money) → M7.6 commissions via webhook
+ admin ledger + payouts → M7.3 ambassador grants + renewal job + kit → M7.4 `/campus` + partner
inquiry topic → M7.5 `/press` → M7.1 student discount **after the user decides**.

## 11. Wireframes (390 px)

```
/partners (affiliate dashboard)            /campus
┌──────────────────────────────┐           ┌──────────────────────────────┐
│ Your partner link            │           │ Kiwiply for career centres   │
│ kiwiply.com/p/A-7F3K2 [Copy] │           │ Your students apply with one │
│ 30 % of the first 3 months,  │           │ profile, review every field, │
│ paid quarterly from $50.     │           │ and press submit themselves. │
│ ┌──────────────────────────┐ │           │ You see what they consent to │
│ │ This quarter             │ │           │ share — nothing else.        │
│ │ 41 signups · 6 paying    │ │           │ [ Talk to us ]  [ How consent│
│ │ $34.38 accrued           │ │           │   works → ]                  │
│ └──────────────────────────┘ │           │ What a centre gets           │
│ Kit: logos, 3 screenshots,   │           │ • Org workspace, cohorts     │
│ the disclosure line you must │           │ • Consent-scoped progress    │
│ use: "I earn a commission if │           │ • Per-student Pro items      │
│ you subscribe through my     │           │ • Help articles for your site│
│ link."                       │           │ Ambassadors on your campus → │
│ Terms v1 · accepted 11 Oct   │           │ Pricing: setup fee + per     │
└──────────────────────────────┘           │ person, above individual     │
                                           └──────────────────────────────┘
```
