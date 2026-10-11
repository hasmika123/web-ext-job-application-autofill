# Org onboarding and invites — a workspace in under 2 minutes on a phone (stories O2.*)

> Status: design, 2026-10-11. Buyers: bootcamp ops leads, university career-centre staff,
> staffing/consultancy admins — many of them Gen Z themselves, on a phone, between two meetings.
> Depends on `tenant-model.md` (org, org_member, org_join_code, org_domain, org_invite_batch),
> `billing.md` §2 (setup fee), `consent-data-sharing.md` §5.1 (join screen).

## 1. Decisions

1. **Self-serve first, sales second.** `/organizations` gets a primary CTA "Start your workspace"
   next to "Book a demo". A DRAFT org costs nothing and lets the buyer see the real console with an
   empty state before paying $499. "Contact sales" (`SalesInquiryService`, exists) stays for
   consultancy add-ons and bank-transfer orgs.
2. **Three screens to a live workspace:** name+type → who you are → pay. Everything else
   (logo, domains, groups, defaults) is a checklist *after* activation, never a gate.
3. **Invites are links first, emails second.** A join code/QR works in a classroom or on a Slack
   message where emails are not at hand; CSV/paste email invites are for the admin who has a roster.
   Both end at the same consent screen.
4. **The person is never auto-enrolled.** Domain auto-join *offers* "Join {org}" after a verified
   email; accepting is still a tap through the consent screen.
5. **Activation is visible.** The dashboard's first screen for a new org is a checklist with live
   counts ("38 of 60 joined"), not sample charts. Sample data disappears the day O2 ships.
6. **Admins are people with Kiwiply accounts.** There is no separate "org login": the OWNER signs
   up/in like anyone (Google / passkey / email), and the org is attached to that account. Up to 3
   admins can be invited in DRAFT so a team can evaluate together.

## 2. Create-org flow (web, `/org/new`, 390 px)

```
 Screen 1 · "Let's set up your workspace"          Screen 2 · "About you"                    Screen 3 · "One-time setup · $499"
┌──────────────────────────────┐   ┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ‹                        1/3 │   │ ‹                        2/3 │   │ ‹                        3/3 │
│ What's your organization?    │   │ Your role                    │   │ Acme Bootcamp                │
│ ┌──────────────────────────┐ │   │ (Career services) (Ops)      │   │ Workspace · admin accounts · │
│ │ Acme Bootcamp            │ │   │ (Recruiter) (Founder) (Other)│   │ CSV invite · onboarding call │
│ └──────────────────────────┘ │   │ How many people will you     │   │ ┌──────────────────────────┐ │
│ kiwiply.com/join/acme-bootcamp│  │ support this year?           │   │ │ Then per person / month  │ │
│ Type                         │   │ (1–50)(51–200)(201–500)(500+)│   │ │ Pro $24.99 · Autopilot   │ │
│ (Bootcamp)(University)       │   │ Country ▾  United States     │   │ │ $49.99 · AI interview    │ │
│ (Company)(Outplacement)      │   │                              │   │ │ $9.99 — assign later     │ │
│ (Staffing/consultancy)       │   │ ☐ Everyone we invite is 16+  │   │ └──────────────────────────┘ │
│                              │   │                              │   │ [  Pay with card ▸ ]        │
│ [ Continue ▸ ]               │   │ [ Continue ▸ ]               │   │  Apple Pay · Google Pay      │
│                              │   │                              │   │ [ Send me an invoice instead]│
│                              │   │                              │   │ Skip for now → explore DRAFT │
└──────────────────────────────┘   └──────────────────────────────┘   └──────────────────────────────┘
```
- Screen 1 writes nothing until Continue; slug auto-derives and is editable inline; type chips are
  44 px; "Staffing/consultancy" reveals one extra chip row later (marketer seats) — not now.
- Screen 2: role/size feed `organization.size_band` and the sales CRM; the 16+ attestation is
  required for Bootcamp/University (`consent-data-sharing.md` §1.6).
- Screen 3: `POST /api/orgs` (DRAFT) then `POST .../billing/setup-fee` → Stripe Checkout (Apple/Google
  Pay make this ~20 s). "Skip for now" lands in the DRAFT console with the pay banner pinned.
- Return URL `/org/welcome?session_id=…` **does not activate** anything (webhook does); it polls
  `GET /api/orgs/{id}` every 2 s for ≤30 s showing "Confirming your payment…" with the mascot, then
  the confetti + checklist. If the webhook is slower, the page says "We'll email you the moment it's
  confirmed" — honest, never fake-green.

Target: name → paid in **< 2 minutes** with Apple Pay. Measured by the analytics event pair
`org_create_started` → `org_activated` (p50 goal 110 s).

## 3. Invite flows

### 3.1 Join link / code / QR (cohort kickoff)
`POST /api/orgs/{id}/join-codes {groupId?, maxUses?, expiresInDays?}` → `{code, url, qrSvg}`.
URL `kiwiply.com/join/acme-bootcamp/KIWI7F3A`. Admin UI: a full-screen QR view (projector-friendly),
"Copy link", "Share…" (Web Share API on phones → Slack/WhatsApp/iMessage), use counter live.
Redemption: `GET /join/{slug}/{code}` (public preview: org name, logo, "invited as Member", what
they'll see) → sign in / sign up (Google, passkey, email) → consent screen (§5.1 of consent doc) →
`POST /api/join/code/{code}` → done screen (§4). Codes are MEMBER-only; staff/admins are invited by
email so a code leak cannot grant admin.

### 3.2 Emails / CSV
`POST .../members/invite {emails[], role, groupId?, supportOwnerMemberId?}` (≤200 per call) or
`POST .../members/import` (CSV ≤2,000 rows; columns `email` required, `name`, `group`,
`support_owner_email`, `plan` (Pro|Autopilot|AI_INTERVIEW — pre-assigns, `billing.md` §4)).
Response lists invalid rows with reasons; nothing is inserted if >20 % of rows are invalid (likely a
wrong file) unless `force=true`. Each invite = one email with: who invited, what the org pays for,
"You keep your account", one button, expiry (14 days), and an unsubscribe-style "Not you?" line.
Re-send rotates the token; 3 re-sends max per invite per week.

### 3.3 Domain auto-join (universities)
`POST .../domains {domain}` → TXT record instructions (`_kiwiply-verify.{domain}` = token) or
"email postmaster@" option; `POST .../domains/{id}/verify`. When verified and `auto_join=true`, any
user whose **activated** email ends with `@{domain}` sees a card on `/dashboard`: "Your school uses
Kiwiply — join Acme University Career Services? (they'll see a progress summary unless you change it)"
→ consent screen → member. Admins can't see non-joined students; no roster scraping.

### 3.4 Admin invites in DRAFT
Up to 3 `ADMIN` invites allowed before activation (`tenant-model.md` §3); members blocked with
409 `SEAT_STATE` and a UI banner "Pay the setup fee to invite members".

## 4. Member "done" screen and activation nudges
```
┌──────────────────────────────┐
│        🎉 You're in!          │
│  Acme Bootcamp covers Pro.    │
│  Next:                        │
│  [ Add the browser extension ]│
│  [ Upload or build a resume ] │
│  Later → Go to dashboard      │
└──────────────────────────────┘
```
Activation (consent doc §3) = accepted + (resume or application or extension connected). Members
not activated after 3 days get **one** in-app nudge + one email; after that the *org admin* sees
"12 haven't started" with a "Copy reminder message" (text the admin sends themselves) — Kiwiply does
not spam members on an org's behalf.

## 5. Admin activation checklist (dashboard empty state, replaces sample stats)
```
Your workspace · 4 of 7
✓ Setup fee paid (Oct 11)
✓ Admins invited (2 of 3 joined)
✓ Logo + name
◻ Invite people            [Link/QR] [CSV] [Emails]   38 of 60 joined
◻ Assign plans             12 people without a plan   [Assign]
◻ Pick support owners      [Assign owners]
◻ Verify your domain       (optional, universities)
```
Each row deep-links; the checklist hides when complete, replaced by the live dashboard
(`analytics.md` §6). The checklist is computed server-side (`GET /api/orgs/{id}/onboarding`) so the
mobile app (later) can reuse it.

## 6. Notifications and etiquette
- Admin: `Notification` kinds `ORG_ACTIVE`, `INVITE_ACCEPTED` (batched: "5 people joined today"),
  `INVITES_EXPIRING` (3 days before), `SHARE_REVOKED`, `BILLING_*`. Daily digest email at
  `settings.digestDay/time` in `organization.timezone`; quiet hours honoured (default 21:00–08:00).
- Member: `ORG_ITEM_GRANTED`, `ORG_COVERS_YOUR_PLAN`, `ORG_PAUSED`. Never more than one org email a
  day to a member.

## 7. Analytics events (product analytics, no PII)
`org_create_started`, `org_create_step {step}`, `org_setup_fee_started {method}`, `org_activated
{seconds_since_start}`, `invite_sent {source, count}`, `join_preview_viewed {source}`,
`join_accepted {source, scope}`, `join_abandoned {step}`, `member_activated {days_since_join}`,
`checklist_completed`. Emitted server-side into the existing admin analytics tables
(`AdminAnalyticsResource` consumers), org id hashed in client events.

## 8. Accessibility & performance
- Every step is one form, one primary button, visible focus, labels not placeholders; chips are
  real radio groups; the QR view has the code as text for screen readers; invite CSV errors are
  listed with row numbers in a live region.
- `/org/new` and `/join/*` ship as static-ish server components with skeletons; the join preview
  is cacheable for 60 s (public data only).

## 9. Failure modes
| failure | behaviour |
|---|---|
| slug taken | inline suggestion `acme-bootcamp-2` |
| Checkout abandoned | DRAFT banner persists; nightly reminder once; back to DRAFT after 14 days |
| invitee already a member of another org | fine — multi-org membership; the done screen shows the switcher |
| invitee already has personal Pro | consent screen adds the "Acme will cover Pro; cancel yours in the portal if you like" line (`billing.md` §6) |
| join code leaked publicly | admin revokes; redemptions are MEMBER seats only; invite cap + complaint kill-switch (`consent-data-sharing.md` §8) |
| email bounce | invite marked `BOUNCED` (status stays INVITED, flag on `org_invite_batch` row counts); admin sees it in the Team list |

## 10. Tests
`OrgCreateFlowIT` (DRAFT → setup fee → ACTIVE via fake webhook), `JoinCodeTest` (max uses, expiry,
revoke, MEMBER-only), `CsvImportTest` (invalid rows, 20 % rule, pre-assign), `DomainVerifyTest`
(TXT stub, auto-join card appears only for activated matching emails), `InviteEmailTest` (copy
contains org, payer line, expiry, "Not you?"), web e2e at 390 px: 3 screens, Apple Pay button
presence when available, welcome polling states.
