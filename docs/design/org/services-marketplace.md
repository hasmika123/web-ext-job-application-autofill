# Human services marketplace — experts, orders, payouts, quality (stories O9.*)

> Status: design, 2026-10-11. Locked inputs: `ROADMAP.md` Phase 20 (service_order, expert view,
> payouts ledger "manual first, Stripe Connect later", terms 20.5), "Prices — human services" table
> (review $79/~$50 payout · rewrite $199/~$130 · mock $129/~$85 · coaching $119/~$80; 10 % subscriber
> discount from our share; ≥20 % margin floor), `CLAUDE.md` → Services. Resume builder stories `R*`
> (`docs/resume-builder/stories.json`) own the resume document the rewrite produces.

## 1. Decisions

1. **Kiwiply is the merchant of record; experts are paid freelancers.** The client pays Kiwiply
   (Stripe Checkout one-time, or an org invoice item); Kiwiply records a payout obligation to the
   expert. Payouts start **manual** (admin pays monthly from the ledger, records the reference) and
   move to **Stripe Connect Express** when monthly service revenue passes ~$5k — the ledger shape
   does not change, only `expert.payout_account_ref` gets a `acct_…` id. **We never store bank
   account numbers, SSNs or tax IDs** of experts; Connect holds them, and until Connect, the
   payment happens outside Kiwiply (PayPal/Wise/bank) and only a reference string is recorded —
   "record, don't move" applies to the ledger itself.
2. **Admin-assigned matching first, suggested matching second.** Phase 20.3 says admin assigns; we
   add a ranked suggestion list (skills, language, timezone, capacity, rating) so assignment is one
   tap, and an **auto-assign** flag per service that can be switched on when supply is reliable.
3. **The client consents at checkout to the expert seeing exactly one resume and one target job**
   (and the chat). The expert view is a separate route group (`/expert/*`) with no access to anything
   else; access ends 14 days after completion.
4. **State machine with SLAs and a dispute path.** Refunds happen only through
   `StripeGateway.refund(...)` (new method) by admin action with a reason, audited; a refund cancels
   the payout obligation.
5. **Orgs can buy services for members, members must accept.** An org order creates an invoice item
   (`billing.md` §1.6) and a *pending* order the member accepts (consenting to the expert view) —
   nothing about the member reaches an expert before that.
6. **Quality is measured and acted on**: rating, on-time %, revision rate, no-shows. Experts below
   4.2 or with 2 no-shows in 90 days are auto-paused for admin review.
7. **Scheduling via the expert's booking link (Cal.com/Calendly) at first**, embedded, with the
   booked time written back by the expert (or parsed from the confirmation email later). No
   calendar integration of our own.

## 2. Data model (`20261011050000_services.xml`)

### `expert`
| column | notes |
|---|---|
| id, user_id UNIQUE FK | experts sign in as normal users with an `expert` row |
| display_name, headline VARCHAR(120), bio TEXT (≤1,500) | public card |
| skills_json | `["resume","interview","product","engineering",…]` from a controlled list |
| languages_json, timezone | |
| services_json | which product codes they deliver (`svc-resume-review`, …) |
| booking_url | Cal.com/Calendly, https only |
| capacity_per_week INT | open orders they accept concurrently |
| status | `VETTING` `ACTIVE` `PAUSED` `OFFBOARDED` |
| rating_avg DECIMAL(3,2), rating_count, on_time_pct, no_show_count_90d | denormalised, recomputed nightly |
| payout_account_ref VARCHAR(80) NULL | Connect `acct_…` later; never a bank number (validation rejects digits-only strings longer than 8) |
| payout_label VARCHAR(60) | "PayPal", "Wise" — a label the admin types |
| vetted_by_login, vetted_at, created_at, updated_at | |

### `service_order`
| column | notes |
|---|---|
| id, public_ref CHAR(10) UNIQUE | `SO-7F3A9K2Q` shown to users |
| user_id (the client), org_id NULL, ordered_by_member_id NULL | org orders fill the last two |
| product_id, product_price_id | catalog (`SERVICE` kind) |
| price_cents, discount_cents, stripe_payment_intent_id NULL, org_invoice_item_id NULL | discount = 10 % when the client has `ai.server` (Pro/Autopilot) and `org_id IS NULL` |
| status | see §3 |
| expert_id NULL, assigned_at, accepted_at | |
| target_resume_id, target_application_id NULL / target_job_text TEXT | what the expert may see; resume id must belong to `user_id` (checked) |
| consent_version, consented_at | the client's consent to expert access |
| due_at | SLA: review 48 h from accept; rewrite 5 business days; live sessions = booked time |
| scheduled_at NULL, meeting_url NULL | live services |
| deliverable_key NULL (S3), deliverable_resume_id NULL | rewrite writes a **new** resume into the client's account (`R*` builder doc) labelled "by {expert}" |
| revision_requested_at, revision_delivered_at | one round included |
| completed_at, closed_at | access ends 14 days after `completed_at` |
| payout_cents, payout_status | `NONE` `ACCRUED` `APPROVED` `PAID` `CANCELLED` |
| rating INT NULL, review_text VARCHAR(1000) NULL, review_public BOOLEAN | |
| created_at, updated_at | |

### `service_order_event`
`id, order_id, actor VARCHAR(20) (CLIENT|EXPERT|ADMIN|SYSTEM), actor_login, from_status, to_status,
note VARCHAR(1000), created_at` — the order's timeline (client and expert both see it).

### `service_message`
`id, order_id, sender VARCHAR(10) (CLIENT|EXPERT), body VARCHAR(4000), attachment_key NULL (≤10 MB,
pdf/docx/png), created_at, read_at` — a minimal thread; no email relay (experts and clients never see
each other's email).

### `expert_payout`
`id, expert_id, period_month CHAR(7), amount_cents, status (OPEN|APPROVED|PAID), order_ids_json,
paid_at, paid_reference VARCHAR(120), paid_by_login, created_at` — one row per expert per month;
`PAID` is a record of an external payment (or, later, a Connect transfer id).

## 3. State machine

```
 CREATED ──(Stripe paid / org invoice item added + member accepted)──► PAID ──► MATCHING ──(admin assign / auto)──► ASSIGNED
   │ (checkout abandoned 24 h)                                                                                       │ expert accepts ≤12 h
   ▼                                                                                                                 ▼ (else back to MATCHING, strike)
 CANCELLED                                                      live: SCHEDULED ──(session held)──► DELIVERED      IN_PROGRESS
                                                                 async: IN_PROGRESS ──(upload)────► DELIVERED ◄───────┘
                                                                                                      │
                                                     client: accept (or 5 days silence) ──► COMPLETED │  client: request revision (rewrite only, once) ──► REVISION ──► DELIVERED
                                                                                                      │  client: dispute ≤7 days ──► DISPUTED ──admin──► COMPLETED | REDO(→MATCHING) | REFUNDED
 COMPLETED ──(14 d)──► CLOSED (expert access ends)                                                    │
 any paid state ──(expert no-show)──► rebook (SCHEDULED) or REFUNDED at client's choice
```
Payout: `ACCRUED` on `COMPLETED`; `CANCELLED` on `REFUNDED`; partial refunds set `payout_cents`
proportionally (admin enters both numbers; the ledger stores what was decided).

SLAs: review 48 h; rewrite 5 business days (+48 h per revision); mock/coaching at the booked time;
expert acceptance 12 h. Breach → `SYSTEM` event + admin queue item; two breaches in 30 days → `PAUSED`.

## 4. Matching
`ExpertMatcher.rank(order)`: filter `ACTIVE`, delivers the product, `open_orders < capacity`,
language ⊇ client's, then score = 0.5·rating_norm + 0.2·skill_overlap(target job category) +
0.2·timezone_proximity (live only) + 0.1·on_time_pct; ties → fewest open orders. Admin UI shows the
top 5 with reasons; auto-assign (flag per product) takes #1 and notifies; the expert must still accept.

## 5. API

```
--- client ---
GET  /api/services                                    catalog SERVICE products with price + my discount
POST /api/services/orders {productCode, targetResumeId?, targetApplicationId?|targetJobText?, consentVersion}
        → {checkoutUrl}  (Stripe Checkout payment mode, client_reference_id = "svc:{orderId}")
GET  /api/services/orders/mine ; GET /api/services/orders/{ref}
POST /api/services/orders/{ref}/accept-delivery | /request-revision {note} | /dispute {reason} | /rate {rating, text, public}
GET/POST /api/services/orders/{ref}/messages
--- org ---
POST /api/orgs/{id}/services/orders {memberId, productCode}       → PENDING_MEMBER_ACCEPT (invoice item on accept)
GET  /api/orgs/{id}/services/orders                               status only (never deliverables)
--- member (accept org-bought service) ---
POST /api/me/services/offers/{ref}/accept {targetResumeId?, consentVersion} | /decline
--- expert ---
GET  /api/expert/me ; PATCH (bio, capacity, booking_url, languages)
GET  /api/expert/orders?status ; POST /{ref}/accept | /decline | /schedule {at, meetingUrl} | /deliver (multipart or resume doc) | /messages
GET  /api/expert/orders/{ref}/resume   (streams the one resume; audited)  ; GET /{ref}/job
--- admin (A area) ---
experts CRUD/vetting, assign, disputes, payout ledger, refunds via StripeGateway.refund
```
Webhook: `checkout.session.completed` with `client_reference_id=svc:{id}` → `PAID` (reuses the
existing idempotent pipeline; `svc:` prefix routed like `org:`).

## 6. Flows (390 px)

```
Buy (user app, Pro user)                     Expert view (/expert/orders/SO-7F3A)
┌──────────────────────────────┐            ┌──────────────────────────────┐
│ Resume review  · $79 → $71.10│            │ SO-7F3A · Resume review      │
│ Pro saves you 10%            │            │ Due in 31 h  ●               │
│ Which resume?  [Product v3 ▾]│            │ Client: J. (first name only) │
│ Target job?    [Paste link]  │            │ Target: Product Designer @…  │
│ ─────────────────────────────│            │ [Open resume (PDF)]          │
│ Your expert will see only    │            │ Messages (2)                 │
│ this resume + this job. 14   │            │ ┌──────────────────────────┐ │
│ days after delivery, access  │            │ │ Upload feedback (PDF/DOCX)│ │
│ ends. [Details]              │            │ │ or write it here…         │ │
│ [ Pay $71.10 ]  Apple Pay    │            │ └──────────────────────────┘ │
└──────────────────────────────┘            │ [ Deliver ]                  │
                                             └──────────────────────────────┘
```
After delivery the client gets a `Notification` + email; a "Rate your expert" sheet with 5 taps.
Rewrite deliverables appear in the client's resume list as a new resume "by {expert}" (`R*`),
approved by the client once before use (same approval pattern as marketer-made resumes).

## 7. Cost model & margin guard (SERVICE kind)
margin = (price − payout − stripe(2.9 %+$0.30) − discount) ÷ price

| service | list | discount (Pro) | payout | Stripe | margin |
|---|---|---|---|---|---|
| review | $79 | $7.90 | $50 | $2.59 | 23.4 % ✓ |
| rewrite | $199 | $19.90 | $130 | $6.07 | 21.6 % ✓ |
| mock | $129 | $12.90 | $85 | $4.04 | 21.0 % ✓ |
| coaching | $119 | $11.90 | $80 | $3.75 | 19.6 % ✗ → **payout $78** (21.3 %) or list $124; **decision: payout $78**, guard enforced in the catalog (18.4) |

Orgs pay list price (no discount) → margins 29–35 %. Disputes resolved by refund cost us the Stripe
fee (not returned) — budget 3 % of orders.

## 8. Security & privacy
- Expert routes require the `expert` row + order assignment; every resume stream is audited
  (`admin_audit_event`-style `service_audit_event` with order ref) and watermarked "Prepared for
  {expert} · Kiwiply order {ref}" in the PDF footer.
- Clients and experts are shown first names only; no emails exchanged; messages are the channel.
- Deliverables and messages are deleted 12 months after `CLOSED` (retention), orders' money fields
  kept 7 years.
- Experts sign a contractor agreement + confidentiality in the vetting flow (version stored).
- Terms (20.5): reschedule ≥24 h; expert no-show → rebook or refund; one revision round; 7-day
  dispute window; "not career advice guarantees" — lawyer to confirm.

## 9. Failure modes
| failure | behaviour |
|---|---|
| no expert accepts in 24 h | admin queue; client told "still matching, refund any time before assignment" |
| expert uploads wrong file | client disputes → REDO; access of the original expert ends |
| client never responds after DELIVERED | auto-COMPLETE at 5 days (payout accrues); dispute still allowed until day 7 |
| Stripe refund fails | order stays DISPUTED with admin alert; never mark REFUNDED without the Stripe refund id |
| org buys a service for a member who declines | invoice item not created (created on accept); org sees "declined" |

## 10. Tests
`ServiceOrderStateMachineTest` (every legal/illegal transition), `ExpertAccessTest` (other expert →
404; after CLOSED → 404; audited), `DiscountTest` (Pro yes, org no, Free no), `MarginGuardServiceTest`
(§7 incl. coaching payout), `OrgOrderAcceptTest` (invoice item only on accept), `PayoutLedgerTest`
(refund cancels/partials), web: buy sheet at 390 px, expert deliver flow, rating sheet.
