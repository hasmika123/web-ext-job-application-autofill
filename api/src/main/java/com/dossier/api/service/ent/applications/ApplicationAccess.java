package com.dossier.api.service.ent.applications;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.talent.TalentApplication;
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
 * Who may see and change which applications (docs/enterprise-v2/talent-foundation.md section 4). Reading needs {@code pipeline.view}; the
 * scope it is held at decides the rows: ORG = every application, TEAM / DEPARTMENT = applications whose marketer is in the caller's team,
 * ASSIGNED / OWN = applications the caller is the marketer of. Writes need one of the recording keys, at a scope that covers the application.
 * Everything that fails (no key, out of scope, a foreign tenant, a closed organization) is the same generic 404.
 */
@Component
public class ApplicationAccess {

    public static final String KEY_VIEW = "pipeline.view";
    public static final String KEY_PREPARE = "submissions.prepare";
    public static final String KEY_RECORD = "submissions.record";
    public static final String KEY_FOLLOWUP = "followups.manage";
    public static final String KEY_OFFERS = "offers.manage";
    public static final String KEY_OPPORTUNITIES = "opportunities.manage";
    public static final String KEY_REASSIGN = "assignments.manage";

    /** Any of these lets a caller edit the next action, add a note or move a stage along the stages they may record. */
    public static final List<String> WRITE_KEYS = List.of(KEY_PREPARE, KEY_RECORD, KEY_FOLLOWUP, KEY_OFFERS);
    /** Any of these lets a caller add an application (an assignment of a consultant to a job). */
    public static final List<String> CREATE_KEYS = List.of(KEY_PREPARE, KEY_OPPORTUNITIES);

    private final MemberAccess members;

    public ApplicationAccess(MemberAccess members) {
        this.members = members;
    }

    /** The scope the caller reads at; 404 when they hold no {@code pipeline.view}. */
    public PermissionScope requireView(OrgMembership me) {
        return me.scopeFor(KEY_VIEW).orElseThrow(OrgNotFoundException::new);
    }

    /** The marketer ids whose applications the caller sees, or {@code null} for every application of the organization. */
    public Set<Long> marketersVisible(OrgMembership me, PermissionScope scope) {
        if (scope == PermissionScope.ORG) return null;
        if (scope == PermissionScope.TEAM || scope == PermissionScope.DEPARTMENT) {
            Set<Long> ids = members.visibleIds(me, scope);
            return ids == null ? null : ids;
        }
        return Set.of(me.memberId());
    }

    /** The widest scope among {@code keys} the caller holds, or empty. */
    public Optional<PermissionScope> widest(OrgMembership me, List<String> keys) {
        return members.widest(me, keys);
    }

    /** A write needs the organization's state to allow it. */
    public void requireWritable(OrgMembership me, List<String> keys) {
        if (!OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, keys)) throw new OrgNotFoundException();
    }

    /** True when the caller holds one of {@code keys} at a scope that covers this application (its marketer). */
    public boolean canWrite(OrgMembership me, List<String> keys, TalentApplication app) {
        Optional<PermissionScope> scope = widest(me, keys);
        if (scope.isEmpty()) return false;
        if (!OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, keys)) return false;
        return covers(me, scope.get(), app.getMarketerMemberId());
    }

    /** True when {@code marketerId} falls inside {@code scope} for this caller (ORG covers everything, including unassigned). */
    public boolean covers(OrgMembership me, PermissionScope scope, Long marketerId) {
        Set<Long> ids = marketersVisible(me, scope);
        return ids == null || (marketerId != null && ids.contains(marketerId));
    }

    public void requireWrite(OrgMembership me, List<String> keys, TalentApplication app) {
        if (!canWrite(me, keys, app)) throw new OrgNotFoundException();
    }

    public boolean can(OrgMembership me, String key) {
        return me.canKey(key);
    }
}
