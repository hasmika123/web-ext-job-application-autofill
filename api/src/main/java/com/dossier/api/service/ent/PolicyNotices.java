package com.dossier.api.service.ent;

import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.NotificationService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Tells an organization's owners and admins (in-app, kind SYSTEM, not e-mailed) that a Kiwiply reviewer decided on a policy
 * (docs/enterprise-v2/62). The reviewer's comment is the whole point of a "changes requested" notice, so it travels in the body.
 * A failure is logged without personal data and never fails the decision.
 */
@Service
public class PolicyNotices {

    private static final Logger LOG = LoggerFactory.getLogger(PolicyNotices.class);
    static final String LINK = "/w/admin/policies";

    private final OrgMemberRepository members;
    private final NotificationService notifications;

    public PolicyNotices(OrgMemberRepository members, NotificationService notifications) {
        this.members = members;
        this.notifications = notifications;
    }

    public void approved(Long orgId, String policyTitle, String comment) {
        notifyAdmins(orgId, policyTitle + " is published", "Your " + policyTitle + " was approved and is now live on your portal." + suffix(comment));
    }

    public void changesRequested(Long orgId, String policyTitle, String comment) {
        notifyAdmins(orgId, "Changes requested to your " + policyTitle, "The reviewer asked for changes before it can be published: " + comment);
    }

    private static String suffix(String comment) {
        return comment == null || comment.isBlank() ? "" : " Reviewer note: " + comment;
    }

    private void notifyAdmins(Long orgId, String title, String body) {
        List<OrgMember> admins = members.findByOrgIdAndRoleInAndStatus(orgId, List.of(OrgRole.OWNER, OrgRole.ADMIN), OrgMemberStatus.ACTIVE);
        for (OrgMember m : admins) {
            if (m.getUserId() == null) continue;
            try {
                notifications.publish(NotificationKind.SYSTEM, m.getUserId(), new NotificationService.Payload(title, body, LINK, null, null, null, null, false, null));
            } catch (RuntimeException e) {
                LOG.warn("Policy notice could not be recorded ({})", e.getClass().getSimpleName());
            }
        }
    }
}
