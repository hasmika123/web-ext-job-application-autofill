package com.dossier.api.service.ent.consultants;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.ent.members.MemberAccess;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Who may see and change which consultants (talent-foundation.md section 4). The permission keys are the existing registry ones; the scope the
 * caller holds {@code consultants.view} at decides the rows: ORG all, TEAM and DEPARTMENT the consultants whose marketer or backup is a seat in the
 * caller's reach, ASSIGNED the consultants whose marketer or backup is the caller, OWN the caller's own profile. Everything that fails is the
 * generic 404.
 */
@Component
public class ConsultantAccess {

    public static final String VIEW = "consultants.view";
    public static final String EDIT = "consultants.edit";
    public static final String ASSIGN = "assignments.manage";
    public static final String OPPORTUNITIES = "opportunities.manage";

    private final MemberAccess members;

    public ConsultantAccess(MemberAccess members) {
        this.members = members;
    }

    /** The rows a caller reaches: a JPQL clause for an alias of {@code ConsultantProfile} and the parameters it binds. */
    public record Reach(PermissionScope scope, Set<Long> marketerIds, Long ownMemberId) {
        public boolean all() {
            return scope == PermissionScope.ORG;
        }

        /** Empty for ORG, otherwise " and ..." restricting {@code alias} (a ConsultantProfile). */
        public String clause(String alias) {
            if (all()) return "";
            if (scope == PermissionScope.OWN) return " and " + alias + ".memberId = :reachOwn";
            return " and " + alias + ".id in (select ma.consultantId from MarketerAssignment ma where ma.orgId = " + alias + ".orgId and (ma.marketerMemberId in :reachM or ma.backupMemberId in :reachM))";
        }

        public void bind(Map<String, Object> params) {
            if (all()) return;
            if (scope == PermissionScope.OWN) params.put("reachOwn", ownMemberId);
            else params.put("reachM", marketerIds);
        }
    }

    /** The caller's reach over consultants; a 404 when they hold no view key at all. */
    public Reach reach(OrgMembership me) {
        PermissionScope scope = me.scopeFor(VIEW).orElseThrow(OrgNotFoundException::new);
        if (scope == PermissionScope.ORG || scope == PermissionScope.OWN) return new Reach(scope, null, me.memberId());
        Set<Long> ids = new LinkedHashSet<>();
        ids.add(me.memberId());
        if (scope == PermissionScope.TEAM || scope == PermissionScope.DEPARTMENT) {
            Set<Long> reach = members.visibleIds(me, scope);
            if (reach != null) ids.addAll(reach);
        }
        return new Reach(scope, ids, me.memberId());
    }

    /** The scope at which the caller holds {@code key}; a 404 when they do not hold it (or the organization's state refuses writes). */
    public PermissionScope require(OrgMembership me, String key) {
        return me.scopeFor(key).orElseThrow(OrgNotFoundException::new);
    }

    public boolean holds(OrgMembership me, String key) {
        return me.scopeFor(key).isPresent();
    }

    public void requireWritable(OrgMembership me, String... keys) {
        members.requireWritable(me, keys);
    }

    /** The marketers a caller may name as a target of an assignment: everybody for ORG, otherwise the seats of their own reach. */
    public Set<Long> assignableSeats(OrgMembership me) {
        PermissionScope scope = require(me, ASSIGN);
        if (scope == PermissionScope.ORG) return null;
        Set<Long> ids = new LinkedHashSet<>();
        ids.add(me.memberId());
        if (scope == PermissionScope.TEAM || scope == PermissionScope.DEPARTMENT) {
            Set<Long> reach = members.visibleIds(me, scope);
            if (reach != null) ids.addAll(reach);
        }
        return ids;
    }
}
