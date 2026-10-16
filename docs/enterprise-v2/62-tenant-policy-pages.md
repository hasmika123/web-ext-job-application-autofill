# 62 - Tenant policy pages (privacy, terms, acceptable use, support)

> Status: built 2026-10-16 (`ent-tenant-policies`). Requirement (user): links from an enterprise account must never land on Kiwiply pages, because the enterprise portal shows the organization's branding. Each organization has its own policy pages with its own content and branding; a Kiwiply admin reviews the content before it goes live.
> Builds on doc 11 (branding draft/publish), doc 19 (separate accounts, R4: the host decides the world), doc 10 (host routing).

## 1. Defaults (the user can change all of these later)

| # | Decision |
|---|---|
| 1 | **Kinds** are data: setting `enterprise.policies.kinds` (JSON list, default `PRIVACY, TERMS, ACCEPTABLE_USE, SUPPORT_CONTACT`). Adding COOKIES or SECURITY later is a setting change, not code. Unknown keys get a derived title and the public path `/policies/{slug}`. |
| 2 | **Who edits:** an Org Admin (`org.settings.manage`, the same permission as branding; a dedicated `policies.manage` can replace it when roles-as-data grows that key). |
| 3 | **Body format:** a small Markdown subset (headings, paragraphs, lists, bold, italic, links). Sanitized on the server: no HTML, no scripts, no images, links only `https:`, `mailto:` or a same-host path. Size cap `enterprise.policies.max_chars` (default 40 000). The web renders it to React elements (never `dangerouslySetInnerHTML`). |
| 4 | **States** of the working copy: `DRAFT -> IN_REVIEW -> PUBLISHED` or `CHANGES_REQUESTED` (reviewer comment). The org admin can withdraw an in-review submission (back to `DRAFT`). Every submission is an immutable **version** (`org_policy_version`); exactly one version per kind is `PUBLISHED` (the previous one becomes `SUPERSEDED`). |
| 5 | **Review:** `enterprise.policies.require_review` (BOOL, default **true**). On: only a Kiwiply app admin (`ROLE_ADMIN`, platform area) approves or requests changes; the org can never publish itself. Off: a submission publishes at once (audited). Org admins get an in-app notice on every decision. |
| 6 | **Never published = template.** The public page then shows a neutral template with the organization's display name and support contact merged in (no Kiwiply name, no link to Kiwiply). A draft or an in-review body is never public. |
| 7 | **Public pages** on each tenant host: `/privacy`, `/terms`, `/acceptable-use`, `/support` (and `/policies/{slug}` for extra kinds), rendered with that organization's published branding (logo, colours, name). No Kiwiply logo or link. They are public paths in the tenant proxy (no login first). |
| 8 | **Audit:** `POLICY_DRAFT_SAVE`, `POLICY_TEMPLATE`, `POLICY_SUBMIT`, `POLICY_WITHDRAW`, `POLICY_APPROVE`, `POLICY_REQUEST_CHANGES`; every change writes an `org_audit_event` row (actor = the member; platform decisions are written as the app admin's login, plus an admin audit row). |

## 2. Data (additive Liquibase `20261112010000_org_policies.xml`)

* `org_policy` (org_id, kind) unique: the working copy. `draft_body`, `draft_version` (optimistic lock, `If-Match`), `state`, `review_comment`, `live_version_no`, timestamps.
* `org_policy_version` (org_id, kind, version_no) unique: immutable body per submission with `status` (`IN_REVIEW`, `PUBLISHED`, `SUPERSEDED`, `REJECTED`, `WITHDRAWN`), submitter, reviewer, comment, `published_at`.
* Both tables carry `org_id` (FK `organization`); every repository finder takes `orgId` first, except the platform review queue (`findInReview`, allow-listed, reached only through `ROLE_ADMIN`).

## 3. API

| Route | Who | What |
|---|---|---|
| `GET /api/public/tenant/policies` | anyone, host-resolved | the configured kinds (key, title, path) |
| `GET /api/public/tenant/policies/{kind}` | anyone, host-resolved | `{kind,title,body,source:PUBLISHED\|TEMPLATE,version,publishedAt,orgName,supportEmail}`; cacheable 60 s, `Vary: X-Kiwiply-Host`; platform host or unknown host or unknown kind: 404 |
| `GET /api/orgs/{orgId}/policies` | `org.settings.manage` | one row per kind: state, live version, comment, requireReview |
| `GET /api/orgs/{orgId}/policies/{kind}` | same | draft body, live body, versions, comment |
| `PUT .../{kind}/draft` | same | save the draft (`If-Match` draftVersion, 409 `POLICY_DRAFT_CONFLICT`) |
| `POST .../{kind}/template` | same | replace the draft with the neutral template |
| `POST .../{kind}/request-review` / `/withdraw` | same | `DRAFT\|CHANGES_REQUESTED -> IN_REVIEW`; `IN_REVIEW -> DRAFT` |
| `GET /api/admin/org-policies?status=IN_REVIEW` | `ROLE_ADMIN` | review queue across organizations |
| `GET /api/admin/org-policies/{versionId}` | `ROLE_ADMIN` | proposed body, live body (the web diffs them) |
| `POST /api/admin/org-policies/{versionId}/approve` / `request-changes` | `ROLE_ADMIN` | publish; or `CHANGES_REQUESTED` with a required comment |

Errors: wrong org = the generic 404; a closed org is read-only (`ORG_NOT_EDITABLE`); state violations `409 POLICY_STATE`; invalid bodies `422 POLICY_BODY_INVALID`.

## 4. Web

* Tenant pages `web/src/app/(tenant)/%5Ft/{privacy,terms,acceptable-use,support,policies/[slug]}` share one `TenantPolicyPage` (branding header, rendered body, links to the sibling policies). Footer links from sign-in, invitation, forgot/reset password, the workspace shell and consent screens.
* Org admin: Settings > Policies (`/w/admin/settings/policies`), BFF `/api/orgs/[orgId]/policies/**`.
* Platform admin: `/admin/policy-reviews` with a line diff against the live version, BFF `/api/admin/org-policies/**`.

## 5. Link audit (see the PR notes and `web/src/lib/ent/tenant-links.test.ts`)

Tenant components may not hard-code `kiwiply.com` or a platform-only route. The test scans `components/ent`, `components/tenant`, `lib/ent`, `app/(tenant)` and the shared components a workspace renders (`InboxConnect`) and fails on a hit that is not on the explicit allow-list. Tenant e-mail footers link to the tenant host's policy pages (`TenantUrls.originForHost(host) + "/privacy"`).

## 6. Built vs. left for later

* **Built:** everything in sections 1 to 5 above. The Org Admin gate is `org.settings.manage` (same as Branding and Settings); a dedicated `policies.manage` permission was not added because the permission catalog and the role seeds are data owned by the roles work.
* **Not built (open):** the optional small "Powered by Kiwiply" line (there is no branding setting for it, so nothing renders it; default off by construction); cookie / security kinds ship as an admin-setting change only (the list is data, no template text exists for them beyond a generic page); a notification to the Kiwiply reviewers when a policy is submitted (the queue is the signal); the tenant-host **password-reset** e-mail still uses the personal (green) template and `kiwiply.com` footer links (it is `passwordResetEmail.html` with a `baseUrl`; moving it to the enterprise theme is a MailService change, listed in the PR notes); custom-domain hosts need nothing extra (the policy routes follow the resolved host).
* **Browser checks not run** (Playwright and browser walks are paused): the stories ADM-120..122, APP-08/09, PLT-60..62 are described, covered by vitest / IT only.
