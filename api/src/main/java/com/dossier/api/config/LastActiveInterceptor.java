package com.dossier.api.config;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.members.MemberActivityTracker;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Moves a member's "last active" time forward (at most hourly) once {@link OrgPermissionInterceptor} has admitted them to an organization route
 * (X4.3). It runs right behind that interceptor and only reads the membership it stored; it never decides access and never fails a request. Only
 * for organizations in the enterprise flag, so the legacy product does no extra write.
 */
public class LastActiveInterceptor implements HandlerInterceptor {

    private static final Logger LOG = LoggerFactory.getLogger(LastActiveInterceptor.class);

    private final MemberActivityTracker tracker;
    private final EnterpriseFeatureFlag enterpriseFlag;

    public LastActiveInterceptor(MemberActivityTracker tracker, EnterpriseFeatureFlag enterpriseFlag) {
        this.tracker = tracker;
        this.enterpriseFlag = enterpriseFlag;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        try {
            if (request.getAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) instanceof OrgMembership m && m.orgId() != null && m.memberId() != null) {
                if (enterpriseFlag != null && enterpriseFlag.isEnabled(m.orgId())) tracker.touch(m.orgId(), m.memberId());
            }
        } catch (RuntimeException e) {
            LOG.debug("last-active tracking skipped: {}", e.toString());
        }
        return true;
    }
}
