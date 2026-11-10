package com.dossier.api.service.ent.placements;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.OrgStateRules;
import com.dossier.api.service.ent.members.MemberAccess;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Who may see and change which placements (docs/enterprise-v2/page-placements.md). Reading needs {@code placements.view} or {@code placements.manage}
 * (an Account Manager holds only the latter); the scope it is held at decides the rows: ORG = every placement, TEAM / DEPARTMENT = placements whose
 * account manager is in the caller's team, anything narrower = placements the caller is the account manager of. Writing needs {@code placements.manage}
 * at a scope that covers the placement. The bill rate is shown to {@code placements.manage} and {@code finance.view} only. Everything that fails (no
 * key, out of scope, a foreign tenant, a closed organization) is the same generic 404.
 */
@Component("entPlacementAccess")
public class PlacementAccess {

    public static final String KEY_VIEW = "placements.view";
    public static final String KEY_MANAGE = "placements.manage";
    public static final String KEY_FINANCE = "finance.view";
    public static final String KEY_ASSIGN = "assignments.manage";

    private static final List<String> READ_KEYS = List.of(KEY_VIEW, KEY_MANAGE);
    private static final List<String> WRITE_KEYS = List.of(KEY_MANAGE);

    private final MemberAccess members;

    public PlacementAccess(MemberAccess members) {
        this.members = members;
    }

    /** The scope the caller reads at; 404 when they hold neither key. */
    public PermissionScope requireView(OrgMembership me) {
        return members.widest(me, READ_KEYS).orElseThrow(OrgNotFoundException::new);
    }

    /** The account-manager seat ids whose placements the caller sees, or {@code null} for every placement of the organization. */
    public Set<Long> managersVisible(OrgMembership me, PermissionScope scope) {
        if (scope == PermissionScope.ORG) return null;
        if (scope == PermissionScope.TEAM || scope == PermissionScope.DEPARTMENT) return members.visibleIds(me, scope);
        return Set.of(me.memberId());
    }

    public boolean seesRates(OrgMembership me) {
        return me.canKey(KEY_MANAGE) || me.canKey(KEY_FINANCE);
    }

    /** The widest scope the caller may write at, or empty (no key, or the organization's state forbids writes). */
    public Optional<PermissionScope> writeScope(OrgMembership me) {
        Optional<PermissionScope> scope = members.widest(me, WRITE_KEYS);
        if (scope.isEmpty() || !OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, WRITE_KEYS)) return Optional.empty();
        return scope;
    }

    public boolean covers(OrgMembership me, PermissionScope scope, Long accountManagerId) {
        Set<Long> ids = managersVisible(me, scope);
        return ids == null || (accountManagerId != null && ids.contains(accountManagerId));
    }

    public boolean canWrite(OrgMembership me, TalentPlacement p) {
        return writeScope(me).map(s -> covers(me, s, p.getAccountManagerMemberId())).orElse(false);
    }

    public void requireWrite(OrgMembership me, TalentPlacement p) {
        if (!canWrite(me, p)) throw new OrgNotFoundException();
    }
}
