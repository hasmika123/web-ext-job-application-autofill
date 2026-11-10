# Org billing — setup fee, per-person items, Stripe mapping, entitlements (stories O3.*, O4.*)

> Status: design, 2026-10-11. Locked inputs: `CLAUDE.md` → Billing mechanics (Phase 12) and
> Expansion; `ROADMAP.md` → "Prices — organizations", Phase 18 (catalog), Phase 21.2.
> Existing code this extends: `api/.../service/EntitlementService.java`,
> `service/billing/BillingWebhookService.java`, `StripeGateway.java`, `domain/Subscription.java`,
> changelog `20260921000000_subscription.xml`.

## 1. Decisions

1. **Stripe is the truth; only webhooks write mirrors.** Unchanged from Phase 12. Org billing adds
   mirror tables (`org_subscription`, `org_subscription_item`, `org_invoice`) that
   `BillingWebhookService` writes and nothing else does. The web's "Add seat" button calls our API,
   our API calls Stripe, and the mirror changes only when Stripe tells us.
2. **One Stripe customer per org** (`organization.stripe_customer_id`, metadata
   `kiwiply_scope=org`, `org_id`). Never the OWNER's personal customer: an owner's personal Pro and
   the org's invoice must never share a payment method or a tax status.
3. **The setup fee ($499) is a one-time Checkout in `payment` mode** (card / Apple Pay / Google
   Pay; Stripe Tax on; business name + tax id collected). For bank transfer, the OWNER can instead
   request a **Stripe Invoice** (`collection_method=send_invoice`, `days_until_due=15`, hosted
   invoice page with ACH/SEPA). Either way `ACTIVE` happens only on `invoice.paid` /
   `checkout.session.completed` with `payment_status=paid`.
4. **One Stripe subscription per org, invoiced monthly**, `collection_method=send_invoice`
   (card on file auto-charges; bank transfer allowed), `days_until_due=15`, one **subscription
   item per org `product_price`**, `quantity = number of active assignments on that price`.
   Monthly only: org prices have no quarterly variant (ROADMAP table "Prices — organizations").
5. **Add = prorate; remove = end of period, no credit.** Assigning an item increments the item's
   quantity with `proration_behavior=create_prorations` (Stripe adds the partial-month line to the
   next invoice). Unassigning sets `org_assignment.ends_at = current_period_end` and decrements
   the quantity **immediately with `proration_behavior=none`** — the org already paid the month,
   the person keeps the grant until period end, nothing is refunded. This is the org version of
   "no refunds, cancel anytime".
6. **Services for a member are invoice items** on the org customer (`InvoiceItem`), so they land
   on the next monthly invoice; the order starts at once because an `ACTIVE` org has already paid
   the setup fee and is in good standing (`PAST_DUE` orgs cannot order services).
7. **Dunning is Stripe's.** `invoice.payment_failed` → org `PAST_DUE`, email to billing contacts;
   grants continue until `current_period_end`. When Stripe gives up (`customer.subscription.updated`
   with status `unpaid` or `canceled`), the org goes `SUSPENDED` and every `ORG_ASSIGNMENT` grant
   gets `ends_at = now`. Paying the open invoice (`invoice.paid`) re-activates and re-opens grants
   (new rows; the old rows stay for the audit).
8. **Entitlements come only from `entitlement_grant` rows (Phase 18.2).** `org_assignment` is the
   business record; each active assignment owns exactly one grant with
   `source=ORG_ASSIGNMENT, source_ref=org_assignment.id, org_id`. `EntitlementService.resolve(login)`
   unions all active grants; **highest limit wins, never the sum**; the AI budget period for an
   org grant is the org subscription's current period.
9. **Prices live in the catalog (Phase 18), never in code.** Org prices are `product_price` rows
   with `audience=ORG`, `interval=MONTH`. The margin guard (18.4) refuses to publish an org price
   below **80 %** worst-case margin (subscriptions) / **20 %** (services); the org/individual +25 %
   relationship is a guard *warning*, not a rule (volume discounts later are catalog rows).
10. **Billing is off when the Stripe key is blank** (existing `StripeGateway.isEnabled()`): in
    dev/CI an org can be created and marked `ACTIVE` by a `dossier.orgs.dev-activate=true` flag so
    the rest of the flow is testable without secrets. Prod never sets it.

## 2. Setup fee flow

```
OWNER taps "Pay setup fee"  ──► POST /api/orgs/{id}/billing/setup-fee {method: CARD|INVOICE, taxId?, legalName?}
   │  CARD:  gateway.createCustomer(org) if null → createOneTimeCheckout(customer, price(org-setup), successUrl, cancelUrl,
   │         client_reference_id = "org:{id}", metadata {kiwiply_scope: org, org_id}) → redirect
   │  INVOICE: createInvoice(customer, [price(org-setup)], send_invoice, days_until_due 15) → hosted_invoice_url shown + emailed
   ▼
Stripe ──► webhook checkout.session.completed (mode=payment, payment_status=paid)  or  invoice.paid (metadata.kind=org_setup)
   ▼
BillingWebhookService.applyOrg(...): organization.setup_fee_paid_at = event.created; status PENDING_SETUP_FEE → ACTIVE;
   create the (empty) org subscription (no items yet; Stripe allows items to be added later) ;
   org_audit_event BILLING_SETUP_PAID; email OWNER "Your workspace is live" + Notification kind ORG_ACTIVE.
```
Abandoned Checkout: nothing happens; the org stays `PENDING_SETUP_FEE`, the button stays. After
14 days with no payment, a nightly job moves it back to `DRAFT` and voids the invoice if any.

## 3. Data model (additive, `20261011020000_org_billing.xml`)

### 3.1 `org_assignment` (the business record)
| column | notes |
|---|---|
| id | |
| org_id, member_id | FK; member must be `ACTIVE` or `INVITED` (pre-assigning an item to an invitee is allowed; the grant is created on accept) |
| product_id, product_price_id | FK catalog (18.1); price `audience=ORG` |
| status | `PENDING_ACCEPT` (member still INVITED) `ACTIVE` `ENDING` (ends_at set) `ENDED` |
| starts_at, ends_at | `ends_at` NULL while ongoing |
| end_reason | `UNASSIGNED` `MEMBER_LEFT` `MEMBER_REMOVED` `ORG_SUSPENDED` `ORG_CLOSED` `ERASED` `SUPERSEDED` |
| stripe_subscription_item_id | the item whose quantity this assignment counts in |
| entitlement_grant_id | FK (18.1); NULL while `PENDING_ACCEPT` |
| created_by_member_id, created_at, updated_at | |

Unique: one `ACTIVE/ENDING` assignment per `(member_id, product_id)` — generated column
`live_key = IF(status IN ('PENDING_ACCEPT','ACTIVE','ENDING'), CONCAT(member_id,':',product_id), NULL)` UNIQUE.
Upgrading Pro → Autopilot = end Pro (`SUPERSEDED`, at period end) + create Autopilot (prorated now);
the person has both grants until period end and the higher limit wins.

### 3.2 `org_subscription` (mirror)
`org_id PK/FK, stripe_subscription_id UNIQUE, status (Stripe verbatim), collection_method,
current_period_start, current_period_end, days_until_due, latest_invoice_id, last_event_at, updated_at`.

### 3.3 `org_subscription_item` (mirror)
`id, org_id, stripe_item_id UNIQUE, product_price_id, quantity, last_event_at`. Reconciled from
`customer.subscription.updated` (`items.data[]`). A nightly `OrgSeatReconciler` compares
`count(active assignments per price)` with `quantity` and alerts the platform admin queue on drift
(it never silently fixes money).

### 3.4 `org_invoice` (mirror)
`id, org_id, stripe_invoice_id UNIQUE, number, kind (SETUP|SUBSCRIPTION|SERVICE|MIXED), status
(draft|open|paid|void|uncollectible), currency, amount_due_cents, amount_paid_cents, period_start,
period_end, due_at, paid_at, hosted_invoice_url, invoice_pdf_url, last_event_at`. Written from
`invoice.created|finalized|paid|payment_failed|voided|marked_uncollectible`. The billing page lists
these; "Download" opens `invoice_pdf_url` (Stripe-hosted, no PDF storage on our side).

### 3.5 Extensions to existing tables
- `stripe_event` (exists): add `org_id BIGINT NULL` so the admin customer timeline (9.C1) can show
  org events.
- `entitlement_grant` (18.1): already has `org_id`; add index `(user_id, ends_at)`.

## 4. Assignment → Stripe → grant (sequence)

```
POST /api/orgs/{id}/members/{m}/assignments {productCode}
 1. require(assignments.manage); org must be ACTIVE or PAST_DUE; member ACTIVE/INVITED; no live assignment for product
 2. price = catalog.activePrice(product, ORG, MONTH)             (404 if none — not sold to orgs)
 3. tx: insert org_assignment(status = member ACTIVE ? ACTIVE : PENDING_ACCEPT)
 4. gateway.setItemQuantity(subscriptionId, price.stripe_price_id, +1, proration=create_prorations)
       - on StripeGatewayException: rollback step 3, 502 BILLING_UNAVAILABLE (nothing half-done)
 5. if ACTIVE: insert entitlement_grant(user, product, ORG_ASSIGNMENT, ref=assignment.id, org_id,
       starts_at=now, ends_at=NULL); assignment.entitlement_grant_id = grant.id
 6. org_audit_event ASSIGNMENT_CREATE; Notification to the member (kind ORG_ITEM_GRANTED, "Acme gave you Autopilot")
 7. the member's next GET /api/profile/version returns the new features[] (18.3) → extension picks it up
```
Step 4 before 5 on purpose: a grant must never exist that Stripe is not billing. The reverse
(billed but not granted) is caught by `OrgSeatReconciler` and is a support ticket, not a leak.

Unassign: `DELETE .../assignments/{a}` → `ends_at = org_subscription.current_period_end`,
status `ENDING`, grant `ends_at` the same, Stripe quantity −1 with `proration_behavior=none`.
A nightly job flips `ENDING → ENDED` once `ends_at` passes (grants expire by their own `ends_at`,
no job needed for entitlement).

Member leaves / is removed / is erased: every live assignment ends as above with the matching
`end_reason`; erasure ends **now** (there is no account to enjoy the period).

Pre-assigned invitee accepts (`POST /api/join/{token}/accept`): `PENDING_ACCEPT → ACTIVE`, grant
created, `starts_at = now`. Stripe was already billing from the invite — the honest alternative
(bill only on accept) would make the admin's invoice unpredictable; the admin sees "3 seats waiting
on invites" on the team page and can unassign.

## 5. Webhook routing (extends `BillingWebhookService`)

`applyInTx(event)`: if `event.customerMetadata().kiwiply_scope == "org"` (or the customer id is in
`organization.stripe_customer_id`) → `OrgBillingWebhookHandler.apply(event)`, else the existing
per-user path. The idempotency (`stripe_event` PK), ordering (`last_event_at` per mirror row) and
record-then-apply transaction rules are reused verbatim; the handler only adds:

| event | effect |
|---|---|
| `checkout.session.completed` mode=payment, `client_reference_id=org:{id}` | setup paid → ACTIVE (idempotent: `setup_fee_paid_at` set once) |
| `invoice.created/finalized` | upsert `org_invoice` |
| `invoice.paid` | `org_invoice.paid`; if `kind=SETUP` → ACTIVE; if org was `PAST_DUE/SUSPENDED` → ACTIVE + re-open grants |
| `invoice.payment_failed` | org `PAST_DUE`; email billing contacts (template: "nothing switched off yet, due in N days"); `Notification` to OWNER/ADMIN/FINANCE |
| `customer.subscription.updated/created` | mirror `org_subscription` + items; status `unpaid|canceled` → SUSPENDED, grants `ends_at=now`, members notified ("Your organization's plan is paused — you keep your own plan or Free") |
| `customer.subscription.deleted` | SUSPENDED as above |
| `invoice.voided/marked_uncollectible` | mirror only; SUSPENDED already handled by the subscription status |

Stripe sends the `app` tag check (`taggedForAnotherApp`) exactly as today — the BeeCompete co-hosting
guard stays in force for org events.

## 6. Entitlement resolution (Phase 18.2, org specifics)

```
resolve(login):
  grants = entitlement_grant where user and (starts_at <= now) and (ends_at is null or ends_at > now)
  features = ∪ product_entitlement(feature) for grant.product
  limits[k] = max over grants (numeric), true wins for booleans
  aiBudget: per grant, period = grant.source == STRIPE_SUBSCRIPTION ? user subscription period
                                 : ORG_ASSIGNMENT ? org_subscription.current_period : calendar month
            the effective budget = max(cents) and its period is the period of the grant that supplied the max
  plan label for the UI = highest of {FREE < PRO < AUTOPILOT}; add "via {org name}" when the winning grant is an org grant
```
`isPro(login)` ≡ `has(login, "ai.server")` (18.2); `PRO_REQUIRED` stays; `PLAN_REQUIRED {feature}` added.
`GET /api/profile/version` → `{version, plan, features[], via?: {orgId, orgName}}`.

**Personal + org stacking notice:** when a user with a `STRIPE_SUBSCRIPTION` grant receives an
`ORG_ASSIGNMENT` grant for the same or a higher product, a one-time `Notification`
(`ORG_COVERS_YOUR_PLAN`) says "Acme now covers Pro for you. You can cancel your own subscription in
the billing portal — we never cancel it for you." Link → existing portal session.

## 7. Margin guard and cost model (what the catalog enforces for org prices)

Worst case per seat per month = `ai_budget_cents + stripe_fee`, where Stripe fee for invoiced
card payments = 2.9 % + $0.30 ÷ (lines on the invoice) + 0.4 % invoicing (capped $2 per invoice).
The guard computes per **line**, conservatively assuming a one-line invoice:

| org item | price | AI budget | Stripe worst | margin |
|---|---|---|---|---|
| Pro seat | $24.99 | $3.00 | $1.12 | 83.5 % ✓ |
| Autopilot seat | $49.99 | $6.00 | $1.85 | 84.3 % ✓ |
| AI Interview Practice | $9.99 | $1.50 | $0.69 | 78.1 % ✗ → guard **fails**; either raise to $10.99 (80.3 %) or compute Stripe per-invoice (the realistic case: 0.4 % + share of $0.30) → 82 % ✓. **Decision:** the guard uses per-invoice allocation for org seats (the org always has ≥1 invoice line), documented in the guard's tooltip; `$9.99` stands. |
| Marketer seat | $29.99 | $4.00 | $1.27 | 82.4 % ✓ |
| Ops add-on | $99 + $4/consultant | $0 | ~3.3 % | ~96 % ✓ |
| Setup fee | $499 | — | ~$14.80 | n/a (FEE kind: guard skips, shows the Stripe cost only) |

Services (`SERVICE` kind): margin = (price − payout − stripe − discount) / price ≥ 20 % — see
`services-marketplace.md` §7.

## 8. Failure modes

| failure | behaviour |
|---|---|
| Stripe down while assigning | 502, no assignment row, UI toast "Billing is unavailable, nothing was changed" |
| webhook late (seat assigned, `subscription.updated` arrives 10 min later) | grant already exists (we create it on our write); mirror item quantity catches up; reconciler quiet |
| duplicate webhook | `stripe_event` PK — existing behaviour |
| org pays setup via invoice but admin also starts card checkout | second payment: `invoice.paid` for an org already ACTIVE → refund via `gateway.refund(paymentIntent)` + audit `BILLING_DUP_SETUP_REFUNDED`; never two fees |
| quantity drift (reconciler) | admin-queue alert with both numbers; manual fix in Stripe dashboard; never auto-charge |
| member erased mid-period | assignment ends now; Stripe quantity −1 no proration (org paid the month; acceptable, documented in terms) |
| org `SUSPENDED` then pays | grants re-created with new ids (`starts_at=now`); analytics show the gap honestly |

## 9. Billing page (web, `/org/billing`, replaces the sample)

Mobile-first layout (390 px):
```
┌──────────────────────────────┐
│ ‹ Billing                    │
│ Acme Bootcamp · ACTIVE ●     │
│ ┌──────────────────────────┐ │
│ │ Next invoice  Nov 1      │ │
│ │ $1,274.49  · 42 items    │ │
│ │ [View breakdown ▾]       │ │
│ └──────────────────────────┘ │
│ Items this month             │
│  Pro seats       34 × 24.99  │
│  Autopilot        6 × 49.99  │
│  AI Interview     2 ×  9.99  │
│  Resume rewrite   1 × 199.00 │
│ Payment  💳 Visa ••4242  [Change] (portal)│
│ Tax ID   EU123…       [Edit] │
│ Invoices                     │
│  Oct 1  $1,199.52  Paid  ⤓   │
│  Sep 1  $1,099.56  Paid  ⤓   │
│ Billing contacts (3)  [+]    │
└──────────────────────────────┘
```
Data: `GET /api/orgs/{id}/billing` → `{status, subscription{periodEnd, collection}, items[{product,
qty, unitCents}], upcoming{amountCents, lines[]} (from gateway.upcomingInvoice), invoices[], paymentMethod{brand,last4} (from Stripe, never stored), taxIds[], contacts[]}`.
"Change card" → `gateway.createPortalSession(orgCustomer, returnUrl)` — Stripe's portal, configured
for invoice customers (update payment method, download invoices; cancel disabled — cancelling an org
is `/close` with a confirmation that lists who loses what).

## 10. Tests

- `OrgBillingWebhookHandlerTest`: setup paid → ACTIVE once; stale event ignored; `unpaid` → grants
  end; `invoice.paid` after SUSPENDED re-opens grants; another app's event ignored.
- `OrgAssignmentServiceTest`: Stripe failure → no row; unassign → `ends_at = period end`, quantity
  −1 with `none`; upgrade supersedes; erased member ends now; invitee pre-assign → grant on accept.
- `EntitlementServiceTest` (extend existing): personal Pro + org Autopilot → Autopilot limits, Pro
  budget period chosen from the org grant; org grant ended → falls back to personal.
- `MarginGuardTest`: table in §7 (per-invoice allocation); a $9.98 AI Interview price fails.
- Integration: Stripe test clock scenario documented in `api/README` (create org → setup → assign →
  advance clock → invoice.paid) run manually before Launch of Phase 21.
