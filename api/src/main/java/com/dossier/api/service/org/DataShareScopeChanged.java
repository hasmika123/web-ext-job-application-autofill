package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.ShareScope;

/**
 * Published after a member grants a wider organization scope. Consumers use it to replay data that was created while
 * the member's choice did not allow that data; it never grants or widens consent itself.
 */
public record DataShareScopeChanged(Long orgId, Long memberId, Long userId, ShareScope fromScope, ShareScope toScope) {

    /** Only an upward transition to an org-visible scope can make prior personal records eligible for replay. */
    public boolean replaysApplications() {
        return orgId != null
            && memberId != null
            && userId != null
            && toScope != null
            && toScope.atLeast(ShareScope.SUMMARY)
            && (fromScope == null || toScope.compareTo(fromScope) > 0);
    }

    /** Resume documents are org-visible only after the consultant grants the named person FULL access. */
    public boolean replaysResumes() {
        return orgId != null
            && memberId != null
            && userId != null
            && toScope == ShareScope.FULL
            && (fromScope == null || toScope.compareTo(fromScope) > 0);
    }
}
