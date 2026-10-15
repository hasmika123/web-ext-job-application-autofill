package com.dossier.api.service.inbox;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.EntitlementService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who may have an inbox connected (ent-inbox, docs/enterprise-v2/18-consultant-inbox.md), decided by the KIND of account (decision O4, doc 19
 * section 3.2): each account has exactly one ground.
 *
 * <ol>
 *   <li><b>Personal account</b>: the person's own Pro or Autopilot plan ({@link EntitlementService#isPro}). Unchanged from Phase 14. (A personal
 *       account that holds a seat in a legacy SHARED organization may still be granted by that organization's license, exactly as before.)</li>
 *   <li><b>Enterprise account</b> (login {@code ent#<orgId>#...}): ONLY the organization license: the account is an ACTIVE member of its ACTIVE
 *       organization, is a consultant there, and its LIVE license carries the feature {@value #FEATURE}. The personal plan is never consulted,
 *       so an enterprise account can not be granted by a plan it can not hold.</li>
 * </ol>
 *
 * The organization is NEVER taken from a client: a request passes the organization of the host it arrived on (the {@code /api/orgs/{orgId}}
 * route has already been checked against it), and the poller, which has no request, asks about every seat the person holds. The answer says only
 * yes or no and which ground: nothing about prices, plans or other features.
 *
 * <p>This is the same question step 7 of {@code AuthorizationService} will ask once the licence hooks exist (X5.6); until then this is the only
 * place that reads a license for {@code inbox.monitoring}, so there is a single definition to replace.
 */
@Service
public class InboxEntitlement {

    /** The catalog key of the add-on (docs/enterprise-v2/21-feature-catalog.md). */
    public static final String FEATURE = "inbox.monitoring";

    /** License states that still grant their features: a license that is ending keeps them until it ends. */
    private static final Set<String> GRANTING = Set.of("ACTIVE", "CANCEL_AT_PERIOD_END");

    /** Why an inbox may be used. */
    public enum Ground {
        PERSONAL,
        ORGANIZATION,
        NONE,
    }

    public record Decision(Ground ground, Long orgId) {
        public boolean allowed() {
            return ground != Ground.NONE;
        }
    }

    private final EntitlementService personal;
    private final OrgMemberRepository members;
    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;

    public InboxEntitlement(
        EntitlementService personal,
        OrgMemberRepository members,
        OrganizationRepository orgs,
        ConsultantProfileRepository consultants,
        ConsultantLicenseRepository licenses,
        LicenseFeatureRepository features
    ) {
        this.personal = personal;
        this.members = members;
        this.orgs = orgs;
        this.consultants = consultants;
        this.licenses = licenses;
        this.features = features;
    }

    /** Whether anything at all lets this account have an inbox: an enterprise account its organization license only, a personal account its plan first, then any seat that grants it. */
    @Transactional(readOnly = true)
    public Decision decide(Long userId, String login) {
        if (isEnterpriseAccount(login)) return organizationDecision(userId);
        if (login != null && personal.isPro(login)) return new Decision(Ground.PERSONAL, null);
        return organizationDecision(userId);
    }

    /** Whether the login is an enterprise account's ({@code ent#<orgId>#...}); the account's kind never changes. */
    public static boolean isEnterpriseAccount(String login) {
        return com.dossier.api.config.Constants.isEnterpriseLogin(login);
    }

    /** The ORGANIZATION ground only, over every seat of the person (the poller has no host). */
    @Transactional(readOnly = true)
    public Decision organizationDecision(Long userId) {
        if (userId == null) return new Decision(Ground.NONE, null);
        for (OrgMember seat : members.findMine(userId)) {
            if (seat.getOrgId() != null && grants(seat.getOrgId(), seat)) return new Decision(Ground.ORGANIZATION, seat.getOrgId());
        }
        return new Decision(Ground.NONE, null);
    }

    /** Whether {@code orgId}'s license grants the feature to this person, for the one organization a request arrived on. */
    @Transactional(readOnly = true)
    public boolean orgGrants(Long orgId, Long userId) {
        if (orgId == null || userId == null) return false;
        return members.findMine(userId).stream().filter(s -> orgId.equals(s.getOrgId())).anyMatch(s -> grants(orgId, s));
    }

    private boolean grants(Long orgId, OrgMember seat) {
        if (seat.getStatus() != OrgMemberStatus.ACTIVE) return false; // suspended, left, removed, erased: nothing is granted
        boolean orgLive = orgs.findByOrgId(orgId).map(o -> o.getStatus() == OrgStatus.ACTIVE || o.getStatus() == OrgStatus.PAST_DUE).orElse(false);
        if (!orgLive) return false;
        Optional<ConsultantProfile> profile = consultants.findByOrgIdAndMemberId(orgId, seat.getId());
        if (profile.isEmpty() || !"ACTIVE".equals(profile.get().getStatus())) return false;
        Instant now = Instant.now();
        for (ConsultantLicense l : licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(orgId, profile.get().getId())) {
            if (!GRANTING.contains(l.getStatus()) || !current(l.getStartsAt(), l.getEndsAt(), now)) continue;
            List<LicenseFeature> fs = features.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, l.getId());
            for (LicenseFeature f : fs) {
                if (FEATURE.equals(f.getFeatureKey()) && Boolean.TRUE.equals(f.getLive()) && current(f.getStartsAt(), f.getEndsAt(), now)) return true;
            }
        }
        return false;
    }

    private static boolean current(Instant start, Instant end, Instant now) {
        return (start == null || !start.isAfter(now)) && (end == null || end.isAfter(now));
    }
}
