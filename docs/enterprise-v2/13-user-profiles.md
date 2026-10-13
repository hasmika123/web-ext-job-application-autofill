# 13 — User profiles: the basic profile (avatar menu), kept apart from the consultant career profile and the organization profile

> Status: design (Session B), 2026-10-12. Implements ADR-006 and requirements §7. Build-ready for
> X2.7. Notion-style autosave (no Save buttons), `@kiwiply/ui` only.

## 1. Three profiles, three owners

| Profile | Owner | Where it lives | Where it is edited | Who else sees it |
|---|---|---|---|---|
| **Basic user profile** (this doc) | the person | `jhi_user` (+ `phone`, `title`), `NotificationPreference.tz`, `langKey`, avatar object | avatar menu → `/me` on every host (tenant tree `/_t/me`, platform `/me` — a new path; the existing `(app)/settings` keeps its personal-product sections and gains a link) | name, photo, title and work email are shown to org members with `member.view_summary`; phone only with `member.view_full` (consent FULL) |
| Consultant career profile | the person | `bio`, `profile_item`, resumes (PERSON) + the membership overlay `consultant_profile` (TALENT, D's X7.2) | `/profiles` on kiwiply.com (personal) and `/w/consultant/profile` on the tenant host (same editor, org overlay tab) | the org through `data_share` scope |
| Organization profile | the org | `organization`, `org_branding`, `org_hostname`, `org_setting` | `/w/admin/settings` (14 §4) | members (name, logo); admins (everything) |

**Never the landing page.** Nothing redirects to `/me`; it opens only from the avatar menu
(`AccountMenu` gains "My profile" as the first entry on every surface) or from a direct link.

## 2. The basic profile page (`/me`, X2.7)

### 2.1 Sections (one page, anchored sections; a left rail of anchors ≥ `md`, stacked on phone)
```
390                                   1440
┌──────────────────────────────┐      ┌──────────┬──────────────────────────────────────────────┐
│ ← Back      My profile       │      │ Profile  │  ┌ Photo ┐  Priya Sharma           ✓ saved  │
│ ┌(photo)┐ Priya Sharma       │      │ Contact  │  │  PS   │  Marketing Specialist · Acme      │
│ │  PS   │ [Change photo]     │      │ Prefs    │  └───────┘  [Change photo] [Remove]          │
│ └───────┘                    │      │ Security │                                              │
│ First name  [Priya        ]✓ │      │ Member-  │  Identity                                    │
│ Last name   [Sharma       ]  │      │  ships   │  First name [Priya     ]✓  Last name [Sharma] │
│ Job title   [Marketing …  ]  │      │          │  Job title  [Marketing Specialist     ]       │
│ Work email  priya@acme.com   │      │          │  Contact                                      │
│   (managed by your org) ⓘ   │      │          │  Work email  priya@acme.com  ⓘ managed       │
│ Phone       [+1 …         ]  │      │          │  Phone       [+1 555 …   ] optional            │
│ Timezone    [America/New_York]│     │          │  Preferences                                  │
│ Language    [English      ]  │      │          │  Timezone [America/New_York ▾] Language [EN ▾]│
│ Notifications  →             │      │          │  Notifications  (matrix, quiet hours, digest) │
│ Security       →             │      │          │  Security                                     │
│ Memberships    →             │      │          │   Password  [Change…]  Sign-in code  Required │
│                              │      │          │   Sessions  Acme workspace · this device ✓    │
│ status chip: "All changes    │      │          │             Personal · Chrome · 2 d ago [Revoke]│
│  saved"                      │      │          │   [Sign out everywhere]                       │
└──────────────────────────────┘      │          │  Memberships (read-only)                       │
                                      │          │   Acme Talent · Marketing Specialist, Marketing Manager · joined Oct 3 │
                                      │          │   Personal workspace · kiwiply.com             │
                                      └──────────┴──────────────────────────────────────────────┘
```

| Section | Fields | Source / endpoint | Notes |
|---|---|---|---|
| Identity | photo, first name, last name, job title | `GET/PATCH /api/account/profile` (new, user-scoped, accepts `tid` tokens) → `{firstName, lastName, title, phone, email, imageUrl, langKey, tz}`; photo `POST /api/account/photo` (multipart, PNG/JPG/WebP ≤ 2 MB, server re-encodes to 512² and 96² under `user/{uid}/avatar-{hash}.jpg`; `DELETE` removes) | `title` is display-only (05 §1); on a tenant host it is also mirrored into `org_member.title` when the member has no org-set title (org-set title wins and the field says "set by your organization") |
| Contact | work email (read-only on tenant hosts when the org manages email, i.e. always for invited members — the email is the invite binding), phone (optional, E.164 validated, PII scanner is **not** needed: phone is allowed) | same endpoint; email change stays the platform flow (`/settings` on kiwiply.com → verification), never on a tenant host | the ⓘ explains "Your organization invited this address; to change it, ask an administrator" |
| Preferences | timezone (IANA select with search), language (`langKey`: en now; others when the web ships them) | same endpoint; tz also written to `NotificationPreference.tz` (one source: the preference row; the profile endpoint reads/writes it there) | tz drives every date the shell shows |
| Notifications | the existing matrix (`/api/notification-preferences`), quiet hours, digest | existing `NotificationPreferences` component reused as-is | org-originated kinds (X2.10) appear as a new group "Organization" |
| Security | change password (existing `/api/account/change-password`), sign-in code status (org-required or admin), sessions list + revoke, sign out everywhere, (Phase 12: TOTP, passkeys) | `GET /api/account/sessions`, `POST /api/account/sessions/{fam}/revoke`, `POST /api/account/sessions/revoke-all` (12 §8) | password change on a tenant host is allowed (it is the person's account) and audited user-side only |
| Memberships | every org the person belongs to: display name, roles (names), primary role, joined date, consent scope chip, "Leave" (not for OWNER), plus "Personal workspace · kiwiply.com" | `GET /api/me/orgs` (branch B, extended with `roles[]`), `PUT /api/me/orgs/{id}/share`, `POST /api/me/orgs/{id}/leave` | read-only roles; the consent scope is editable here (the consent screen, reused) because it is the person's choice, not the org's |
| Danger (platform host only) | export my data, delete my account (existing `/account/export`, `AccountDeletionResource`) | existing | hidden on tenant hosts (shown with a link "Manage your account on kiwiply.com") |

### 2.2 Autosave behaviour (memory `ux-genz-notion-style`)
- Every field saves on blur / 800 ms after the last change through a page-level `useSave()`
  (the `useAdminSaveEngine` promoted to `web/src/lib/ent/use-save.ts` with the `/api` BFF fetcher):
  optimistic value, `aria-busy`, inline ✓ (`SavedTick`), one quiet `SaveStatusChip` in the header
  ("All changes saved · just now"; amber "Offline — will retry"; red only on a real failure with the
  server message under the field).
- Undo toast (6 s) for name/title/phone/timezone changes; photo removal has an undo that restores
  the previous key (kept 24 h in `user_avatar_history`? — no new table: the previous object key
  is returned in the response and the undo re-points to it; purge job deletes unreferenced avatars
  after 7 days).
- No Save button anywhere on the page. Destructive actions (revoke session, leave org) use the
  undo-toast pattern where reversible (session revoke is not → `ConfirmTypedSheet` is overkill;
  a plain `Dialog` with the session's name).

### 2.3 Avatar menu (every shell: `AppShell`, `AdminShell`, `EnterpriseShell`)
Entries, in order: **My profile** (`/me`) · Notifications (`/me#notifications`) · Security
(`/me#security`) · separator · *tenant hosts:* "Switch workspace ▸" (only with > 1 workspace, 16 §4)
· *kiwiply.com:* "Kiwiply for Organizations" (existing, flag) · separator · Sign out. The chip
reads "Hi, {First}" with the avatar (`InitialsAvatar` when no photo). On tenant hosts the menu
header shows "{Org display name} · {primary role name}".

## 3. Data changes (additive, X2.7)
- `jhi_user.phone VARCHAR(32) NULL`, `jhi_user.title VARCHAR(80) NULL`, `jhi_user.avatar_key VARCHAR(255) NULL`
  (`image_url` stays for Google-provided pictures; `avatar_key` wins when set).
- `refresh_token.org_id BIGINT NULL`, `user_agent VARCHAR(80) NULL`, `last_used_at DATETIME(6) NULL`.
- No new tables.

## 4. Privacy and PII
- Allowed: name, work email, phone, title, timezone, language, photo. **Not collected**: date of
  birth, home address, government IDs, bank data — the page has no such fields and the scanner
  (`SensitivePatterns`) runs on the free-text fields (name, title) as everywhere else.
- Photos are served through signed, short-lived URLs for org members (`member.view_summary`
  needed) and through the person's own session for themselves; never public.
- The org never edits a person's basic profile. The only org-written field that *appears* here is
  the org-set job title, labelled as such.

## 5. Tests
`AccountProfileResourceIT` (PATCH validation, tz propagation, tenant-host access with `tid`
token), `AvatarUploadIT` (types, size, re-encode, undo key), `SessionsResourceIT` (list/revoke,
`org_id` labelling), web `me.test.tsx` (autosave engine, chip states, read-only email on tenant),
Playwright `profile.spec.ts` (avatar menu → `/me` on both hosts at 390/1440; no redirect to `/me`
after login).
