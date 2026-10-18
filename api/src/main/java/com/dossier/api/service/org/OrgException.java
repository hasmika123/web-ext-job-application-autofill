package com.dossier.api.service.org;

import java.util.Map;

/**
 * An organization operation the server refused, with a machine-readable code. Service-layer twin of
 * {@code web.rest.errors.OrgProblemException} (the service layer may not depend on the web layer, so
 * {@code ExceptionTranslator} renders it). Clients branch on {@link #getCode()}, never on the message.
 *
 * <ul>
 *   <li>{@code NOT_FOUND} (404) - see {@link OrgNotFoundException}; deliberately says nothing about why.</li>
 *   <li>{@code RESERVED_VALUE} (422) - a reserved enum value (COACH) was submitted.</li>
 *   <li>{@code ORG_INVALID} (422) - a field failed validation; {@code field} names it.</li>
 *   <li>{@code SLUG_TAKEN} (409) - carries a {@code suggestion}.</li>
 *   <li>{@code GROUP_NAME_TAKEN} (409), {@code ORG_NOT_EDITABLE} (409) - state conflicts.</li>
 *   <li>{@code ORG_LIMIT_REACHED} (422) - an admin-configured cap was hit ({@code limit} names it, {@code max} is its value).</li>
 *   <li>{@code NOT_A_MEMBER} (403) - sign-in on a tenant host by someone with no active seat (the only non-404 there; carries nothing).</li>
 *   <li>{@code SUBDOMAIN_TAKEN} (409) - another organization already owns that {@code kiwiply.com} label (Enterprise V2).</li>
 *   <li>{@code ALREADY_MEMBER} (409), {@code INVITE_EXPIRED} (409), {@code SEAT_STATE} (409) - the join flow (O2.2): the person
 *       already holds a seat, the link ran out (or its code is used up), or the organization cannot take that seat right now.</li>
 *   <li>{@code SHARE_SCOPE} (403) - an org person asked for a member's summary while the member shares less than that (O5.1).</li>
 *   <li>{@code OWNER_MUST_TRANSFER} (409), {@code LEAVE_NOT_ALLOWED} (409) - leaving an organization (O6.2).</li>
 * </ul>
 */
public class OrgException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_NOT_FOUND = "NOT_FOUND";
    public static final String CODE_RESERVED_VALUE = "RESERVED_VALUE";
    public static final String CODE_ORG_INVALID = "ORG_INVALID";
    public static final String CODE_SLUG_TAKEN = "SLUG_TAKEN";
    public static final String CODE_GROUP_NAME_TAKEN = "GROUP_NAME_TAKEN";
    public static final String CODE_ORG_NOT_EDITABLE = "ORG_NOT_EDITABLE";
    public static final String CODE_ORG_LIMIT_REACHED = "ORG_LIMIT_REACHED";
    public static final String CODE_SUBDOMAIN_TAKEN = "SUBDOMAIN_TAKEN";
    public static final String CODE_NOT_A_MEMBER = "NOT_A_MEMBER";
    public static final String CODE_ALREADY_MEMBER = "ALREADY_MEMBER";
    public static final String CODE_INVITE_EXPIRED = "INVITE_EXPIRED";
    public static final String CODE_SEAT_STATE = "SEAT_STATE";
    public static final String CODE_SHARE_SCOPE = "SHARE_SCOPE";
    public static final String CODE_OWNER_MUST_TRANSFER = "OWNER_MUST_TRANSFER";
    public static final String CODE_LEAVE_NOT_ALLOWED = "LEAVE_NOT_ALLOWED";

    private final int status;
    private final String code;
    private final transient Map<String, Object> extra;

    public OrgException(int status, String code, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra == null ? Map.of() : Map.copyOf(extra);
    }

    /** A value the product does not accept yet (tenant-model.md decision 10). */
    public static OrgException reserved(String field, String value) {
        return new OrgException(422, CODE_RESERVED_VALUE, value + " is reserved and cannot be used yet", Map.of("field", field));
    }

    /** Enterprise V2 (X1.5): valid credentials on an organization's host, but no active seat there. Carries no organization data. */
    public static OrgException notAMember() {
        return new OrgException(403, CODE_NOT_A_MEMBER, "You are not a member of this workspace", Map.of());
    }

    public static OrgException invalid(String field, String message) {
        return new OrgException(422, CODE_ORG_INVALID, field + ": " + message, Map.of("field", field, "message", message));
    }

    public static OrgException slugTaken(String slug, String suggestion) {
        return new OrgException(409, CODE_SLUG_TAKEN, "The address '" + slug + "' is taken", Map.of("slug", slug, "suggestion", suggestion));
    }

    public static OrgException subdomainTaken(String subdomain) {
        return new OrgException(409, CODE_SUBDOMAIN_TAKEN, "The subdomain '" + subdomain + "' is taken", Map.of("subdomain", subdomain));
    }

    public static OrgException groupNameTaken(String name) {
        return new OrgException(409, CODE_GROUP_NAME_TAKEN, "A group named '" + name + "' already exists", Map.of("name", name));
    }

    /** An admin-configured cap (orgs created per person, groups per org) was reached; the cap itself is in {@code max}. */
    public static OrgException limitReached(String limit, int max) {
        return new OrgException(422, CODE_ORG_LIMIT_REACHED, "The limit of " + max + " (" + limit + ") has been reached", Map.of("limit", limit, "max", max));
    }

    /** The caller already holds a live seat in this organization. */
    public static OrgException alreadyMember() {
        return new OrgException(409, CODE_ALREADY_MEMBER, "You are already a member of this organization", Map.of());
    }

    /** The link ran out: {@code reason} is {@code expired} or {@code full}; {@code orgName} lets the page say whose it was. */
    public static OrgException inviteExpired(String reason, String orgName) {
        return new OrgException(409, CODE_INVITE_EXPIRED, "full".equals(reason) ? "This link has no places left" : "This invite has expired", Map.of("reason", reason, "orgName", orgName));
    }

    /** The organization is not in a state that can take this seat (it has not been activated, or it is suspended or closed). */
    public static OrgException seatState(String orgStatus) {
        return new OrgException(409, CODE_SEAT_STATE, "This organization cannot add that kind of person right now", Map.of("orgStatus", orgStatus));
    }

    /** A person of the org asked for more of a member than the member shares (the seat is known to exist, so this is not a 404). */
    public static OrgException shareScope(String scope) {
        return new OrgException(403, CODE_SHARE_SCOPE, "This person has chosen not to share that with the organization", Map.of("shareScope", scope));
    }

    public static OrgException ownerMustTransfer() {
        return new OrgException(409, CODE_OWNER_MUST_TRANSFER, "Transfer ownership before leaving", Map.of());
    }

    public static OrgException leaveNotAllowed() {
        return new OrgException(409, CODE_LEAVE_NOT_ALLOWED, "This organization does not let members leave on their own", Map.of());
    }

    public static OrgException notEditable(String message) {
        return new OrgException(409, CODE_ORG_NOT_EDITABLE, message, Map.of());
    }

    /**
     * A refusal with its own typed {@code code} whose human sentence reaches the client (the generic problem body replaces the
     * title, so the sentence also travels as the {@code message} property). Used by the branding API (Enterprise V2, X2.5).
     */
    public static OrgException coded(int status, String code, String message, Map<String, Object> extra) {
        Map<String, Object> merged = new java.util.LinkedHashMap<>(extra == null ? Map.of() : extra);
        merged.put("message", message);
        return new OrgException(status, code, message, merged);
    }

    // ---- invitations (Enterprise V2, X1.15) ----------------------------------------------------------------------------

    /** The inviter's rights do not cover these roles (05-permission-model.md ceiling rule); {@code roleIds} names the ones refused. */
    public static OrgException roleCeiling(java.util.Collection<Long> roleIds) {
        return coded(422, "ROLE_CEILING", "You cannot invite someone into a role that has more access than you do", Map.of("roleIds", java.util.List.copyOf(roleIds)));
    }

    /** The signed-in account's email is not the invited address (E7); the invited address is shown masked, never in full. */
    public static OrgException inviteEmailMismatch(String invitedEmailMasked) {
        return coded(409, "INVITE_EMAIL_MISMATCH", "This invitation was sent to a different email address", Map.of("invitedEmailMasked", invitedEmailMasked));
    }

    /** Choosing this manager would make someone their own boss (a chain that returns to the same person). */
    public static OrgException managerCycle() {
        return coded(422, "MANAGER_CYCLE", "That manager would create a reporting loop", Map.of());
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Map<String, Object> getExtra() {
        return extra;
    }
}
