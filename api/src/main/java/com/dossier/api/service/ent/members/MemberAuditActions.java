package com.dossier.api.service.ent.members;

import java.util.List;

/**
 * The audit action keys of the people actions of X4.3 / X4.4 (15-employees-and-teams.md section 2). The ones the platform already owns
 * ({@code MEMBER_SUSPEND}, {@code MEMBER_REMOVE}) stay in {@code OrgAuditService}; these are the new ones. Every key here is a MEMBER
 * target; the details column is a small JSON object and never holds a person's data beyond the admin-written reason.
 */
public final class MemberAuditActions {

    private MemberAuditActions() {}

    public static final String MEMBER_REINSTATE = "MEMBER_REINSTATE";
    /** Title, department, team (one row per changed member, from a single edit or a bulk call). */
    public static final String MEMBER_GROUP = "MEMBER_GROUP";
    public static final String MEMBER_MANAGER = "MEMBER_MANAGER";
    public static final String MEMBER_UPDATE = "MEMBER_UPDATE";
    /** The summary row of one bulk call: {@code {action, requested, ok, skipped}}. */
    public static final String MEMBER_BULK = "MEMBER_BULK";
    /** A bulk row that was refused for a person the caller can reach (the reason is in the details). */
    public static final String MEMBER_BULK_SKIP = "MEMBER_BULK_SKIP";
    public static final String MEMBER_OFFBOARD_SCHEDULED = "MEMBER_OFFBOARD_SCHEDULED";
    public static final String MEMBER_OFFBOARD_CANCELLED = "MEMBER_OFFBOARD_CANCELLED";
    /**
     * Decision O4 (doc 19 phase S8), enterprise accounts only. The account of a suspended or offboarded person is disabled and its sessions revoked
     * (HIGH); reinstating a suspended person enables it again (MEDIUM); an administrator exports an offboarded person's account within the retention
     * window (HIGH); the account is erased, by an administrator or by the retention job (HIGH). The details hold the mode and counts, never the address.
     */
    public static final String ACCOUNT_DISABLED = "ACCOUNT_DISABLED";
    public static final String ACCOUNT_ENABLED = "ACCOUNT_ENABLED";
    public static final String ACCOUNT_EXPORTED = "ACCOUNT_EXPORTED";
    public static final String ACCOUNT_ERASED = "ACCOUNT_ERASED";

    /** The actions that decide, on a seat's audit history, whether it was suspended at a given time. */
    public static final List<String> SUSPENSION_ACTIONS = List.of("MEMBER_SUSPEND", MEMBER_REINSTATE);

    /** The actions that end a seat (their audit time stands in for {@code left_at} when a row has none). */
    public static final List<String> ENDING_ACTIONS = List.of("MEMBER_REMOVE", "MEMBER_LEFT", "MEMBER_ERASED");
}
