package com.dossier.api.service.ent.jobs;

/**
 * What a caller may touch, as far as the job-assignment code is concerned: the organization and the consultants it may see. Role-neutral on
 * purpose: the marketer's {@code MktScope.View} implements it today, a consultant or admin scope can tomorrow. Every public method of
 * {@link OpportunityAssignmentService} and {@link JobIdentityService} takes one, so there is no entry point that works on a bare organization id.
 */
public interface AssignmentScope {

    Long orgId();

    /** True when the caller may see (and so act for) this consultant. */
    boolean sees(Long consultantId);
}
