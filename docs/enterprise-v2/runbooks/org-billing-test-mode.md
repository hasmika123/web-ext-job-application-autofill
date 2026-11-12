# Runbook: organization billing end to end in Stripe test mode

> 2026-11-12. ORG-BILLING-BUILD.md step 3b. Run this **only with a Stripe test-mode key** (`sk_test_…`) on a dev or staging stack, never in
> production. It walks one organization through a whole billing month: billing starts, a month closes, Stripe sends the invoice, it is paid, and an
> unpaid one goes past due, pauses and comes back.

**Why no Stripe test clocks?** Kiwiply decides when a month closes from its **own** database dates (`org_billing_account.current_period_*`), and it builds
the invoice itself (user decision 2026-11-12). A Stripe test clock only moves Stripe's side, so this runbook moves Kiwiply's dates with SQL instead, and
lets Stripe's test mode do the sending and the paying. Record the Stripe ids you see in the last section, so the next person can compare.

## 0. Set up
1. **Stripe key.** The API runs with a **test** key and webhook secret (`STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`). Never commit
   either: they live in the environment or the password manager.
2. **Webhooks.** Forward them to the local API with the Stripe CLI: `stripe listen --forward-to localhost:8080/api/billing/webhook`, and use the
   `whsec_…` it prints.
3. **Settings** (Kiwiply admin → Settings):
   - `enterprise.billing.stripe_enabled` = on;
   - `flag.enterprise.billing` on for the test organization.
4. **Prices** (Kiwiply admin → Catalog):
   - publish ORG MONTH prices for `ORG_BASE_LICENSE` and one add-on;
   - optionally an ORG ONE_TIME price for `ORG_SETUP_FEE`;
   - or give the organization a contract with prices.
5. **A faster period job** for the run: start the API with `DOSSIER_ENT_BILLINGPERIODCRON="0 * * * * *"`, so it runs every minute. The default is hourly at :40.

## 1. Start billing
1. Admin → Organizations → the test organization → **Billing** → billing email (a mailbox you can read), and leave the setup fee owed → **Start billing**.
2. Expect:
   - the panel shows "Billed by Stripe";
   - a new **customer** in the Stripe dashboard with metadata `kiwiply_scope=org`, `org_id`;
   - when the fee is priced, a **pending invoice item** "Organization setup fee".
3. Give two consultants a licence with an add-on on the Licenses page (Review → Confirm).

## 2. Close a month
1. Move the period back so it has ended (replace `:org`):
   ```sql
   update org_billing_account
      set current_period_start = date_sub(date_format(curdate(), '%Y-%m-01'), interval 1 month),
          current_period_end   = date_sub(date_format(curdate(), '%Y-%m-01'), interval 1 day)
    where org_id = :org;
   update consultant_license set starts_at = date_sub(starts_at, interval 40 day) where org_id = :org;
   update license_feature   set starts_at = date_sub(starts_at, interval 40 day) where org_id = :org;
   ```
2. Wait for the job (≤ 1 minute).
3. Expect:
   - Stripe has one **invoice**, `send_invoice`, due in 15 days, with this month's licences, last month prorated (the first, never-billed month in full) and the setup fee;
   - Billing & Invoices shows it with **Pay**;
   - `org_invoice` has `source = STRIPE` and the `stripe_invoice_id`.
4. Wait for the next run: **no second invoice** for the same month.

## 3. Pay it
1. Open **Pay** (Stripe's hosted page) and pay with the test card `4242 4242 4242 4242`.
2. Expect:
   - `invoice.paid` arrives (watch `stripe listen`);
   - the invoice is **Paid**;
   - the account is paid through the month's end;
   - the setup fee is **Paid**.

## 4. Don't pay the next one
1. Close another month (repeat step 2 with one month less), and leave the new invoice unpaid.
2. Make it overdue on Kiwiply's side: `update org_invoice set due_date = date_sub(curdate(), interval 1 day) where stripe_invoice_id = '<in_…>';`
3. Expect within a minute:
   - the account is **PAST_DUE**;
   - `features_paused_from` is the day after the paid month;
   - the overview banner shows the warning;
   - one **reminder e-mail** goes to the billing email and the owners, and no second one within 7 days.
4. Reach the pause: `update org_billing_account set features_paused_from = curdate() where org_id = :org;`
5. Expect:
   - a licensed consultant's AI help, inbox and Prepare are refused;
   - their workspace still works;
   - the banner says "paused since…".
6. Pay the invoice on Stripe's page.
7. Expect: ACTIVE, the pause lifted at once, and the add-ons work again.

## 5. Suspend and resume by hand
1. Admin → the organization → **Suspension** → Suspend (reason).
2. Expect:
   - everyone can still sign in and read;
   - every change is refused;
   - an `ADMIN_ORG_SUSPEND` row in its audit.
3. **Resume** (reason).
4. Expect: it works normally again.

## 6. Reconciler
1. In the Stripe dashboard, mark an **open** invoice paid out of band, so Kiwiply never hears of it (stop `stripe listen` first).
2. Run the reconciler: wait for 03:20 UTC, or start the API with `DOSSIER_ENT_BILLINGRECONCILECRON` set to every minute.
3. Expect: Admin → Billing operations shows one **ORG / INVOICE_STATUS** drift row. Nothing in Kiwiply changed by itself.
4. Replay the webhook (`stripe events resend <evt_…>`), then **Resolve** the row with a note.

## Ids seen (fill in on each run)
| Date | Customer | Invoice (paid) | Invoice (unpaid) | Webhook events | Notes |
|---|---|---|---|---|---|
| | | | | | |
