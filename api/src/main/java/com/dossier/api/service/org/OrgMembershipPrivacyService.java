package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What account erasure and the data export do about a person's organization memberships
 * (docs/design/org/tenant-model.md section 6).
 *
 * <p><b>Erasure.</b> For every {@code org_member} row of the user, in any state: {@code user_id}, {@code invite_email},
 * {@code invite_token_hash}, {@code display_label} and {@code support_owner_member_id} are cleared and the status
 * becomes {@code ERASED}; the seat row stays so the org's history and counts are intact, but nothing on it identifies
 * the person. One {@code MEMBER_ERASED} audit row per org names the login as a string (the trail is keyed by login, so
 * it survives the account, like {@code AdminAuditEvent}). If the erased user was the org's last ACTIVE OWNER the org
 * moves to {@code SUSPENDED}: an org with no owner cannot stay ACTIVE and billable. It runs inside the deleting
 * transaction, before the user row goes ({@code org_member.user_id} is a restricting foreign key).
 *
 * <p>Consent (O6.1): the seat's {@code data_share} row is deleted (one {@code ERASED} event keyed by the login records the
 * withdrawal; the event history stays, it holds no profile data), and every FULL share that named the erased person
 * drops to SUMMARY.
 *
 * <p>Not here yet, by design: {@code org_assignment} (ended and the Stripe seat decremented) and the platform-admin
 * queue notice for an ownerless org. Those ship with billing (O4); the stories that add them extend {@link #eraseFor}.
 *
 * <p><b>Export.</b> {@link #exportFor} returns the person's own membership rows (the "organizations" part of
 * {@code GET /api/account/export}): which orgs, their role, state and dates, and {@code dataShare}: what they chose to
 * share and the history of every change. The org's records about them (audit rows) are keyed by the login string and
 * are the org's accountability record, not exported member data.
 */
@Service
public class OrgMembershipPrivacyService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgMembershipPrivacyService.class);

    private final OrgMemberRepository members;
    private final OrganizationRepository orgs;
    private final OrgAuditService audit;
    private final DataShareService dataShare;

    public OrgMembershipPrivacyService(OrgMemberRepository members, OrganizationRepository orgs, OrgAuditService audit, DataShareService dataShare) {
        this.members = members;
        this.orgs = orgs;
        this.audit = audit;
        this.dataShare = dataShare;
    }

    /** Anonymises every membership of {@code userId}; returns how many rows were erased. */
    @Transactional
    public int eraseFor(Long userId, String login) {
        int erased = 0;
        for (OrgMember m : members.findMine(userId)) {
            if (m.getStatus() == OrgMemberStatus.ERASED) continue;
            OrgMemberStatus was = m.getStatus();
            OrgRole role = m.getRole();
            dataShare.endPairingsTo(m.getOrgId(), m.getId(), login); // an erased marketer ends the FULL shares that named them
            dataShare.eraseFor(m.getOrgId(), m.getId(), login); // the seat's consent row goes; one ERASED event keeps the proof
            m.setUserId(null);
            m.setStatus(OrgMemberStatus.ERASED);
            m.setInviteEmail(null);
            m.setInviteTokenHash(null);
            m.setInviteExpiresAt(null);
            m.setDisplayLabel(null);
            m.setSupportOwnerMemberId(null);
            members.saveAndFlush(m);
            erased++;

            audit.record(m.getOrgId(), login, role, OrgAuditService.MEMBER_ERASED, OrgAuditService.TARGET_MEMBER, login, String.valueOf(m.getId()), "was " + was, null);

            if (role == OrgRole.OWNER && was == OrgMemberStatus.ACTIVE) suspendIfOwnerless(m.getOrgId());
        }
        return erased;
    }

    private void suspendIfOwnerless(Long orgId) {
        if (members.countByOrgIdAndRoleAndStatus(orgId, OrgRole.OWNER, OrgMemberStatus.ACTIVE) > 0) return;
        Optional<Organization> org = orgs.findByOrgId(orgId);
        if (org.isEmpty() || org.get().getStatus() == OrgStatus.CLOSED || org.get().getStatus() == OrgStatus.SUSPENDED) return;
        OrgStatus before = org.get().getStatus();
        org.get().setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(org.get());
        audit.record(orgId, OrgAuditService.SYSTEM_ACTOR, null, OrgAuditService.ORG_SETTINGS, OrgAuditService.TARGET_ORG, null, orgId.toString(), "no owner left: status " + before + " -> SUSPENDED", null);
        LOG.warn("Organization {} has no ACTIVE owner after an account erasure; moved to SUSPENDED (needs a platform admin)", orgId);
    }

    /** The user's own membership rows for the data export, oldest first. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> exportFor(Long userId, String login) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (OrgMember m : members.findMine(userId)) {
            Map<String, Object> row = new LinkedHashMap<>();
            Optional<Organization> org = orgs.findByOrgId(m.getOrgId());
            row.put("orgId", m.getOrgId());
            row.put("orgName", org.map(Organization::getName).orElse(null));
            row.put("orgSlug", org.map(Organization::getSlug).orElse(null));
            row.put("role", m.getRole());
            row.put("status", m.getStatus());
            row.put("displayLabel", m.getDisplayLabel());
            row.put("joinedAt", m.getJoinedAt());
            row.put("leftAt", m.getLeftAt());
            row.put("dataShare", dataShare.exportFor(m.getOrgId(), m.getId(), login));
            out.add(row);
        }
        return out;
    }
}
