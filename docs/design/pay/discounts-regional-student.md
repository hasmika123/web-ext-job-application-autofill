# Discounts, promo codes, student pricing, regional pricing & referral credits (B7.*)

> Area `pay`. Status: design, 2026-10-11. Locked: the floors (≥ 80 % / ≥ 20 %), no trial, no annual,
> locked list prices. Fee maths: `fee-model-and-margin-guard.md`. Admin side: `docs/design/admin/
> catalog-margin-entitlements.md` D7 (promo codes mirror, comps ≤ 90 days). User side: U16.4 referral.

## 1. The constraint that shapes everything

A discount lowers revenue; the AI budget does not shrink with it. At Launch-1 prices Pro sits at the 80 %
floor, so **any percentage coupon on Pro fails the floor** (§3.5 of the fee doc). The honest conclusion is a
design rule, not a workaround:

> **A discount is a product, not a coupon.** A cheaper price must come with its own entitlements (a smaller
> AI budget, fewer resumes) so it passes the guard on its own. Coupons exist only where the floor leaves
> room: services (20 %), the Launch-2 Pro price, org seats, and one-time fees.

This also matches the locked line "nothing is unlimited": a student at $11.99 with a $3 budget would be a
subsidised Pro; a student at $11.99 with a $1.50 budget is a fair product.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | **Promo codes = Stripe Coupons + Promotion Codes created only through `StripeGateway`**, mirrored in `promo_code` (admin doc), each with `margin_pct_worst` computed by `MarginCalculator` on the *net* price; below floor → refused (no override for promos — promos are marketing, and marketing does not get to breach the floor). `duration=forever` refused; max 3 months `repeating`; `max_redemptions` required; `expires_at` ≤ 90 days. |
| D2 | **`allow_promotion_codes` on Checkout is per price** (`product_price.accepts_promos`), default false; the catalog sets it true only for prices that have ≥ 1 passing promo. A typed code on a price that does not accept promos simply has no field — no "invalid code" sadness at checkout. |
| D3 | **Student plan is a catalog product `PRO_STUDENT`** (same features as Pro, `ai.budget_cents_per_period=150`, `resumes.max=10`, `matches.per_day=10`) at **$11.99/mo · $29.99/3 mo** — proposed, see margin §4 — sold only to verified students, 12 months per verification, then re-verify. Not a coupon on Pro. |
| D4 | **Student verification v1 is email-domain + document fallback, v2 is SheerID.** v1: an allow-list of academic domains (the public Swot list, vendored and refreshed monthly by an A10 job) matched against a *verified* secondary email; fallback: upload of a student ID/enrolment letter reviewed in the support queue (A8). v2 (post-Launch 2): SheerID for instant verification in 10+ countries; cost per verification is a marketing cost, not in the price. Verification writes `student_verification {user_id, method, institution_domain, verified_at, expires_at, reviewer}`; the student price is purchasable only while a row is unexpired. |
| D5 | **Regional pricing = separate `product_price` rows with a `country_set`** (ISO codes) on a `PRO_LITE` product (budget $1.00, resumes 10, matches 5) at a locally sensible price, published region by region **only where the guard passes**; shown on `/pricing` by the visitor's country (Cloudflare `CF-IPCountry` header, already in front of the site) with a line "Pricing for {country}". Checkout verifies the card country matches (`customer_details.address.country` on the session); mismatch → the standard price on the next attempt and a plain message. No VPN heuristics beyond that at v1. |
| D6 | **Adaptive Pricing (currency display) is on from Launch 1.** It costs us nothing extra (Stripe charges the *buyer* a conversion fee from 2 %, <https://stripe.com/pricing>), needs one dashboard switch, and makes a $19.99 price read as €18.40 for a Berlin student. It is **not** regional pricing — we receive the same USD. |
| D7 | **Referral reward is a grant, not a discount.** U16.4's "one month of Pro for both" becomes `entitlement_grant{source=REFERRAL, product=PRO, 30 days}` created server-side after the invitee's 7th active day; it costs at most $3 of AI per side and is budgeted as CAC: a runtime setting `referral.monthly_budget_cents` (A5.1) and a per-user cap (3 referrals credited per year). When the budget is exhausted the program pauses with a visible "referrals paused this month" line — never a silent failure. A referral grant never stacks with an active paid period (it starts when the paid period would next renew: the user's `current_period_end` moves out one month via `gateway.extendPeriod` — Stripe "trial"-style extension on an existing subscription is implemented as a one-month 100 %-off coupon applied to the next invoice, the only place a 100 % coupon is allowed, and it is created by the system, not an admin). |
| D8 | **Stacking rules:** one promo per checkout (Stripe enforces); student price + promo never; regional price + promo never; referral grant + any paid plan = highest wins, the grant waits (D7); admin comps (ADMIN_COMP) stack by "highest wins" like every grant. Encoded as `DiscountPolicy.canCombine(a, b)` with a table test. |
| D9 | **No launch sale, no "first month $1", no lifetime deal.** Lifetime deals (Rezi $149, LazyApply on StackSocial) sell future AI cost for a one-time payment — incompatible with the floors by construction. Recorded so nobody proposes it twice. |

## 3. Student plan margin (proposed numbers; the guard decides at publish)

| Price | AI budget | fees (card+billing+blend+disp/email) | cost | margin |
|---|---|---|---|---|
| PRO_STUDENT $11.99/mo | 150 | 35+30+8+8+5 = 86 | 236 | **80.3 %** ✓ |
| PRO_STUDENT $29.99/3 mo | 400 | 87+30+21+19+5 = 162 | 562 | **81.3 %** ✓ |
| (for contrast) Pro $19.99 with 40 % student coupon → $11.99 | 300 | 86 | 386 | 67.8 % ✗ |

Benchmark context: Jobscan, Teal, Huntr and Rezi publish **no** student price (checked 2026-10-11; see
`AUDIT-pay.md` §B); Kickresume has a student/edu tier via university partnerships. A verified $11.99
student plan from a tool that fills applications is a differentiator for the campus programme the
marketing area (`mkt`) owns.

## 4. Regional (PPP) pricing — where the floor allows it

`PRO_LITE` ($1.00 AI budget, 10 resumes, 5 matches/day, no inbox? — no: keep inbox; it is cheap) at:

| Region set (examples) | Price | cost (100 + fees) | margin |
|---|---|---|---|
| IN, PK, BD, LK, NP | $5.99 | 100 + 17+30+4+4+5 = 160 | 73.3 % ✗ — **fails**; $7.99 → 100 + 23+30+5+5+5 = 168 → 79.0 % ✗; **$8.99** → 171 → **81.0 %** ✓ |
| BR, MX, CO, AR, PH, ID, VN, EG, NG, KE | $9.99 | 100 + 29+30+6+6+5 = 176 | **82.4 %** ✓ |
| PL, RO, TR, ZA, MY, TH | $12.99 | 100 + 38+30+8+8+5 = 189 | **85.4 %** ✓ |

The 30 ¢ fixed fee is what kills sub-$9 prices — a known Stripe truth (one reason the benchmark tools do
not go below ~$9 either). **Recommendation:** ship D6 (currency display) at Launch 1; ship `PRO_LITE` at
$8.99 / $9.99 / $12.99 for the three sets after Launch 2, once the realised-margin report (B2.4) shows the
typical AI spend per region. Open question 5 asks whether a 73 % floor for a *Lite* product in the first
region set is acceptable — the locked floor says no, so the plan assumes $8.99.

## 5. Data (additive)

```sql
ALTER TABLE product_price ADD COLUMN accepts_promos BOOLEAN NOT NULL DEFAULT FALSE,
                           ADD COLUMN country_set VARCHAR(400) NULL,      -- csv ISO-3166 alpha-2; NULL = everywhere
                           ADD COLUMN requires_verification VARCHAR(20) NULL; -- STUDENT | NULL
CREATE TABLE student_verification (
  id BIGINT PK, user_id BIGINT NOT NULL, method VARCHAR(20) NOT NULL,      -- EDU_EMAIL | DOCUMENT | SHEERID
  institution_domain VARCHAR(255), evidence_ref VARCHAR(255),              -- support-queue attachment id for DOCUMENT
  verified_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, reviewer VARCHAR(50), revoked_at DATETIME,
  INDEX (user_id, expires_at)
);
CREATE TABLE academic_domain (domain VARCHAR(255) PK, source VARCHAR(20), added_at DATETIME);
CREATE TABLE referral (
  id BIGINT PK, referrer_user_id BIGINT, invitee_user_id BIGINT UNIQUE, code VARCHAR(16) UNIQUE,
  invitee_signed_up_at DATETIME, qualified_at DATETIME,                    -- 7th active day
  referrer_grant_id BIGINT, invitee_grant_id BIGINT, status VARCHAR(20),   -- PENDING|QUALIFIED|CREDITED|PAUSED|REJECTED
  INDEX (referrer_user_id, status)
);
```
`entitlement_grant.source` gains `REFERRAL` and `STUDENT_PLAN` is not a source (it is a normal
`STRIPE_SUBSCRIPTION` grant on the `PRO_STUDENT` product).

## 6. API

```
GET  /api/catalog/public?country=DE            -> prices applicable to the visitor (regional + standard; student shown with "verify" state)
POST /api/billing/student/verify {method: EDU_EMAIL, email}  -> sends a code to the academic address; 422 NOT_ACADEMIC if the domain is unknown
POST /api/billing/student/verify/confirm {code}               -> student_verification row (12 months); 409 if already verified
POST /api/billing/student/verify {method: DOCUMENT} multipart -> support ticket (A8) with the file; status PENDING shown on /pricing
GET  /api/billing/referral                     -> {code, link, credited, pending, budgetPaused}
POST /api/signup?ref=CODE                      -> existing signup + referral row (PENDING)
Admin: POST /api/admin/promo-codes (admin doc) → guard on net price; GET /api/admin/referrals/budget
```

## 7. Abuse & failure modes

| case | behaviour |
|---|---|
| Student verified, then graduates | the price simply stops being purchasable at `expires_at`; an active subscription stays on its price until it lapses or the user switches (immutable price rows — grandfathering is the honest default); re-verification is offered 30 days before expiry |
| Academic domain shared with staff/alumni | accepted — the cost is bounded by the smaller budget; the realised report shows the segment's margin |
| Regional price bought via VPN with a foreign card | checkout country check (D5) refuses the regional price for a card from outside the set; a second attempt gets the standard price; no account action |
| Referral farming (self-invites) | qualification needs 7 *active* days (U18 events) + distinct verified email + distinct device fingerprint hash; the monthly budget caps the blast radius; A9.3 abuse flags can REJECT |
| Promo code leaked to a coupon site | `max_redemptions` and 90-day expiry bound it; the mirror shows redemptions per day; archive = `active=false` in Stripe |
| Coupon stacks with a regional price via Stripe dashboard misuse | `accepts_promos=false` on regional/student rows → `allow_promotion_codes=false` on the session; a promo applied manually in Stripe is caught by the reconciler as "unexpected discount" |

## 8. Tests

`DiscountPolicyTest` (stacking table), `PromoCodeServiceTest` (below floor refused; forever refused;
max redemptions required), `StudentVerificationIT` (academic domain → code → row; unknown domain → 422;
expired → price not purchasable → checkout 404 `UNKNOWN_PRICE`), `RegionalPriceIT` (DE visitor sees €
display only; IN visitor sees `PRO_LITE`; card-country mismatch → standard price), `ReferralServiceTest`
(qualify on day 7; budget pause; no stacking with paid period; self-referral rejected),
`MarginCalculatorTest` rows for §3/§4.

## 9. Wireframe — /pricing discounts strip, 390 px

```
┌──────────────────────────────┐
│ Students                     │
│ Pro Student · $11.99/mo      │
│ Same AI, smaller allowance.  │
│ Verify with your university  │
│ email → [ Verify ]           │
│──────────────────────────────│
│ Pricing for India 🇮🇳         │
│ Pro Lite · ₹749/mo ($8.99)   │
│ [ See what's included ]      │
│──────────────────────────────│
│ Have a code? Enter it at     │
│ checkout (3-month plans).    │
└──────────────────────────────┘
```
