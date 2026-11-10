package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.ShareScope;
import java.util.EnumMap;
import java.util.Map;

/**
 * Every kind of fact an organization could see about a member, with the least open {@link ShareScope} that shows it
 * (docs/design/org/consent-data-sharing.md section 3, the visibility matrix). This enum IS the contract: the member
 * summary a service builds is run through {@link #project} so a new field cannot leak by accident, and
 * {@code ShareMatrixTest} renders the enum against the table in the document so the two cannot drift apart.
 *
 * <p>The last entry, {@link #PRIVATE_DATA}, is visible at no scope at all: an org never receives a member's answers
 * cache, AI drafts, inbox mail, custom answers, private notes or login data, not even at FULL (decision 7).
 */
public enum ShareField {
    /** Name as entered on the invite, email, role, status, joined date, group, support owner, items assigned. */
    SEAT("Seat", ShareScope.NONE),
    /** Whether the member has accepted and done something (a yes/no). */
    ACTIVATED("Activated", ShareScope.NONE),
    /** Counts per stage (saved / applied / interview / offer / rejected) in a period. */
    STAGE_COUNTS("Counts per stage", ShareScope.SUMMARY),
    /** Last activity, bucketed to the day. */
    LAST_ACTIVITY("Last activity date", ShareScope.SUMMARY),
    /** Has a resume (yes/no), ATS band (low / mid / high), last updated date. */
    RESUME_READINESS("Resume readiness", ShareScope.SUMMARY),
    /** A number only. */
    UPCOMING_INTERVIEW_COUNT("Interview count upcoming", ShareScope.SUMMARY),
    /** Member-declared "placed" flag and date. */
    PLACEMENT("Placement", ShareScope.SUMMARY),
    /** Employer names, job titles, locations, salaries. */
    EMPLOYER_DETAILS("Employer names", ShareScope.FULL),
    /** Dates, stage history, next action, shareable notes. */
    APPLICATION_DETAIL("Application detail", ShareScope.FULL),
    /** The resume list and its documents. */
    RESUMES("Resumes", ShareScope.FULL),
    /** When, where and what type. */
    INTERVIEW_CALENDAR("Interview calendar entries", ShareScope.FULL),
    /** The job bank assigned to the member. */
    JOB_ASSIGNMENTS("Job assignments", ShareScope.FULL),
    /** Answers cache, AI drafts, inbox mail, custom answers, private notes, login and security data. Never shown. */
    PRIVATE_DATA("Answers cache", null);

    private final String docLabel;
    private final ShareScope minScope;

    ShareField(String docLabel, ShareScope minScope) {
        this.docLabel = docLabel;
        this.minScope = minScope;
    }

    /** The start of this row's first cell in the document's table (the test matches rows on it). */
    public String docLabel() {
        return docLabel;
    }

    /** The least open scope that shows this field, or null when no scope does. */
    public ShareScope minScope() {
        return minScope;
    }

    /** True when an org holding {@code scope} may see this field. */
    public boolean visibleAt(ShareScope scope) {
        return minScope != null && scope != null && scope.atLeast(minScope);
    }

    /**
     * What an org may see of {@code values} at {@code scope}: a map holding exactly the fields {@link #visibleAt} says
     * are visible (null where the value is unknown), and nothing else. A field the scope hides is absent, not null, so
     * "not shared" cannot be mistaken for "no data".
     */
    public static Map<ShareField, Object> project(ShareScope scope, Map<ShareField, ?> values) {
        Map<ShareField, Object> out = new EnumMap<>(ShareField.class);
        for (ShareField f : values()) {
            if (f.visibleAt(scope)) out.put(f, values == null ? null : values.get(f));
        }
        return out;
    }
}
