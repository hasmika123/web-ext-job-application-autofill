package com.dossier.api.service.ent.mkt.escalations;

import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.mgmt.TeamScopeRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.ent.RoleTemplates;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tells the managers of a marketer about NEW high-severity escalations (docs/enterprise-v2/deferred/marketing-manager.md section 4.2): an in-app notice of the
 * general kind (no e-mail; the notification kinds do not grow). Everything below HIGH only counts on the badge. With {@code org.mgmt.escalation_digest} on (the default) a
 * manager gets ONE notice per run ("3 new high-severity escalations in your team"); off, one per escalation. A notice is deduplicated by a key built from the escalation
 * ids, so a repeated run never tells twice, and a failure never undoes the escalation: it is logged.
 *
 * <p>The managers of a marketer are the active Marketing Managers who are the marketer's line manager or share their team or department (the same links the TEAM
 * scope of {@code TeamScope} follows). Organization-wide admins are not notified one by one.
 */
@Component
public class EscalationNotices {

    private static final Logger LOG = LoggerFactory.getLogger(EscalationNotices.class);
    static final String LINK = "/w/marketing-mgmt/escalations";

    private final OrgMemberRepository members;
    private final TeamScopeRepository team;
    private final MarketerAssignmentRepository assignments;
    private final EscalationSettings settings;
    private NotificationService feed;

    @Autowired
    public EscalationNotices(OrgMemberRepository members, TeamScopeRepository team, MarketerAssignmentRepository assignments, EscalationSettings settings) {
        this.members = members;
        this.team = team;
        this.assignments = assignments;
        this.settings = settings;
    }

    @Autowired(required = false)
    void setFeed(NotificationService feed) {
        this.feed = feed;
    }

    /** Notifies the managers of the marketers behind the HIGH rows of {@code raised}. Returns how many notices were published. */
    @Transactional
    public int notifyNewHigh(Long orgId, List<EscalationRules.Raised> raised) {
        if (feed == null || raised == null || raised.isEmpty()) return 0;
        Map<Long, List<EscalationRules.Raised>> byManager = new LinkedHashMap<>();
        try {
            List<OrgMember> managers = managersOfTheOrganization(orgId);
            if (managers.isEmpty()) return 0;
            for (EscalationRules.Raised r : raised) {
                if (!"HIGH".equals(r.severity())) continue;
                Long marketer = r.marketerMemberId() != null ? r.marketerMemberId() : marketerOfConsultant(orgId, r.consultantId());
                if (marketer == null) continue;
                OrgMember seat = members.findByOrgIdAndId(orgId, marketer).orElse(null);
                if (seat == null) continue;
                for (OrgMember m : managers) if (manages(m, seat)) byManager.computeIfAbsent(m.getId(), k -> new ArrayList<>()).add(r);
            }
            boolean digest = settings.digest(orgId);
            int sent = 0;
            for (Map.Entry<Long, List<EscalationRules.Raised>> e : byManager.entrySet()) {
                Long userId = managers.stream().filter(m -> m.getId().equals(e.getKey())).map(OrgMember::getUserId).findFirst().orElse(null);
                if (userId == null) continue;
                List<EscalationRules.Raised> mine = e.getValue();
                if (digest) {
                    sent += publish(userId, digestTitle(mine.size()), digestBody(mine), "escalation-digest:" + orgId + ":" + e.getKey() + ":" + ids(mine));
                } else {
                    for (EscalationRules.Raised r : mine) sent += publish(userId, "High-severity escalation", r.title(), "escalation:" + r.id());
                }
            }
            return sent;
        } catch (RuntimeException e) {
            LOG.warn("Could not notify the managers of org {} about new escalations", orgId, e); // the escalations themselves stand
            return 0;
        }
    }

    private int publish(Long userId, String title, String body, String dedupe) {
        Optional<?> made = feed.publish(NotificationKind.SYSTEM, userId, new NotificationService.Payload(title, body, LINK, null, null, dedupe, null, false, null));
        return made.isPresent() ? 1 : 0;
    }

    static String digestTitle(int n) {
        return n == 1 ? "1 new high-severity escalation in your team" : n + " new high-severity escalations in your team";
    }

    private static String digestBody(List<EscalationRules.Raised> mine) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < Math.min(3, mine.size()); i++) b.append(i == 0 ? "" : "; ").append(mine.get(i).title());
        if (mine.size() > 3) b.append("; and ").append(mine.size() - 3).append(" more");
        String text = b.toString();
        return text.length() > 480 ? text.substring(0, 480) : text;
    }

    private static String ids(List<EscalationRules.Raised> mine) {
        Set<Long> ids = new LinkedHashSet<>();
        for (EscalationRules.Raised r : mine) ids.add(r.id());
        return String.join("-", ids.stream().map(String::valueOf).toList());
    }

    private List<OrgMember> managersOfTheOrganization(Long orgId) {
        List<Long> ids = team.findActiveMemberIdsWithRoleKeys(orgId, List.of(RoleTemplates.MARKETING_MANAGER));
        return ids.isEmpty() ? List.of() : members.findByOrgIdAndIdIn(orgId, ids);
    }

    private Long marketerOfConsultant(Long orgId, Long consultantId) {
        if (consultantId == null) return null;
        return assignments.findByOrgIdAndConsultantId(orgId, consultantId).map(a -> a.getMarketerMemberId()).orElse(null);
    }

    /** The manager is the marketer's line manager or shares their team or department. */
    static boolean manages(OrgMember manager, OrgMember marketer) {
        if (manager.getId().equals(marketer.getId())) return false;
        if (marketer.getManagerMemberId() != null && marketer.getManagerMemberId().equals(manager.getId())) return true;
        if (marketer.getTeamGroupId() != null && marketer.getTeamGroupId().equals(manager.getTeamGroupId())) return true;
        return marketer.getDepartmentGroupId() != null && marketer.getDepartmentGroupId().equals(manager.getDepartmentGroupId());
    }
}
