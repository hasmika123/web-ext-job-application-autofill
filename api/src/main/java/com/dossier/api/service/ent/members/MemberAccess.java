package com.dossier.api.service.ent.members;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.OrgScopeRepository;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.OrgStateRules;
import com.dossier.api.service.ent.authz.ScopeDirectory;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who may see and change which seats (X4.3, 05-permission-model.md section 4, 15-employees-and-teams.md). A seat is reachable when the
 * caller holds a permission key at a scope that {@link ScopeEvaluator} says covers it, so a TEAM-scoped manager sees their team and a
 * person with an ORG-wide people key sees everyone, with no second definition of "team" anywhere. Everything that fails is the generic
 * 404 ({@link OrgNotFoundException}): not holding the key, being out of scope, a closed organization for a write, a member of another
 * organization.
 *
 * <p><b>Viewing the directory</b> needs any one of the keys in {@link #VIEW_KEYS}; the widest scope among those held decides which rows the
 * list returns. A caller who holds one of the keys in {@link #ADMIN_KEYS} sees contact and consent details of the rows that key reaches; the
 * others (a marketing specialist reaching an assigned consultant) get the summary projection: name, status, roles, department and team.
 */
@Component
public class MemberAccess {

    /** Any of these opens the directory ("who works here"). */
    public static final List<String> VIEW_KEYS = List.of(
        "member.view_summary", "hr.view", "members.invite", "members.suspend", "members.remove", "members.role.set", "members.group.set", "members.manager.set",
        "lifecycle.manage"
    );

    /** Any of these shows a row in full (work email, manager, consent): the people-administration keys. */
    public static final List<String> ADMIN_KEYS = List.of(
        "hr.view", "members.invite", "members.suspend", "members.remove", "members.role.set", "members.group.set", "members.manager.set", "lifecycle.manage"
    );

    public static final String KEY_SUSPEND = "members.suspend";
    public static final String KEY_REMOVE = "members.remove";
    public static final String KEY_ROLE_SET = "members.role.set";
    public static final String KEY_GROUP_SET = "members.group.set";
    public static final String KEY_MANAGER_SET = "members.manager.set";
    public static final String KEY_AUDIT_VIEW = "audit.view";

    private final ScopeEvaluator scopes;
    private final ScopeDirectory directory;
    private final OrgScopeRepository scopeRepository;
    private final Clock clock;

    @Autowired
    public MemberAccess(ScopeEvaluator scopes, ScopeDirectory directory, OrgScopeRepository scopeRepository) {
        this(scopes, directory, scopeRepository, Clock.systemUTC());
    }

    MemberAccess(ScopeEvaluator scopes, ScopeDirectory directory, OrgScopeRepository scopeRepository, Clock clock) {
        this.scopes = scopes;
        this.directory = directory;
        this.scopeRepository = scopeRepository;
        this.clock = clock;
    }

    /** The widest scope the caller holds any of {@code keys} at; empty when they hold none. */
    public Optional<PermissionScope> widest(OrgMembership me, List<String> keys) {
        PermissionScope best = null;
        for (String key : keys) best = PermissionScope.widest(best, me.scopeFor(key).orElse(null));
        return Optional.ofNullable(best);
    }

    /** The scope that decides which rows of the directory the caller sees; a 404 when they hold no people key at all. */
    public PermissionScope requireViewScope(OrgMembership me) {
        return widest(me, VIEW_KEYS).orElseThrow(OrgNotFoundException::new);
    }

    /** The scope at which the caller holds the one key; a 404 when they do not hold it. */
    public PermissionScope requireScope(OrgMembership me, String key) {
        return me.scopeFor(key).orElseThrow(OrgNotFoundException::new);
    }

    /** A write needs the organization's state to allow it (a closed or suspended organization refuses people changes). */
    public void requireWritable(OrgMembership me, String... keys) {
        if (!OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(keys))) throw new OrgNotFoundException();
    }

    /** True when the caller holds {@code key} at a scope that covers {@code targetMemberId} (a member of THIS organization). */
    public boolean canAct(OrgMembership me, String key, Long targetMemberId) {
        Optional<PermissionScope> scope = me.scopeFor(key);
        return scope.isPresent() && targetMemberId != null && scopes.inScope(me, scope.get(), targetMemberId);
    }

    /** {@link #canAct} that answers the generic 404. */
    public void requireAct(OrgMembership me, String key, Long targetMemberId) {
        if (!canAct(me, key, targetMemberId)) throw new OrgNotFoundException();
    }

    /** True when the seat is reachable at {@code scope}. */
    public boolean covers(OrgMembership me, PermissionScope scope, Long targetMemberId) {
        return scope != null && targetMemberId != null && scopes.inScope(me, scope, targetMemberId);
    }

    /**
     * The ids of the seats {@code scope} reaches for this caller, or {@code null} for "every seat of the organization" (ORG scope: no
     * id list, the query just names the organization). Candidates are narrowed in SQL (the caller's groups, consultants with an
     * effective assignment) and every candidate is then confirmed by {@link ScopeEvaluator}, so the list can never show a row the
     * single-row check would refuse.
     */
    @Transactional(readOnly = true)
    public Set<Long> visibleIds(OrgMembership me, PermissionScope scope) {
        if (scope == PermissionScope.ORG) return null;
        Long orgId = me.orgId();
        Set<Long> candidates = new LinkedHashSet<>();
        candidates.add(me.memberId());
        if (scope == PermissionScope.OWN) return candidates;
        Instant now = Instant.now(clock);
        candidates.addAll(scopeRepository.findConsultantIdsWithEffectiveAssignments(orgId, now));
        if (scope == PermissionScope.TEAM || scope == PermissionScope.DEPARTMENT) {
            Set<Long> groups = new HashSet<>();
            Optional<ScopeDirectory.MemberFacts> mine = directory.member(orgId, me.memberId());
            mine.map(ScopeDirectory.MemberFacts::teamGroupId).ifPresent(groups::add);
            groups.addAll(directory.teamsLedBy(orgId, me.memberId()));
            if (scope == PermissionScope.DEPARTMENT) {
                Set<Long> departments = new HashSet<>(directory.departmentsLedBy(orgId, me.memberId()));
                mine.map(ScopeDirectory.MemberFacts::departmentGroupId).ifPresent(departments::add);
                groups.addAll(departments);
                groups.addAll(directory.teamsUnder(orgId, departments));
            }
            groups.remove(null);
            if (!groups.isEmpty()) candidates.addAll(scopeRepository.findLiveMemberIdsLinkedToGroups(orgId, groups));
        }
        candidates.remove(null);
        List<Long> kept = new ArrayList<>();
        for (Long id : candidates) if (scopes.inScope(me, scope, id)) kept.add(id);
        return new LinkedHashSet<>(kept);
    }
}
