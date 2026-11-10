# Design — Referral programme (area `mkt`, epic M6)

Status: decided 2026-10-11, **reward amount is an open question for the user** (PLAN-user.md §7 Q5
and PLAN-mkt.md §6). The user area planned the in-app share surface (U16.4: "referral link + reward,
one month of Pro for both after the friend's first week active"); this document is the **engine**
behind it — codes, attribution, states, fraud, reward grant, economics, admin view. U16.4 keeps the
Settings/recap surfaces and `relates` here.

Benchmarks: Teal referral codes ($5/$9 credits + a 1-week trial per third-party listings),
Simplify's hire-bounty referrals (needs an employer side we don't have), JobRight's "Insider
Connections" (not a reward programme). None of them publishes the rules plainly; ours will.

## 0. Summary

1. Every user gets a **code** (`KIWI-7F3K2`) and a link (`kiwiply.com/r/7F3K2`). The link lands on
   a referral landing page that says exactly what both sides get, then `/signup?ref=`.
2. **Attribution** = first-touch cookie (`kw_ref`, 30 days, SameSite=Lax, httpOnly) + the `ref`
   field on signup; the cookie wins over a later typed code; one referrer per invitee, forever.
3. **Reward** (proposed default, needs the user's yes): **both sides get 1 month of Pro** once the
   invitee is **activated** (U2 definition) **and** has **7 active days** within 30 days of signup.
   The reward is an entitlement grant (`entitlement_grant`, not a Stripe coupon), so it works for
   Free users (they get Pro for a month) and for Pro subscribers (their next invoice is skipped by a
   Stripe coupon applied once — the only Stripe touch).
4. **Cap**: 12 rewarded referrals per referrer per rolling year (12 free Pro months max); invitee
   reward once per account; referrer and invitee must be different humans (fraud rules §5).
5. **Economics**: a rewarded referral costs at most two months of Pro's marginal cost (AI budget
   $3/mo + hosting cents ≈ $3.50/side ≈ $7) against a paying conversion that yields ≥ $19.99. The
   locked **80 % gross-margin floor is per subscription in the worst case**; a free month is marketing
   spend, not a subscription discount, and it is bounded by the cap. The admin margin report (A16)
   shows referral cost as a line.

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Reward unit | Pro time (entitlement grant), not cash, not credits | No money moves; the cost is bounded by the AI budget; it previews the paid product |
| Trigger | Invitee activated + 7 active days ≤ 30 days after signup | Pays for retained users only; kills sign-up farms |
| Who can refer | Any verified account (Free included) | Free users are the biggest cohort |
| Double-sided | Yes | Single-sided programmes convert worse; the invitee's month is the "try Pro" we otherwise never give (no trial — this is the one honest exception, framed as a gift from a friend, and it is **not** a trial: no card, no auto-conversion) |
| Code format | `KIWI-` + 5 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I) | Readable aloud, typeable on a phone |
| Where it lives | Settings › Referrals (U16.4), Sunday recap (U16.3), extension drawer footer (one line), the welcome series (M9.1) | Moments of satisfaction, never interrupts a fill |
| Org members | Members of an organization can refer, but rewards go to the **member's personal** account; org seats are not affected | Keeps O-billing simple |
| Stacking | A referral reward never stacks with a promo code (A2.5) in the same month; whichever applies first | Margin guard simplicity |

## 2. Data model (MySQL, additive Liquibase)

```sql
CREATE TABLE referral_code (
  user_id BIGINT PRIMARY KEY,
  code CHAR(10) NOT NULL UNIQUE,              -- KIWI-7F3K2
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at TIMESTAMP NULL,                 -- abuse
  CONSTRAINT fk_referral_code_user FOREIGN KEY (user_id) REFERENCES jhi_user(id)
);

CREATE TABLE referral (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  referrer_id BIGINT NOT NULL,
  invitee_id BIGINT NOT NULL UNIQUE,          -- one referrer per invitee, ever
  code CHAR(10) NOT NULL,
  source ENUM('LINK','CODE','SHARE_CARD','EXT') NOT NULL,
  status ENUM('PENDING','QUALIFIED','REWARDED','REJECTED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  reject_reason VARCHAR(40) NULL,             -- SELF, SAME_DEVICE, DISPOSABLE, CAP, CHARGEBACK, MANUAL
  signup_at TIMESTAMP NOT NULL,
  qualified_at TIMESTAMP NULL,
  rewarded_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,              -- signup_at + 30 days
  signup_ip_hash CHAR(64) NOT NULL,
  signup_ua_hash CHAR(64) NOT NULL,
  INDEX idx_referral_referrer (referrer_id, status),
  CONSTRAINT fk_referral_referrer FOREIGN KEY (referrer_id) REFERENCES jhi_user(id),
  CONSTRAINT fk_referral_invitee FOREIGN KEY (invitee_id) REFERENCES jhi_user(id)
);

CREATE TABLE entitlement_grant (                -- reused by campus/creator programmes (M7)
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  plan ENUM('PRO','AUTOPILOT') NOT NULL,
  reason ENUM('REFERRAL_REFERRER','REFERRAL_INVITEE','AMBASSADOR','SUPPORT','PROMO') NOT NULL,
  ref_id BIGINT NULL,                         -- referral.id / ambassador.id
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  created_by BIGINT NULL,                     -- admin id for SUPPORT/PROMO
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_grant_user_window (user_id, starts_at, ends_at)
);
```

`EntitlementService.isPro()` gains one branch: a live `entitlement_grant` row counts as Pro **only if
the user has no active paid subscription**; for paying users the grant becomes a one-time Stripe
coupon on the next invoice (`StripeGateway.applyOnce(customerId, couponId)`) and the row is marked
consumed by `ends_at = starts_at`. The plan on `GET /api/profile/version` reflects grants, so the
extension's badge updates.

## 3. API

- `GET /api/referrals/me` → `{code, link, stats:{pending, qualified, rewarded, capRemaining}, rules:{rewardMonths:1, activeDays:7, windowDays:30, cap:12}}`
- `POST /api/referrals/claim {code}` (signed-in invitee, within 14 days of signup, no cookie match) → creates PENDING or 409 `ALREADY_REFERRED`
- `GET /r/{code}` (web route) → sets `kw_ref` cookie, renders the landing page, CTA `/signup?ref=`
- Signup (`POST /api/register` via web BFF) accepts `referralCode` from cookie or form; the API validates and inserts `referral` PENDING with hashes.
- Nightly job `ReferralQualifier`: PENDING → QUALIFIED when `user_onboarding.activated_at IS NOT NULL` and `COUNT(DISTINCT DATE(event_day)) ≥ 7` from U18 daily rollups (`user_day_active`), inside the window; → EXPIRED after `expires_at`.
- Same job: QUALIFIED → REWARDED: insert two `entitlement_grant` rows (or coupon for payers), notify both via U7 (`referral_rewarded`), respecting the cap (`CAP` → REJECTED with reason, referrer told plainly "you've reached 12 this year").
- Admin: `GET /api/admin/referrals?status=&q=` + `POST /api/admin/referrals/{id}/reject {reason}` (audited, A12).

## 4. State machine

```
            signup with code/cookie
                     │
                     ▼
                 PENDING ──(30 d, not qualified)──► EXPIRED
                     │
      fraud rule hit │ activated + 7 active days
         ▼           ▼
     REJECTED ◄── QUALIFIED ──(nightly, cap ok)──► REWARDED
       ▲                                              │
       └──────────── chargeback / admin ◄─────────────┘  (grant revoked: ends_at = now)
```

## 5. Fraud rules (evaluated at signup and again at qualification)

| Rule | Check | Outcome |
|---|---|---|
| Self-referral | invitee email = referrer email (normalised, dots/plus stripped for gmail), or same `signup_ip_hash` **and** `signup_ua_hash` as the referrer's last 30-day sessions | REJECTED `SELF` / `SAME_DEVICE` |
| Disposable email | domain in the maintained block list (`web/src/lib/disposable-domains.ts`, reused by U1) | REJECTED `DISPOSABLE` |
| Velocity | > 10 PENDING from one referrer in 24 h, or > 3 signups from one IP hash in 24 h with codes | hold (PENDING, flagged for admin) |
| Activity sanity | the 7 active days must include ≥ 3 distinct kinds of events (view, save, fill, alert…) | else stays PENDING |
| Chargeback / fraud on invitee's later payment | Stripe webhook `charge.dispute.created` → revoke both grants | REJECTED `CHARGEBACK` |
| Cap | 12 REWARDED per referrer per rolling 365 days | REJECTED `CAP` (referrer informed) |

No device fingerprinting libraries; hashes of IP + UA with a daily salt are enough at our scale and
are not retained beyond the referral row (purged with the account).

## 6. Economics (for the user's decision)

| Scenario | Cost to us | Value |
|---|---|---|
| Free invites Free, both qualify | 2 × Pro-month marginal cost (AI budget cap $3 + ~$0.30 infra) ≈ **$6.60 worst case**, typically < $2 (most never spend the budget) | Two activated users; one Pro preview each |
| Pro invites Free | 1 grant + 1 skipped invoice (**$19.99 revenue forgone**) | A retained invitee; the referrer's month is the expensive side |
| Alternative A (cheaper): referrer gets **+$3 AI budget** for a month instead of a free Pro month when already paying | ≈ $3 | Weaker motivator |
| Alternative B: invitee only | ≈ $3.30 | Lower share rate |

Floor check: a rewarded referral at the worst case costs ≈ $26.60 (Pro referrer) against an invitee
who converts at the market-typical 5–10 % into ≥ $19.99/mo; break-even needs ~1.3 months of one
conversion per ten rewards. Honest answer: it is marketing spend bounded at **12 × $26.60 = $319/yr
per referrer**, which the cap enforces. Recommended default: the proposal in §0; fall back to A if
the admin margin report shows referral cost > 5 % of MRR.

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| Cookie blocked (Safari ITP, private mode) | `?ref=` on the signup URL + the typed-code path within 14 days |
| Invitee signs up with Google (no form) | The BFF forwards the cookie's code with the Google registration call |
| Nightly job fails | Idempotent; next run catches up; admin A10 scheduled-job health shows it |
| Grant overlaps an active subscription | Coupon path; never a double benefit |
| Referrer deletes account | Pending referrals EXPIRE; already granted invitee months stay |

## 8. Security / privacy

Codes are not secrets but are unguessable enough (5 chars of 31 = 28.6M). The landing page shows the
referrer's **first name only** ("Priya invited you") and only if the referrer opted in (`show_name`
in `referral_code`, default on, toggle in U16.4). Hashes, never raw IP/UA. Privacy policy gets a
"Referrals" paragraph (U14.5). Emails to invitees only after they sign up (we never email a friend's
address on a user's behalf — that would be sending on their behalf and a CAN-SPAM problem; sharing
happens through the OS share sheet / copy link).

## 9. Cost

Zero new services. Two Liquibase files, one job, one web route, one admin page. Reward cost as in §6.

## 10. Tests

- `ReferralServiceIT`: code generation uniqueness, cookie vs code precedence, one referrer per
  invitee, each fraud rule, cap, qualification math against seeded `user_day_active`, grant vs
  coupon path, revoke on dispute.
- `EntitlementServiceIT`: grant makes `isPro()` true without subscription; expired grant does not.
- Web: `/r/CODE` sets cookie and renders rules; signup forwards code; Playwright 390 px for the
  Settings share sheet (U16.4).
- Admin: list/filter/reject audited.

## 11. Rollout

M6.1 schema + code + landing + signup capture (no rewards yet, status PENDING only) → M6.2 qualifier
job + grants + notifications (behind runtime flag `referrals.enabled`, A5) → M6.3 fraud rules +
admin page → U16.4 in-app surfaces → M6.4 welcome-series + recap placements → review cost after 60
days.

## 12. Wireframes (390 px)

```
/r/7F3K2                                   Settings › Referrals (U16.4 surface)
┌──────────────────────────────┐           ┌──────────────────────────────┐
│ 🥝 Priya invited you         │           │ Invite a friend              │
│ to Kiwiply                   │           │ You both get a month of Pro  │
│                              │           │ when they've used Kiwiply    │
│ Fill job applications from   │           │ for a week. No card needed.  │
│ one profile. You review,     │           │ ┌──────────────────────────┐ │
│ you submit — always.         │           │ │ KIWI-7F3K2        [Copy] │ │
│                              │           │ └──────────────────────────┘ │
│ The deal, plainly:           │           │ [ Share link ]               │
│ • You get 1 month of Pro     │           │                              │
│   after 7 active days        │           │ 3 invited · 1 pending ·      │
│ • Priya gets the same        │           │ 1 rewarded · 10 left this yr │
│ • No card, nothing converts  │           │ Show my first name on the    │
│   automatically              │           │ invite page          [on]    │
│ [ Create free account ]      │           └──────────────────────────────┘
│ Already have one? Enter code │
└──────────────────────────────┘
```
