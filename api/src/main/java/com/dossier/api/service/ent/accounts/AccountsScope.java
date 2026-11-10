package com.dossier.api.service.ent.accounts;

import com.dossier.api.service.ent.jobs.AssignmentScope;

/**
 * What an Account Manager may touch when a requirement is put in front of a consultant: the whole organization (their {@code requirements.manage}
 * is ORG scope, so there is no per-consultant limit as there is for a marketer). The organization id comes from the caller's membership, never from
 * the request; {@code OpportunityAssignmentService} still refuses a consultant of any other organization because it looks every row up by that id.
 */
record AccountsScope(Long orgId) implements AssignmentScope {

    @Override
    public boolean sees(Long consultantId) {
        return consultantId != null;
    }
}
