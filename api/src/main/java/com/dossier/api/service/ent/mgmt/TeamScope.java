package com.dossier.api.service.ent.mgmt;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.mgmt.TeamScopeRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.authz.JpaScopeDirectory;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "My team" for the Marketing Manager workspace (docs/enterprise-v2/deferred/marketing-manager.md section 1; decision DD-3: no new permission key, no second
 * definition of a team). Resolved once per request; every read of the eight manager pages filters by the {@link View}, and a row outside it is the generic
 * 404 ({@link #require}, {@link #requireConsultant}), never an existence oracle.
 *
 * <p>The caller must hold {@code workload.view} at TEAM scope or wider (a Marketing Manager; an Org Admin or Owner holds it at ORG and sees everyone) and the
 * marketing module must be on. A caller holding the key at ASSIGNED or OWN, or not at all, gets the same 404 as a stranger.
 * <ul>
 *   <li>ORG: {@code all = true}; the marketers are every ACTIVE member holding a marketing role, the consultants everyone those marketers carry.</li>
 *   <li>TEAM / DEPARTMENT: the marketers are the ACTIVE members holding a marketing role who are the caller's direct reports
 *       ({@code org_member.manager_member_id}) or whom the existing scope rule reaches ({@link JpaScopeDirectory#membersInScope}, every id confirmed by
 *       {@link ScopeEvaluator}); the consultants are those named as marketer or backup of any of them.</li>
 * </ul>
 * A manager with no marketers is a valid, empty team (the pages show their empty state): it is never a 404.
 *
 * <p>E1: nothing here reads or writes a submission; this class only says who is whose.
 */
@Service
public class TeamScope {

    /** The key that defines the team (docs section 1). */
    public static final String KEY = "workload.view";

    static final List<String> MARKETING_ROLE_KEYS = List.of(RoleTemplates.MARKETING_SPECIALIST, RoleTemplates.MARKETING_MANAGER);

    /**
     * What the caller's team is. {@code all} means an organization-wide caller: {@code marketerMemberIds} then holds every marketer of the organization and
     * {@code consultantIds} every consultant they carry (unassigned consultants are reachable through {@link #requireConsultant}).
     */
    public record View(Long orgId, Long managerMemberId, boolean all, Set<Long> marketerMemberIds, Set<Long> consultantIds) {
        public View {
            marketerMemberIds = marketerMemberIds == null ? Set.of() : Set.copyOf(marketerMemberIds);
            consultantIds = consultantIds == null ? Set.of() : Set.copyOf(consultantIds);
        }

        /** True when the team has no marketer (the pages' "Build your team" state). */
        public boolean empty() {
            return marketerMemberIds.isEmpty();
        }

        public boolean hasMarketer(Long memberId) {
            return memberId != null && marketerMemberIds.contains(memberId);
        }

        public boolean hasConsultant(Long consultantId) {
            return consultantId != null && consultantIds.contains(consultantId);
        }
    }

    private final OrgRoleService roles;
    private final TenantModules modules;
    private final AuthorizationService authorization;
    private final JpaScopeDirectory directory;
    private final ScopeEvaluator scopes;
    private final TeamScopeRepository repository;
    private final ConsultantProfileRepository consultants;

    public TeamScope(
        OrgRoleService roles,
        TenantModules modules,
        AuthorizationService authorization,
        JpaScopeDirectory directory,
        ScopeEvaluator scopes,
        TeamScopeRepository repository,
        ConsultantProfileRepository consultants
    ) {
        this.roles = roles;
        this.modules = modules;
        this.authorization = authorization;
        this.directory = directory;
        this.scopes = scopes;
        this.repository = repository;
        this.consultants = consultants;
    }

    /** Gate on {@code workload.view} (READ) and resolve the caller's team. Throws {@link OrgNotFoundException} (404) otherwise. */
    @Transactional(readOnly = true)
    public View resolve(OrgMembership me) {
        return resolve(me, AuthzOperation.READ);
    }

    /**
     * {@link #resolve(OrgMembership)} that also requires the page's own permission keys (all of them, at the given operation) through the fixed authorization
     * order: a manager page asks for {@code approvals.decide}, {@code escalations.manage} and so on in addition to the key that defines the team.
     */
    @Transactional(readOnly = true)
    public View resolve(OrgMembership me, AuthzOperation operation, String... pageKeys) {
        if (me == null || me.orgId() == null || me.memberId() == null || !roles.rolesFromData(me.orgId()) || !modules.isOn(TenantModule.MARKETING, me.orgId())) {
            throw new OrgNotFoundException();
        }
        List<String> keys = new ArrayList<>();
        keys.add(KEY);
        if (pageKeys != null) for (String k : pageKeys) if (k != null && !keys.contains(k)) keys.add(k);
        authorization.require(AuthzRequest.of(me.orgId(), keys, Beneficiary.NONE, null, operation == null ? AuthzOperation.READ : operation).withActor(me));
        PermissionScope scope = me.scopeFor(KEY).orElseThrow(OrgNotFoundException::new);
        if (scope != PermissionScope.ORG && scope != PermissionScope.TEAM && scope != PermissionScope.DEPARTMENT) throw new OrgNotFoundException();

        Long orgId = me.orgId();
        Set<Long> marketing = new HashSet<>(repository.findActiveMemberIdsWithRoleKeys(orgId, MARKETING_ROLE_KEYS));
        Set<Long> marketers;
        boolean all = scope == PermissionScope.ORG;
        if (all) {
            marketers = marketing;
        } else {
            Set<Long> reach = new HashSet<>();
            for (Long id : directory.membersInScope(me, KEY)) if (marketing.contains(id) && scopes.inScope(me, scope, id)) reach.add(id);
            for (Long id : repository.findActiveDirectReportIds(orgId, me.memberId())) if (marketing.contains(id)) reach.add(id);
            marketers = reach;
        }
        Set<Long> consultantIds = marketers.isEmpty() ? Set.of() : new HashSet<>(repository.findConsultantIdsCarriedBy(orgId, marketers));
        return new View(orgId, me.memberId(), all, marketers, consultantIds);
    }

    /** A marketer outside the team is the same 404 as one that does not exist. */
    public void require(View view, Long marketerMemberId) {
        if (view == null || !view.hasMarketer(marketerMemberId)) throw new OrgNotFoundException();
    }

    /** A consultant outside the team is the same 404 as one that does not exist; an organization-wide caller reaches every consultant of the organization. */
    @Transactional(readOnly = true)
    public void requireConsultant(View view, Long consultantId) {
        if (view == null || consultantId == null) throw new OrgNotFoundException();
        if (view.all()) {
            if (consultants.findByOrgIdAndId(view.orgId(), consultantId).isEmpty()) throw new OrgNotFoundException();
            return;
        }
        if (!view.hasConsultant(consultantId)) throw new OrgNotFoundException();
    }
}
