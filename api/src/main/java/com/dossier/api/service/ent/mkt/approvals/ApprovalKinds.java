package com.dossier.api.service.ent.mkt.approvals;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The vocabulary of a manager approval (docs/enterprise-v2/deferred/marketing-manager.md section 3.1 and 4.1.1): the three kinds, the subject types they
 * may name, the audit actions and the error codes. A manager approves a PREPARATION step (an assignment, a duplicate override, the release of a
 * marketer-made resume to the consultant); never a submission (E1), which only the consultant makes.
 */
public final class ApprovalKinds {

    private ApprovalKinds() {}

    public static final String OPPORTUNITY_ASSIGN = "OPPORTUNITY_ASSIGN";
    public static final String DUPLICATE_OVERRIDE = "DUPLICATE_OVERRIDE";
    public static final String RESUME_RELEASE = "RESUME_RELEASE";
    public static final List<String> KINDS = List.of(OPPORTUNITY_ASSIGN, DUPLICATE_OVERRIDE, RESUME_RELEASE);

    public static final String SUBJECT_OPPORTUNITY = "MKT_OPPORTUNITY";
    public static final String SUBJECT_SUBMISSION = "MKT_SUBMISSION";
    public static final String SUBJECT_APPLICATION = "TALENT_APPLICATION";
    public static final String SUBJECT_RESUME = "ORG_RESUME";
    public static final Set<String> SUBJECT_TYPES = Set.of(SUBJECT_OPPORTUNITY, SUBJECT_SUBMISSION, SUBJECT_APPLICATION, SUBJECT_RESUME);

    /** Which subject types each kind may hold. */
    public static final Map<String, Set<String>> SUBJECTS_OF_KIND = Map.of(
        OPPORTUNITY_ASSIGN, Set.of(SUBJECT_OPPORTUNITY),
        DUPLICATE_OVERRIDE, Set.of(SUBJECT_OPPORTUNITY, SUBJECT_SUBMISSION, SUBJECT_APPLICATION),
        RESUME_RELEASE, Set.of(SUBJECT_RESUME)
    );

    /** The statuses a manager's Decided tab lists. */
    public static final List<String> DECIDED = List.of("APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED");

    // ---- audit actions (OrgAuditService carries the same names) ---------------------------------------------------------------------
    public static final String AUDIT_OPEN = "MKT_APPROVAL_OPEN";
    public static final String AUDIT_APPROVE = "MKT_APPROVAL_APPROVE";
    public static final String AUDIT_REJECT = "MKT_APPROVAL_REJECT";
    public static final String AUDIT_WITHDRAW = "MKT_APPROVAL_WITHDRAW";
    public static final String AUDIT_EXPIRE = "MKT_APPROVAL_EXPIRE";
    public static final String TARGET = "MKT_APPROVAL_REQUEST";

    // ---- timeline events on the held subject --------------------------------------------------------------------------------------
    public static final String EVENT_REQUESTED = "APPROVAL_REQUESTED";
    public static final String EVENT_APPROVED = "MANAGER_APPROVED";
    public static final String EVENT_DECLINED = "MANAGER_DECLINED";
    public static final String EVENT_WITHDRAWN = "APPROVAL_WITHDRAWN";
    public static final String EVENT_EXPIRED = "APPROVAL_EXPIRED";

    // ---- error codes ------------------------------------------------------------------------------------------------------------------
    public static final String CODE_PENDING = "APPROVAL_PENDING";
    public static final String CODE_NOT_PENDING = "APPROVAL_NOT_PENDING";
    public static final String CODE_SELF = "SELF_APPROVAL";
    public static final String CODE_DUPLICATE_APPROVAL_REQUIRED = "DUPLICATE_APPROVAL_REQUIRED";
    public static final String CODE_NOT_SUPPORTED = "APPROVAL_NOT_SUPPORTED";

    public static final int TITLE_MAX = 160;
    public static final int NOTE_MAX = 500;
    public static final int DECISION_NOTE_MAX = 300;
    public static final int PAYLOAD_MAX = 4000;

    /** The key a manager's decision is held by (decision DD-3: an existing key, no new one). */
    public static final String KEY_DECIDE = "approvals.decide";
    /** What a marketer holds to ask for an approval of an opportunity step. */
    public static final String KEY_REQUEST = "opportunities.manage";
}
