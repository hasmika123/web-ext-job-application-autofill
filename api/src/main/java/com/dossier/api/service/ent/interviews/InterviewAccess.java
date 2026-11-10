package com.dossier.api.service.ent.interviews;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.ent.applications.ApplicationAccess;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Who may see and change which interviews. Reading needs {@code pipeline.view} (the scope it is held at decides the rows, exactly as on
 * the Applications board); writing needs {@code interviews.coordinate} at a scope that covers the interview. An interview belongs to the
 * marketer of its application, or of its consultant's assignment when it has no application; ORG covers all of them, narrower scopes the
 * interviews whose marketer is in the caller's reach. Everything that fails (no key, out of scope, another tenant, a closed
 * organization) is the same generic 404.
 */
@Component("entInterviewAccess")
public class InterviewAccess {

    public static final String KEY_VIEW = ApplicationAccess.KEY_VIEW;
    public static final String KEY_COORDINATE = "interviews.coordinate";
    public static final List<String> WRITE_KEYS = List.of(KEY_COORDINATE);

    private final ApplicationAccess apps;

    public InterviewAccess(ApplicationAccess apps) {
        this.apps = apps;
    }

    public PermissionScope requireView(OrgMembership me) {
        return apps.requireView(me);
    }

    /** The marketer seat ids whose interviews the caller sees, or {@code null} for every interview of the organization. */
    public Set<Long> marketersVisible(OrgMembership me, PermissionScope scope) {
        return apps.marketersVisible(me, scope);
    }

    public Optional<PermissionScope> writeScope(OrgMembership me) {
        return apps.widest(me, WRITE_KEYS);
    }

    public PermissionScope requireWriteScope(OrgMembership me) {
        PermissionScope scope = writeScope(me).orElseThrow(OrgNotFoundException::new);
        apps.requireWritable(me, WRITE_KEYS);
        return scope;
    }

    /** True when the caller may write and one of {@code marketerIds} (the interview's) falls inside their write scope. */
    public boolean canWrite(OrgMembership me, Set<Long> marketerIds) {
        Optional<PermissionScope> scope = writeScope(me);
        if (scope.isEmpty()) return false;
        if (!com.dossier.api.service.ent.authz.OrgStateRules.allows(me.orgStatus(), com.dossier.api.service.ent.authz.AuthzOperation.WRITE, WRITE_KEYS)) return false;
        Set<Long> visible = apps.marketersVisible(me, scope.get());
        if (visible == null) return true;
        Set<Long> mine = new HashSet<>(marketerIds);
        mine.retainAll(visible);
        return !mine.isEmpty();
    }

    public void requireWrite(OrgMembership me, Set<Long> marketerIds) {
        if (!canWrite(me, marketerIds)) throw new OrgNotFoundException();
    }

    /** True when {@code marketerIds} intersect the caller's reach at {@code scope} (ORG: always). */
    public boolean covers(OrgMembership me, PermissionScope scope, Set<Long> marketerIds) {
        Set<Long> visible = apps.marketersVisible(me, scope);
        if (visible == null) return true;
        for (Long id : marketerIds) if (id != null && visible.contains(id)) return true;
        return false;
    }
}
