# Consultant workspace: Settings (`/w/consultant/settings`)

Board: `design/enterprise-consultant/settings.webp`. Root attribute `data-consultant-settings`, `data-status=ready`.

## What is real, what is honest "not available"

| Block | State |
| --- | --- |
| Tiles: Profile Status (`consultant_profile.profile_completeness`), Privacy Level (derived from `cws_setting`), Connected Tools ("0 of 4 available", from the stored rows: none), Notifications Setup (link only) | real |
| Account Information (name, email, location) | real, read-only from the profile; Edit links to `/w/consultant/profile`. **Phone is not shown or stored: "Not collected".** |
| Career Preferences | real, read-only from `cws_profile_pref`, `consultant_profile`, `cws_work_preference`; Edit links to the Profile page |
| Notification Preferences | a link card to `/w/consultant/notifications`; no toggles duplicated, no summary |
| Privacy & Sharing | **real writes** (`PUT /settings/privacy`), optimistic with an Undo toast |
| Security (Password, Two-Factor, Login Notifications) | **no self-service API exists for tenant members**, so nothing is built or faked: each row says "Managed on your Kiwiply account" with no state, and a link goes to the account settings page `/settings` (`web/src/app/(app)/settings`). No "last changed", no "Enabled". Note: `/settings` is on the Kiwiply app, tenant sessions are host-only, so the user may be asked to sign in there. |
| Connected Tools (LinkedIn, Google Drive, GitHub, Dropbox) | catalog rows with "Not available yet" and disabled Connect buttons. There is no OAuth or external call. Connections arrive with the integrations module. |
| Documents & Permissions | My Resumes count is real (link to Resumes); Supporting Documents is "Not collected" (identity and tax documents are never collected) |
| Appearance, Language & Timezone | **real writes** (`PUT /settings/appearance`), optimistic with Undo. The theme is stored only: the shell has no theme mechanism to call and was not edited. Language values are labels only (no i18n implied). |
| Rail: bee card, Quick Actions, Recent Account Activity | real (activity = `cws_setting_event` plus derived events: profile updated from `cws_profile_detail` / `cws_certification` / `cws_profile_pref`, availability changed from `cws_availability_history`) |

Never displayed, stored or returned: a password, token, API key or phone number.

## Endpoints (`/api/orgs/{orgId}/me-workspace/settings`)

All gated by `ConsultantHomeService.requireSelf` (Consultant role, own `consultant_profile`, else the generic 404). No consultant id from the client.

- `GET` the page. A consultant with no stored row gets the defaults and `settings.isDefault = true`; reading never creates a row.
- `PUT /privacy` `{profileVisibility?: ORG_ONLY|APPROVED_EMPLOYERS|PRIVATE, shareProfileWithEmployers?, showContactInformation?, allowAnalytics?}`.
- `PUT /appearance` `{theme?: LIGHT|DARK|SYSTEM, language?: en-US|en-GB|es-ES|fr-FR|de-DE, timezone?: IANA name}`; the timezone is checked against `ZoneId.getAvailableZoneIds()`.

Writes require the permission `self.share_scope.set` (OWN, held by the Consultant role) and answer with the fresh page. Fields are optional (null keeps the stored value). An unknown value is 422 `ORG_INVALID` and nothing is applied. A change appends one `cws_setting_event`; resending the stored values changes nothing and adds no event. Defaults: ORG_ONLY, all three switches off, SYSTEM, en-US, UTC.

## Tables (`20261103190000_ent_cws_settings.xml`)

- `cws_setting`: one row per consultant (`uk_cws_setting_consultant`), composite FK `(org_id, consultant_id)` to `consultant_profile`.
- `cws_setting_event`: `kind` (PRIVACY | APPEARANCE), `label`, `detail`, `occurred_at`; index `(org_id, consultant_id, occurred_at)`.

Not registered in `master.xml` (add after the placement changelog).

## Code

- API: `ConsultantSettingsResource`, `ConsultantSettingsService`, `ConsultantSettingsDTO`, `CwsSetting`, `CwsSettingEvent`, `CwsSettingRepository`, `CwsSettingEventRepository`, seeder `ConsultantWsSettingsDemoSeeder` (public idempotent `@Transactional int seed()`; Anika/Ben/Sam only; guarded on `cws_setting` and `cws_setting_event`).
- Web: `lib/ent/consultant-ws/settings.ts` (+ test), `components/ent/consultant-ws/SettingsPage.tsx` (+ test), route `app/(tenant)/%5Ft/w/consultant/settings/page.tsx`, BFF `app/api/orgs/[orgId]/me-workspace/settings/**`.
- Tests: `ConsultantSettingsResourceIT` (9 tests: defaults, own data, writes, event, 422 validation, cross-consultant isolation, other org / non-consultant / ghost 404, flags-off 404, seeder idempotent).

## OrgIsolationIT route rows

- `GET /api/orgs/{orgId}/me-workspace/settings`
- `PUT /api/orgs/{orgId}/me-workspace/settings/privacy` body `{"profileVisibility":"PRIVATE"}`
- `PUT /api/orgs/{orgId}/me-workspace/settings/appearance` body `{"theme":"DARK"}`

## Known gaps

- Password, two-factor and sign-in alert management and status need a self-service account API for tenant members; until it exists they only link to the account page.
- Connected tools need the integrations module.
- The stored theme is not applied by the shell yet; Home or the shell could read `settings.theme` later.
- Notification Preferences is a link only, and the Notifications Setup tile shows no Active / Not set up state (that would depend on the Notifications page's table).
- Recent Account Activity has no "View All" link (the Activity Timeline page is another page).
- The seeded settings row and its one event are demo data.
