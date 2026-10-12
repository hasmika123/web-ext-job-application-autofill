# ADR-006 — Basic user profile vs consultant career profile

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §6
- **Reversibility:** see Consequences

## Context
Identity is User (name, email, imageUrl, langKey); the career profile is Bio + ProfileItem (personal, provenance-tracked); notification preferences hold tz. Requirements §7: one basic profile per member, not the default page; consultant profile separate.

## Decision
- Basic profile = User + additive user-level columns phone, title (nullable) + NotificationPreference.tz + language. It is reached from the avatar menu on every surface; never a landing page.
- Consultant career profile = the person's existing profile (Bio/ProfileItem/resumes) viewed by the org through data_share scope, plus a membership-scoped overlay consultant_profile (member_id, availability_status, available_from, marketing_status, bench_since, preferred_locations_json, rate_band_label, work_auth_category (self-declared, consent-gated, no document numbers), updated_by).
- No copying of career data into org tables; leaving the org deletes the overlay and ends the view.
- Admins without a consultant role never see a career-profile prompt.

## Consequences
The consultant directory joins org_member × consultant_profile × consented summary fields (ShareField).

## Security note
The overlay never stores sensitive PII; the SensitivePatterns scanner runs on free-text fields.
