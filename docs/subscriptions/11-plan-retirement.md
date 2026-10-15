# 11 — Plan, add-on and price retirement: lifecycle, notices, successors, subscriber choices, the Free fallback with read-only lock

> Status: design, 2026-10-15 (Fable). Applies the locks verbatim: **no refunds, cancel anytime; `past_due`
> entitled to period end; Stripe is the truth, webhooks write mirrors; never collect sensitive PII; nothing
> unlimited; downgrade never deletes data.** User decisions folded in (2026-10-15): **the no-response default
> is Free with a read-only lock** (`decisions-for-user.md` S-19, answered) and the per-retirement choice
> between keeping a plan indefinitely and retiring it at the next renewal is the admin's (S-20).
> This doc **replaces** the "sunset" paragraphs of `02 §3.1`, `04 §6` and `08 §3` with one lifecycle: the
> state formerly called `SUNSET` is `RETIRING` below; the tables of §10 extend `08`. Stories: epic **K10** in
> `docs/roadmap/areas/sub.json` (and K2.4 narrows to grandfathering + the migration primitive).

## 1. Principles (each is an acceptance test somewhere in §13)
1. **Nobody loses paid time or features early.** A retirement never shortens a paid period; yearly terms
   run to their renewal.
2. **Nobody is silently re-priced.** A higher price needs the subscriber's explicit consent (a confirmed
   quote); a lower or equal price may move at renewal only after the full notice schedule.
3. **Nobody loses data.** Fallback to Free locks services read-only; nothing is deleted; over-cap data stays.
4. **Everything is admin-configurable**: states, dates, notice schedule, successor mapping, default outcome
   per retirement, copy — rows and settings, never constants.
5. **One lifecycle for plans, add-ons (services sold as OPTIONAL / SEAT_OPTIONAL) and price versions**,
   both worlds; enterprise differs only in who is notified and who decides (§8).

## 2. States

### 2.1 Plan (`plan.status`) and plan version (`plan_version.status`)
```
plan:          DRAFT ──publish──► PUBLISHED ──start retirement──► RETIRING ──retirement completes──► RETIRED
                                      ▲                               │ cancel retirement (before any subscriber moved)
                                      └───────────────────────────────┘
plan_version:  DRAFT ─► PUBLISHED ─► SUPERSEDED (a newer version is live; subscribers keep this one) ─► RETIRING ─► RETIRED
```
| State | New buyers | Existing subscribers | Public catalog | Who / how |
|---|---|---|---|---|
| PUBLISHED | yes | — | listed (if `public`) | admin publish (04 §4) |
| SUPERSEDED (version) | no (the live version sells) | keep it, renew on it | not listed | automatic on the next publish |
| **RETIRING** | **no** (`410 PLAN_RETIRING {successors}` on quotes/checkout) | **keep everything until their `retire_effective_at`** (§3) | hidden | admin starts a **retirement** (§10 `plan_retirement`) with reason, HIGH audit, re-auth |
| RETIRED | no | none left (all moved, fell back, or cancelled) | hidden | automatic when the last subscription leaves; or admin "close" with zero subscribers; read-only forever |

A retirement is cancellable while `status=RETIRING` and no subscriber has acted on it (`plan_retirement.cancelled_at`;
subscribers who already switched keep their new plan — switches are confirmed quotes, never undone by us).

### 2.2 Add-on (an OPTIONAL / SEAT_OPTIONAL `feature_definition` sold as a product)
`feature_definition.lifecycle`: `ACTIVE → RETIRING → RETIRED` with the same semantics per subscriber line
(`subscription_addon` / `license_feature`). A retiring add-on disappears from pickers and plan drafts (publish
refuses a draft that includes it: `422 SERVICE_RETIRING`); existing lines keep working to their
`retire_effective_at`. Successors are other add-ons or a plan that includes the feature.

### 2.3 Price version (`product_price`)
`active → retired` is already immutable-row semantics (21 §7): retiring a price never touches a line that
references it. A price retirement **with** a replacement price is a **re-price**, which is a retirement of
kind `PRICE` here: the same notices, the same "never higher without consent" rule, the same renewal timing.

### 2.4 Triggers and audit
| Action | Who | Needs | Audit |
|---|---|---|---|
| start / edit / cancel retirement | `ROLE_ADMIN` + `catalog.manage` (+ `billing.publish.two_person_rule` when on) | reason ≥ 20 chars, re-auth, typed plan key | `admin_audit_event PLAN_RETIREMENT_*` HIGH + `catalog_change` |
| approve a retirement whose default outcome moves anyone to a higher price | refused by design (`422 PRICE_INCREASE_REQUIRES_CONSENT`) — only opt-in | — | — |
| per-subscriber switch | the subscriber (or org admin for seats) | a confirmed quote | `personal_subscription_change` / `license_change` kind `RETIREMENT_SWITCH` |
| fallback at effective date | system job `RetirementJob` | the schedule reached `retire_effective_at` | `subscription_change kind FALLBACK_FREE` |

## 3. What existing subscribers keep (effective dates)

| Subscriber | `retire_effective_at` (per subscription) | Keeps until then |
|---|---|---|
| monthly / quarterly | `max(current_period_end at notice start, notice_start + billing.retirement.min_notice_days)` — never earlier than the end of the period already paid; if the minimum notice (default 30 d) reaches into the next period, the subscriber renews **once more on the old plan** and the date becomes that period's end | plan, add-ons, prices, allowances — unchanged |
| yearly (when annual is enabled) | the **next renewal** (`current_period_end`); never mid-term; if that renewal is closer than `min_notice_days`, one more annual renewal on the old plan (S-20 lets admin choose "keep indefinitely" instead) | everything, including seat transfers |
| cancel-pending | their period end (nothing changes; the retirement does not shorten it) | everything |
| past_due | `paid_through_at` rule unchanged (24 §3 step 3); the retirement date cannot precede it | everything |
| org on a contract (23) | **the contract's `ends_at`** (or the next contract version boundary), never earlier; contracts pin prices | everything on the contract |
| org without contract | the org's next renewal (monthly or yearly) | all seats |

`retire_effective_at` is computed once per subscription when the retirement starts, stored on
`plan_retirement_item`, shown to the subscriber, and **only ever moves later** (a renewal that happens before
a switch pushes it to the next period end). Nothing is prorated or credited at the effective date.

## 4. Notices (schedule, channels, copy)

### 4.1 Schedule (settings; per-retirement override in the wizard)
`billing.retirement.notice_schedule_days` default `[60, 30, 7, 1]` relative to each subscriber's
`retire_effective_at`; `billing.retirement.min_notice_days` 30 (hard minimum 30; legal floor for price
changes, B4.2); `billing.retirement.channels` default `["EMAIL","IN_APP"]` (+ `PUSH` when subscribed);
reminders stop the moment the subscriber chooses. Enterprise: `enterprise.retirement.notice_schedule_days`
`[90, 60, 30, 7]`, recipients = billing contacts + OWNER/ORG_ADMIN/FINANCE roles (never consultants directly
for plan-level notices; seat-level add-on retirements also notify the consultant with "ask your admin").
Every send is a `billing_notice` row (`kind RETIREMENT_NOTICE_{days}`, dedupe key
`RET:{retirementId}:{subscriptionId}:{days}`), so support can see what was said and when.

### 4.2 Copy register (`web/src/lib/billing-copy.ts` keys; email templates share them)
| key | text |
|---|---|
| `retire.subject` | "Your {planName} plan is changing on {date}" |
| `retire.intro` | "We're retiring {planName}. Nothing changes until **{date}** — you keep everything you paid for until then." |
| `retire.suggest` | "Based on what you use, **{successorName}** is the closest match: {diffLine}. You can switch now or at your renewal." |
| `retire.diffLine.same` | "same price, everything you use is included" |
| `retire.diffLine.lower` | "{amount} less per {interval}" |
| `retire.diffLine.higher` | "{amount} more per {interval} — we will never move you to a higher price without your say-so" |
| `retire.default.free` | "If you do nothing, on {date} your account moves to Free. Everything you made stays — resumes, board, answers, history — in read-only mode for the services Free doesn't include. Pick a plan any time to unlock them instantly." |
| `retire.default.migrate` | "If you do nothing, on {date} we'll move you to {successorName} at {amount}/{interval} (not more than you pay today). Change your mind any time before then." |
| `retire.cancel` | "Prefer to stop? Cancel any time — you keep {planName} until {date}, and nothing more is charged." |
| `retire.banner` | "{planName} is changing on {date} · [See your options]" |
| `retire.lastDay` | "Tomorrow your plan changes. Today is the last day to switch with no gap." |
| `lock.banner` | "Some services are read-only since {date}. Your data is safe. [Pick a plan to unlock]" |
| `lock.card` | "{serviceName} is locked. Everything you made is here to read and download. Upgrade to use it again." |
Tone: warm, specific, no urgency theatre, no pre-selected choices, the date in every message.

## 5. Suggested replacements ("closest match")

### 5.1 Admin mapping
`plan_retirement_successor (retirement_id, successor_plan_key | successor_feature_key, rank, note)` — one or
more successors per retiring plan/add-on, ranked by admin; at least one is required to start a retirement
unless the default outcome is `FREE` for every subscriber (S-19) — then successors are still recommended
but optional.

### 5.2 Per-subscriber computation (`SuccessorAdvisor`, server-side, deterministic, no AI)
```
used(s)        = features of the retiring plan/add-on the subscriber used in the last 2 periods (personal_usage_event / usage_event committed > 0)
                 ∪ add-ons they hold ∪ limits they exceed on Free (e.g. resumes > 3)
for each successor c in admin ranking (plan versions PUBLISHED + public, or add-ons ACTIVE):
   covered(c)   = used(s) ∩ (INCLUDED(c) ∪ OPTIONAL(c) that they can add)
   gaps(c)      = used(s) \ covered(c)
   price(c)     = quote(s → c, same interval, carrying their add-ons where OPTIONAL(c) offers them)   -- PricingEngine, exact
   score(c)     = (|gaps|, max(0, price(c).delta), -rank)   lexicographic: fewest gaps, then smallest increase, then admin rank
best           = argmin score; ties → admin rank
```
Output per subscriber (stored on `plan_retirement_item.suggestion_json`, recomputed nightly until they act):
`{successorKey, covered[], gaps[], currentMinor, proposedMinor, deltaMinor, interval, monthlyEquivalentMinor,
annualAlternative?{proposedMinor, savingsMinor}, quoteId}`. The quote is a real `subscription_quote`
(kind `RETIREMENT_SWITCH`, no expiry until the effective date; re-quoted on catalog publish). The UI shows
the impact preview exactly as My plan does (05 §4) — monthly vs yearly side by side when annual is enabled.

## 6. Subscriber choices (the "Your plan is changing" page, §12)
| Choice | What happens | Money |
|---|---|---|
| **Switch now** to the suggested or another plan | confirm the quote → `UPGRADE_PLAN`/`DOWNGRADE_PLAN` per 07 §2.3: a higher price takes effect now with proration (their explicit consent); an equal or lower price takes effect **at the effective date** (no credit; they keep what they paid) — the page shows both options when the price is higher ("now, prorated $x" / "at renewal") | as quoted |
| **Switch at renewal** | scheduled change effective at `retire_effective_at` | nothing today |
| **Pick a different plan** | the public catalog filtered to eligible plans, each with a quote | as quoted |
| **Do nothing** | the default outcome of the retirement (§7) | nothing until the effective date |
| **Cancel** | B5.1 one-tap cancel; plan kept to period end; no refund | nothing |
A choice can be changed any time before the effective date (the last confirmed quote wins; a cancel wins over a switch).

## 7. Default outcome when the subscriber does nothing (user decision 2026-10-15 — S-19 answered)

**Default = `FREE` with read-only lock.** At `retire_effective_at` the `RetirementJob`:
1. sets `subscription.plan_version_id = FREE live version`, `billing_interval = NULL`, ends every
   `subscription_addon` (`ends_at = effective_at`), writes `personal_subscription_change kind FALLBACK_FREE`
   with the previous version in `payload_json`;
2. Stripe: `setCancelAtPeriodEnd(true)` had been set at notice time for the no-response cohort **only at the
   last notice (D-1) if still undecided**; the subscription ends at period end naturally (no new invoice);
   the webhook mirrors `canceled`; entitlements already fell back by the clock;
3. computes the **lock set** = every service the subscriber held (plan INCLUDED + add-ons) that the Free
   version does not include → `service_lock` rows (§7.2);
4. sends `retire.default.free` confirmation (`billing_notice kind FALLBACK_APPLIED`) and sets
   `lapse_notice_pending` so the first visit shows the "What changed" sheet (B4.4) with the lock list.

The alternative outcomes are **per-retirement admin choices** (S-20/S-21 in the decisions file) and are
only allowed when the rules permit: `MIGRATE_AT_RENEWAL` requires `successor price ≤ current price` for every
affected subscriber (else refused `422 PRICE_INCREASE_REQUIRES_CONSENT`) and the full notice schedule;
`CANCEL` is just FREE without the lock set being meaningful (same data rules). **Never a higher price
without explicit consent; never a deletion.**

### 7.1 What "read-only" means, per service (the `service_lock` behaviour table)
| service | locked = allowed | locked = refused (`FEATURE_LOCKED`) |
|---|---|---|
| `resume.library` (over Free cap) | view, download, export, share links already issued, archive, delete-by-owner | create a new resume, restore from archive beyond the cap, duplicate |
| `resume.ai_parsing` | view existing parses | parse a new upload beyond Free's 3 |
| `ai.resume_tailoring` | view every tailored version, diff, download | new tailoring runs |
| `resume.optimization` | view past ATS scores and suggestions | new scoring runs |
| `builder.ai` | view past AI proposals | new proposals |
| `ai.autofill` (`ai.server`) | nothing to read (BYO key still works — Free behaviour) | server AI mapping/drafting |
| `answers.sync` | read the last synced answers on each device | new syncs (device-local learning continues — Free) |
| `ai.job_matching` | match history, saved matches, feedback already given | new AI runs; Free's `matches.basic` (3 rule-ranked/day) still runs |
| `inbox.monitoring` | message history, classifications, the board moves it made | polling (paused; connection kept; `NO_ENTITLEMENT` shown — 18 §O3 behaviour) |
| `interview.ai_prep` | transcripts, scores, notes | new sessions |
| `automation.approved_apply` | past runs and prepared items (still editable by the user as ordinary applications) | new prepare runs |
| `alerts.advanced` | saved searches listed, past alerts | sending new alerts (switches to Free's standard alerts) |
| `analytics.applications` | last computed reports (frozen with a "as of {date}" chip) | recompute, export new |
| `resume.extra_pack` / `ai.credits_extra` | — (they are allowances; their data is the parent service's) | the extra allowance |
| org: `marketing.assisted_applications`, `resume.advanced_versions`, modules | seat-level equivalents (§8) | |
Rules: reads never consume allowances; "locked" never hides data in lists; exports (DSAR, resume download)
always work; a lock is **instantly** released when any live plan/add-on includes the feature again
(no job, no delay — the resolver sees the new rows). Deleting is the owner's right and unaffected.

### 7.2 Entitlement evaluation of the lock (extends 06)
`EntitlementDecision` gains `access: ALLOWED | LOCKED | DENIED`. `check()` Personal step **P3** becomes:
```
if features ∋ key                        → ALLOWED (continue to P3b…)
else if service_lock live for (user, key) → LOCKED  → reason FEATURE_LOCKED (402) {featureKey, name, lockedSince, lockedFrom: planKey, upgrade{…}}
                                            for write/consume operations; READ operations are ALLOWED with decision.access = LOCKED
                                            (the handler declares @RequiresFeature(mode = READ|WRITE); default WRITE)
else                                      → DENIED  → PLAN_REQUIRED / PRO_REQUIRED (unchanged)
```
`service_lock (user_id, feature_key, locked_at, locked_from_plan_version_id, released_at, reason FALLBACK|ADMIN)`;
one live row per (user, feature). `has(ctx, key)` stays boolean (ALLOWED only); new `access(ctx, key)` returns the
tri-state for UIs; `entitlementsOf` lists locked services with `lockedSince`. Org seats: `seat_service_lock
(org_id, member_id, feature_key, …)` evaluated at step 7 with the same tri-state (§8).
**Over-cap data:** limits are enforced only on **create**; `limit(ctx, resumes.max)` = 3 for Free, `count` may
be 12; the list shows all 12 with a "3 of 3 active slots — 9 read-only" chip; nothing is archived or deleted
by us; restoring/creating beyond the cap → `RESUME_LIMIT` as today.

## 8. Enterprise
- **Plan-level retirement** (an org plan version or the org's interval/price): notices to billing contacts +
  OWNER/ORG_ADMIN/FINANCE per §4.1; effective date per §3 (contract dates win); the org admin runs one
  `MIGRATE_VERSION` BULK quote (K6.3) to move every seat, or picks per seat in the matrix; default outcome
  per S-19 adapted: **every seat falls back to the base license** (SEAT_BASE + SEAT_INCLUDED) — the org
  never loses the base (E3: a licensed consultant is always a complete seat) — and each seat's add-on data
  becomes read-only per seat (`seat_service_lock`); modules not in the successor stop with their data
  read-only (marketer boards visible, no new prepares).
- **Add-on retirement** (e.g. retiring `alerts.advanced` for orgs): the Licenses page shows a banner with
  the count of affected seats and a bulk action **"Switch all → {successor}"** (one BULK quote, cost
  confirmation 28 §9) or **per seat** (matrix cells pre-highlighted, not pre-ticked); consultants get a
  "ask your admin" notice; at the effective date unswitched seats keep the base, the add-on line ends, data
  read-only.
- **Contract-priced orgs**: the retirement effective date is the contract boundary; contract rows for the
  retiring product stay valid until then; the next contract version must map to successors (the contract
  editor refuses a row on a RETIRED product — `422 PRODUCT_RETIRED`).
- Platform admin sees org progress in the wizard (§11) by org, seats switched/pending, MRR impact.

## 9. Stripe mechanics (test mode only; Kiwiply prorates; webhooks write mirrors)
| Step | Stripe | Kiwiply |
|---|---|---|
| start retirement | `prices.update(active=false)` for the retiring price rows (subscriptions keep billing on inactive prices) | `product_price.retired_at`; no line touched |
| subscriber switches now (higher price, consented) | `setSubscriptionItems` swap + Kiwiply proration invoice item (07 §2.2–2.3) | change rows APPLIED |
| subscriber switches at renewal / equal-or-lower now | `createSchedule(phase at retire_effective_at)` or the two-subscription fallback (07 §2.3, S-18) | change PENDING → applied by the job at the date |
| default FREE at effective date | `setCancelAtPeriodEnd(true)` at D-1 for still-undecided monthly/quarterly; for yearly at D-1 before renewal; subscription ends at period end; **no schedule, no new subscription** | FALLBACK_FREE rows; locks; mirror follows `customer.subscription.deleted` |
| default MIGRATE_AT_RENEWAL (admin choice, ≤ price) | schedule per subscriber created at notice start, idempotency `ret-{retirementId}-{subscriptionId}` | PENDING change; webhook `subscription_schedule.completed` confirms |
| coupons / promos | the subscriber's active Stripe discount is carried onto the schedule phase when still valid (`discounts[]` copied); org amount-off coupon re-sized at rollover (26 §5) | mirror |
| reconciliation | nightly reconciler (K8.5) compares schedules and cancel flags per retirement item; drift → `billing_drift kind RETIREMENT` | never auto-fixes |
Idempotency keys: `ret-{retirementId}-{subscriptionId}-{step}`. A retirement never calls `refund`.

## 10. Data (additive; extends `08`)
```sql
CREATE TABLE plan_retirement (
  id BIGINT PK, kind VARCHAR(12) NOT NULL,                -- PLAN | ADDON | PRICE
  plan_id BIGINT NULL, plan_version_id BIGINT NULL, feature_key VARCHAR(60) NULL, price_id BIGINT NULL,
  audience VARCHAR(12) NOT NULL, status VARCHAR(12) NOT NULL,   -- DRAFT | NOTICING | COMPLETING | COMPLETED | CANCELLED
  mode VARCHAR(16) NOT NULL,                                -- KEEP_INDEFINITELY | RETIRE_AT_RENEWAL   (S-20)
  default_outcome VARCHAR(20) NOT NULL DEFAULT 'FREE',      -- FREE | MIGRATE_AT_RENEWAL | CANCEL       (S-19: FREE)
  notice_schedule_json JSON NOT NULL, min_notice_days INT NOT NULL, channels_json JSON NOT NULL,
  message_md VARCHAR(2000) NULL, reason VARCHAR(500) NOT NULL,
  started_at DATETIME(6) NULL, started_by VARCHAR(50) NULL, approved_by VARCHAR(50) NULL, cancelled_at DATETIME(6) NULL, completed_at DATETIME(6) NULL,
  impact_json JSON NULL,                                    -- snapshot at start: subscribers by interval, MRR, by plan/org
  created_at DATETIME(6) NOT NULL, created_by VARCHAR(50) NOT NULL
);
CREATE TABLE plan_retirement_successor (retirement_id BIGINT, successor_plan_key VARCHAR(40) NULL, successor_feature_key VARCHAR(60) NULL, rank INT NOT NULL, note VARCHAR(200), PRIMARY KEY (retirement_id, rank));
CREATE TABLE plan_retirement_item (
  id BIGINT PK, retirement_id BIGINT NOT NULL, scope VARCHAR(8) NOT NULL,            -- PERSONAL | ORG
  user_id BIGINT NULL, subscription_id BIGINT NULL, org_id BIGINT NULL, org_subscription_id BIGINT NULL, license_id BIGINT NULL,
  retire_effective_at DATETIME(6) NOT NULL, interval VARCHAR(10) NOT NULL,
  suggestion_json JSON NULL, suggested_quote_id BIGINT NULL,
  status VARCHAR(16) NOT NULL,                                                        -- PENDING | SWITCHED_NOW | SWITCH_SCHEDULED | CANCELLED | FELL_BACK | MIGRATED | EXCLUDED
  decided_at DATETIME(6) NULL, decided_change_id BIGINT NULL, applied_at DATETIME(6) NULL,
  last_notice_days INT NULL, UNIQUE KEY ux_pri (retirement_id, subscription_id, license_id), KEY ix_pri_status (retirement_id, status), KEY ix_pri_effective (status, retire_effective_at)
);
CREATE TABLE service_lock (id BIGINT PK, user_id BIGINT NOT NULL, feature_key VARCHAR(60) NOT NULL, locked_at DATETIME(6) NOT NULL, locked_from_plan_version_id BIGINT NULL, reason VARCHAR(12) NOT NULL, released_at DATETIME(6) NULL,
  live_seq BIGINT GENERATED ALWAYS AS (IF(released_at IS NULL, 0, id)) STORED, UNIQUE KEY ux_service_lock_live (user_id, feature_key, live_seq));
CREATE TABLE seat_service_lock (id BIGINT PK, org_id BIGINT NOT NULL, member_id BIGINT NOT NULL, feature_key VARCHAR(60) NOT NULL, locked_at DATETIME(6) NOT NULL, reason VARCHAR(12) NOT NULL, released_at DATETIME(6) NULL,
  live_seq BIGINT GENERATED ALWAYS AS (IF(released_at IS NULL, 0, id)) STORED, UNIQUE KEY ux_ssl_live (org_id, member_id, feature_key, live_seq), KEY ix_ssl_org (org_id, member_id));
ALTER TABLE feature_definition ADD COLUMN lifecycle VARCHAR(12) NOT NULL DEFAULT 'ACTIVE';   -- ACTIVE | RETIRING | RETIRED
-- plan.status / plan_version.status gain RETIRING (the former SUNSET value is not used); subscription_quote.kind gains RETIREMENT_SWITCH;
-- personal_subscription_change.kind and license_change.kind gain RETIREMENT_SWITCH, FALLBACK_FREE, FALLBACK_BASE.
```
Settings: `billing.retirement.notice_schedule_days` `[60,30,7,1]`, `billing.retirement.min_notice_days` 30
(hard min 30), `billing.retirement.channels`, `billing.retirement.default_outcome` `FREE` (HIGH), `enterprise.retirement.notice_schedule_days` `[90,60,30,7]`, `billing.retirement.suggestion_lookback_periods` 2.

## 11. Admin UX — retirement wizard (`/admin/pricing/plans/{key}/retire`, admin kit; HIGH)
**1440** — `Stepper` across the top, content below, sticky footer with [Back] [Next] / [Start retirement…]:
```
① Scope          ② Impact                    ③ Successors              ④ Notices & default         ⑤ Review & start
┌ Scope: Plan "Pro v1" (SUPERSEDED) · also retire add-ons? ☐ Extra resumes (+10)         Mode: (● Retire at next renewal)( Keep indefinitely — only hide from new buyers ) ┐
┌ Impact (computed)  AdminStatTiles: 212 subscribers · $4,238.88 MRR · 180 monthly · 32 quarterly · 0 yearly │ by interval HBarList │ earliest effective Nov 15 · latest Jan 11 │
│ AdminTable: login (admin only) · interval · period end · effective date · uses (chips) · suggested successor · Δ/mo                                                           │
┌ Successors: [Pro v3 (rank 1)] [Autopilot v1 (rank 2)] [+ add]   Coverage preview: 198 fully covered · 14 with gaps (list the gap features)                                │
│ Price check: 0 subscribers would pay more under rank 1 → default MIGRATE_AT_RENEWAL allowed ✓ / "9 would pay more → only FREE or OPT-IN"                                     │
┌ Notices: schedule [60] [30] [7] [1] days · channels ☑ email ☑ in-app ☐ push · message (markdown, preview on the right at 390) · Default if no response: (● Free + read-only lock)( Migrate at renewal ≤ price )( Cancel ) ┐
┌ Review: diff of everything above · "This starts notices today; nothing changes for anyone before Nov 15." · ConfirmTypedSheet (type PRO) + reason + re-auth → [Start retirement] ┐
```
**Progress page** (`…/retirements/{id}`): `AdminStatTiles` pending / switched now / scheduled / cancelled /
fell back / migrated; MRR retained vs at risk; `BarLineChart` of decisions over time; table with filters
(status, interval, successor) and per-row actions: "Resend notice", "Exclude (reason)", "Open subscriber";
org tab for enterprise retirements (by org: seats switched/pending, billing contact, last notice); [Cancel
retirement…] (typed confirm; only while no item has acted); [Close] when complete.
**390** — stepper one step per screen; impact tiles 2×2; table → cards; the message preview is a `BottomSheet`.
Empty: "No subscribers on this plan — retire immediately?" (then RETIRED without notices). Error: kit card.

## 12. Customer UX
**Banner** (every signed-in page; `StatePill` amber): `retire.banner` → `/settings/plan/changing`.
**"Your plan is changing" page** `/settings/plan/changing`, 1440:
```
┌ Pro v1 is changing on Nov 15                                                                                      ┐
│ You keep everything until then. Here is what you use and what we suggest.                                          │
│ ┌ What you use ───────────────┐ ┌ Suggested: Pro v3 ─────────────────────────────┐ ┌ Other options ────────────┐ │
│ │ ✓ AI tailoring (27 of 40)   │ │ Covers everything you use ✓                     │ │ Autopilot  $39.99/mo      │ │
│ │ ✓ Inbox monitoring           │ │ $19.99/mo → $19.99/mo  (same price)             │ │ [See quote]               │ │
│ │ ✓ Daily matches              │ │ Yearly: $215.89 once a year · save $23.99 (when enabled)                        │ │
│ │ ✓ 12 resumes (3 free slots)  │ │ [Switch at renewal — free]  [Switch now]         │ │ Stay on Free on Nov 15:   │ │
│ │ ✗ Extra resumes +10 (add-on) │ │ Impact preview (05 §4 block)                     │ │ 9 resumes become read-only│ │
│ └──────────────────────────────┘ └──────────────────────────────────────────────────┘ │ [I'll decide later]       │ │
│ If you do nothing: on Nov 15 you move to Free. Nothing is deleted. AI tailoring, inbox monitoring and 9 resumes  │
│ become read-only until you pick a plan. [Cancel plan instead] (you keep Pro until Nov 15, no refund)               │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
**390**: one column; the suggestion card first with the two buttons; "What you use" collapsible; sticky
bottom bar "[Switch at renewal — free]". A higher-priced suggestion shows "Switch now · $x today (prorated)"
and "Switch at renewal · $y/mo from Nov 15" as two explicit buttons, never a default.
**After fallback**: `lock.banner` on every page; locked services render their normal pages with a `lock.card`
(data lists intact, create/run buttons replaced by "Locked — [Pick a plan]"); the resume list shows
"3 of 3 active slots · 9 read-only"; the extension drawer shows one line "Some services are read-only — unlock
at kiwiply.com/settings/plan". Unlocking after an upgrade is instant (no page says "within 24 h").
Enterprise: Licenses page banner + bulk action (§8); the consultant Features page marks locked seat add-ons.

## 13. Tests (names used by K10 stories)
| Test | Proves |
|---|---|
| `RetirementEffectiveDateTest` | §3 table: monthly/quarterly/yearly/cancel-pending/past_due/contract dates; the date only moves later |
| `NoEarlyLossIT` | for every fixture subscriber, entitlements and prices are byte-identical from notice start to `retire_effective_at − 1 s` (clock-driven) |
| `NoSilentRepriceTest` | default MIGRATE refused when any successor price is higher; FREE/opt-in paths never create a charge |
| `SuccessorAdvisorTest` | §5.2 scoring on fixtures (fully covered, gaps, tie → rank), quote reuse, nightly recompute |
| `RetirementNoticeScheduleTest` | 60/30/7/1 sends with dedupe; stop on decision; enterprise recipients; copy keys present |
| `FallbackFreeJobTest` | locks computed = held services \ FREE; add-ons ended; change rows; idempotent rerun; Stripe cancel at D-1 only for undecided |
| `ServiceLockEvaluationTest` | tri-state per service of §7.1 (read ALLOWED with access=LOCKED, write → FEATURE_LOCKED); instant release on upgrade; over-cap resume rules; reads never reserve |
| `DowngradeNeverDeletesIT` | row counts of resumes/versions/messages/matches/transcripts before and after fallback are equal |
| `SeatFallbackTest` | org seats keep SEAT_BASE; add-on lines end; `seat_service_lock` rows; bulk switch quote |
| `RetirementStripeIT` (fake gateway) | schedule per item with the right key; cancel-at-period-end at D-1; coupons carried; no refund call ever |
| `RetirementReconcilerTest` | schedule/cancel drift per item → `billing_drift RETIREMENT` |
| `PersonalSubscriptionUnchangedIT` E15 | an org retirement never touches a personal subscription and vice versa |
| Playwright `plan-changing.spec.ts`, `admin-retirement.spec.ts` | 390/1440 journeys of §11–§12; axe; copy lint on every CTA |
