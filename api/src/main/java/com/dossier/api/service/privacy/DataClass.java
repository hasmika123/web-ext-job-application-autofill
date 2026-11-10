package com.dossier.api.service.privacy;

/**
 * What kind of data a table holds, and therefore what must happen to it when a person asks to be forgotten or asks for a copy. Every table that
 * carries a user or organization reference is classified in {@link DataMap}; a test fails the build for one that is not.
 */
public enum DataClass {
    /** Rows one account owns. Erased with the account; included in (or explicitly excluded from, with a reason) the data export. */
    USER_OWNED,
    /** Rows kept for accounting after the account goes, with the link to the person removed. */
    USER_ANONYMISED,
    /** Short-lived security rows (challenges, one-time codes) that expire on their own and are cleared on erasure. */
    EPHEMERAL,
    /** An accountability trail keyed by a login string (admin audit, settings history). Kept under its own retention window, not deleted with the person. */
    AUDIT_RETAINED,
    /** A contact record not linked to any account (for example a newsletter address); removed through its own opt-out path. */
    UNLINKED_CONTACT,
    /** A record that mentions people but belongs to an organization (a contact, an employee record, a billing e-mail); it follows the organization lifecycle. */
    ORG_PEOPLE,
    /** Rows an organization owns (work product of its members, referencing seats not accounts); they follow the organization, and a seat is anonymised on erasure. */
    ORG_TENANT,
    /** The account table itself. */
    ACCOUNT_ROOT,
    /** No user or organization reference at all (configuration, catalogue, telemetry without identity, schema bookkeeping). */
    SYSTEM
}
