# HANDOFF: h-privacy (privacy follow-ups after B2)

Branch `h-privacy`, cut from `origin/version2` 7f77db37. Closes the open items in `docs/HANDOFF-ENT-SPRINT2-B-REPORT.md` (B2) and `docs/enterprise-v2/qa/REAL-GAPS-C.md` (T0.2, T1.5).

## START HERE

1. `git log --oneline origin/version2..h-privacy` lists the commits. Merge `origin/version2` into the branch before merging it back.
2. API checks: `cd api && ./gradlew test --no-daemon --tests '*AccountDeletionMailTest' --tests '*SubprocessorSettingKeysTest' --tests '*SettingDefinitionsTest'`, then the ITs `SignupTermsAcceptanceIT`, `AccountDeletionMailIT`, `SubprocessorRegisterIT`, `AccountPrivacyResourceIT`, `OrgIsolationIT`, `OpenApiContractIT` (regenerates `api/openapi.json`), `DataMapIT`.
3. Web checks: vitest on `src/components/legal`, `src/components/admin-v3/privacy`, `src/components/auth`, `src/lib/*subprocessors*`, `src/lib/terms-acceptance.test.ts`, `src/app/api/admin/subprocessors`, `src/app/(marketing)/legal`, plus `tsc --noEmit` and eslint.
4. Not verified in a browser (no recording was allowed).

## What was built

**1. Terms acceptance at sign-up.**
- The sign-up screen already said "By creating an account, you agree to our Terms of Service and Privacy Policy" with links to `/terms` and `/privacy`; that line stays.
- `AccountResource.registerAccount` makes ONE extra call after `registerUser`: `TermsAcceptanceService.recordSignup(userId, now)` (both documents, the versions in force, source `SIGNUP`). It is field-injected and optional like `orgSecurity`, wrapped in a try/catch (a failure is logged without identity and never fails the sign-up; the banner then asks).
- Google sign-up creates the account without a record; the banner below covers it.
- `components/legal/TermsBanner.tsx` (mounted in `(app)/layout.tsx`): asks `GET /api/account/terms-acceptance` on mount; when the account is not up to date it shows a non-blocking banner with links to the policy pages, **Accept** (POSTs each pending document at the version in force; source `RECONFIRM` when an earlier version was accepted, else `ACCOUNT`) and **Later** (hidden for the session). Demo accounts never see it.

**2. Deletion e-mails** (`AccountDeletionMailer`, `MailService.sendAccountDeletionEmail`, template `mail/accountDeletionEmail.html`, keys `email.deletion.*`). Scheduled (only when a NEW request is recorded), cancelled, completed. No name, no login: the only data is the date. The completed mail is sent AFTER the erasure succeeded, to the address read just before it (scheduled purge and the zero-hour immediate path). Not mailed: an administrator's erase and the legacy `DELETE /api/account`.

**3. Subprocessor register.** Settings `legal.subprocessor.01..12` (JSON object per slot, `{}` = unused; one key per slot because `app_setting.setting_value` is varchar(1000)). Slots 1-6 default to AWS S3, Brevo, Stripe, Cloudflare, Google Gemini, GitHub/GHCR with `dpaStatus` "To be confirmed". Validation: only the six fields, https link, lengths, `SensitiveContent` on every string. Public `GET /api/public/legal/subprocessors` (no DPA status), admin `GET /api/admin/privacy/subprocessors`, writes through the audited `PUT /api/admin/settings/legal.subprocessor.NN`. Web: public `/legal/subprocessors`, admin `/admin/subprocessors` (autosave, Remove with undo), a link from the privacy policy, a sitemap entry.

**4. Old instant-delete route.** Removed the web BFF `web/src/app/api/account/route.ts` (`DELETE /api/account`). The API endpoint and `AccountDeletionService` stay.

## Open

- Locations on the register are the provider's home country (AWS: the deployment default region), not a verified processing location. Check them and fill in the DPA status as each DPA is signed (T1.5/T1.6 are the user's action).
- Re-deletion after a backup restore (T1.9) and the org-close purge are still not built.
- `DELETE /api/account` (API) still erases at once and sends no e-mail; remove it when nothing else calls it.
