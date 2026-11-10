package com.dossier.api.service.entitlement;

/**
 * Whose entitlements are being asked about (docs/subscriptions/06-entitlements-and-enforcement.md section 1, ADR-018 and decision O4). A personal
 * account is a {@link Personal}; an enterprise account working in its organization is an {@link Org}. The two never mix: an enterprise account has no
 * personal plan, a personal account holds no license.
 */
public sealed interface EntitlementContext {
    /** A personal account (kiwiply.com): the subscription row, its plan version, add-ons and comps. */
    record Personal(long userId, String login) implements EntitlementContext {}

    /** An organization seat: the beneficiary's license on the organization's plan version. */
    record Org(long orgId, long actorMemberId, long beneficiaryMemberId) implements EntitlementContext {}
}
