package com.dossier.api.service.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.jobs.AssignmentScope;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.authz.AuthzReason;
import com.dossier.api.service.ent.authz.ReasonToHttp;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * The one gate every Marketing-workspace endpoint (`/api/orgs/{orgId}/mkt/**`) goes through. It answers two
 * questions: may this caller use the page at all, and WHICH consultants may it show them.
 *
 * <p>Gate (same generic 404 as an organization that does not exist, never a 403): the roles flag is on for the org, the marketing
 * module is on, and the caller holds the page's permission key (fixed authorization order of {@link AuthorizationService}). Consent is
 * resolved in the same request and is applied to every consultant-specific read behind the gate.
 *
 * <p>Scope: a caller whose scope for the key is ORG reaches every consultant; anyone narrower (ASSIGNED for a Marketing Specialist)
 * reaches only consultants that have a {@code marketer_assignment} row naming them as the marketer or the backup. Consent then removes
 * seats at {@link ShareScope#NONE}; full-detail routes call {@link #requireConsent(View, Long, ShareScope)} for the stronger check.
 * The Marketing workspace never widens beyond assignment plus consent, and a consultant id outside that set is answered as "not found".
 * E1: a marketer prepares, requests and records; the consultant submits. No endpoint behind this gate submits for anyone.
 */
@Service
public class MktScope {

    /** What the caller may see. Consent is resolved once per request and reused by every marketer service. */
    public record View(
        Long orgId,
        Long memberId,
        boolean all,
        Set<Long> consultantIds,
        Map<Long, ShareScope> consentScopes,
        boolean consentChecked
    ) implements AssignmentScope {
        public View(Long orgId, Long memberId, boolean all, Set<Long> consultantIds) {
            this(orgId, memberId, all, consultantIds, Map.of(), false);
        }

        public View {
            consultantIds = consultantIds == null ? Set.of() : Set.copyOf(consultantIds);
            consentScopes = consentScopes == null ? Map.of() : Map.copyOf(consentScopes);
        }

        @Override
        public boolean sees(Long consultantId) {
            return inScope(consultantId) && (!consentChecked || consentScope(consultantId) != ShareScope.NONE);
        }

        /** Assignment/permission reach before consent is applied. */
        public boolean inScope(Long consultantId) {
            return consultantId != null && (all || consultantIds.contains(consultantId));
        }

        /** Effective share for this request; legacy hand-wired views default to FULL for test compatibility. */
        public ShareScope consentScope(Long consultantId) {
            return consentChecked ? consentScopes.getOrDefault(consultantId, ShareScope.NONE) : ShareScope.FULL;
        }
    }

    private final OrgRoleService roles;
    private final TenantModules modules;
    private final AuthorizationService authorization;
    private final MarketerAssignmentRepository assignments;
    private final ConsultantProfileRepository consultants;
    private final DataShareService shares;

    /** Compatibility constructor for hand-wired unit tests and narrow seams. */
    public MktScope(OrgRoleService roles, TenantModules modules, AuthorizationService authorization, MarketerAssignmentRepository assignments) {
        this(roles, modules, authorization, assignments, null, null);
    }

    @Autowired
    public MktScope(
        OrgRoleService roles,
        TenantModules modules,
        AuthorizationService authorization,
        MarketerAssignmentRepository assignments,
        ConsultantProfileRepository consultants,
        DataShareService shares
    ) {
        this.roles = roles;
        this.modules = modules;
        this.authorization = authorization;
        this.assignments = assignments;
        this.consultants = consultants;
        this.shares = shares;
    }

    /** Gate on {@code permissionKey}, resolve assignment reach and snapshot effective consent. Throws {@link OrgNotFoundException} (404) otherwise. */
    public View resolve(OrgMembership me, String permissionKey) {
        if (me == null || !roles.rolesFromData(me.orgId()) || !modules.isOn(TenantModule.MARKETING, me.orgId())) throw new OrgNotFoundException();
        authorization.require(AuthzRequest.of(me.orgId(), List.of(permissionKey), Beneficiary.NONE, null, AuthzOperation.READ).withActor(me));
        PermissionScope scope = me.scopeFor(permissionKey).orElseThrow(OrgNotFoundException::new);
        Map<Long, ShareScope> consent = consentScopes(me.orgId());
        if (scope == PermissionScope.ORG) return new View(me.orgId(), me.memberId(), true, Set.of(), consent, consultants != null && shares != null);
        Set<Long> ids = new HashSet<>();
        // A PAUSED (or otherwise not ACTIVE) assignment no longer gives its marketer or backup sight of the consultant.
        for (MarketerAssignment a : assignments.findByOrgIdAndMarketerMemberId(me.orgId(), me.memberId())) if (active(a)) ids.add(a.getConsultantId());
        for (MarketerAssignment a : assignments.findByOrgIdAndBackupMemberId(me.orgId(), me.memberId())) if (active(a)) ids.add(a.getConsultantId());
        return new View(me.orgId(), me.memberId(), false, ids, consent, consultants != null && shares != null);
    }

    private static boolean active(MarketerAssignment a) {
        return "ACTIVE".equals(a.getStatus());
    }

    /** A consultant id the caller may not see is the same 404 as one that does not exist. */
    public void require(View view, Long consultantId) {
        if (!view.sees(consultantId)) throw new OrgNotFoundException();
    }

    /** Require a consent level after assignment scope has passed. A missing level is the explicit consent refusal. */
    public void requireConsent(View view, Long consultantId, ShareScope required) {
        if (view == null || !view.inScope(consultantId)) throw new OrgNotFoundException();
        if (required == null || !view.consentChecked() || view.consentScope(consultantId).atLeast(required)) return;
        throw ReasonToHttp.toException(
            AuthzReason.CONSENT_REQUIRED,
            Map.of("consultantId", consultantId, "requiredScope", required.name())
        );
    }

    private Map<Long, ShareScope> consentScopes(Long orgId) {
        if (consultants == null || shares == null) return Map.of();
        Map<Long, ShareScope> out = new HashMap<>();
        for (ConsultantProfile c : consultants.findByOrgId(orgId)) {
            if (!"ACTIVE".equals(c.getStatus()) || c.getId() == null) continue;
            // An org-managed profile has no member who can withdraw consent; existing marketer boards treat it as summary-only.
            out.put(c.getId(), c.getMemberId() == null ? ShareScope.SUMMARY : shares.scopeOf(orgId, c.getMemberId()));
        }
        return out;
    }
}
