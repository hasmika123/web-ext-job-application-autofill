package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.resumes.ResumeBoardSearchRepository;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.OrgStateRules;
import com.dossier.api.service.ent.members.MemberAccess;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Who may see and change which resumes (talent-foundation.md section 4). Permission keys: {@code resumes.view_for} to see, {@code resumes.edit_for} to
 * change primary / visibility / add one, {@code resumes.approve_request} to approve or reject. The scope each is held at decides the rows:
 * ORG = every resume, TEAM / DEPARTMENT = consultants whose marketer (or backup) sits in the caller's team or department, ASSIGNED = the
 * caller's own consultants. Everything that fails (no key, out of scope, closed organization, another organization) is the generic 404.
 */
@Component
public class ResumeAccess {

    public static final String VIEW = "resumes.view_for";
    public static final String EDIT = "resumes.edit_for";
    public static final String APPROVE = "resumes.approve_request";

    private final MemberAccess members;

    public ResumeAccess(MemberAccess members) {
        this.members = members;
    }

    public boolean holds(OrgMembership me, String key) {
        return me.scopeFor(key).isPresent();
    }

    /** The reach of {@code key} for this caller; 404 when they do not hold it. */
    public ResumeBoardSearchRepository.Scope scope(OrgMembership me, String key) {
        PermissionScope held = me.scopeFor(key).orElseThrow(OrgNotFoundException::new);
        if (held == PermissionScope.ORG) return ResumeBoardSearchRepository.Scope.everything();
        if (held == PermissionScope.TEAM || held == PermissionScope.DEPARTMENT) {
            Set<Long> ids = members.visibleIds(me, held);
            return ResumeBoardSearchRepository.Scope.of(ids == null ? Set.of(me.memberId()) : ids);
        }
        return ResumeBoardSearchRepository.Scope.of(Set.of(me.memberId()));
    }

    /** Reaching resumes at all: viewing is the floor for every route of the board. */
    public ResumeBoardSearchRepository.Scope viewScope(OrgMembership me) {
        return scope(me, VIEW);
    }

    /** A write needs the organization's state to allow it (a closed or suspended organization refuses changes). */
    public void requireWritable(OrgMembership me, String key) {
        members.requireWritable(me, key);
    }

    /** True when the organization's state allows a write with this key (no exception; for the "what may I do" flags). */
    public boolean writable(OrgMembership me, String key) {
        return OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(key));
    }

    /** The scope of a write key, but only for someone who can also view (a write key alone reveals nothing). */
    public ResumeBoardSearchRepository.Scope writeScope(OrgMembership me, String key) {
        viewScope(me);
        requireWritable(me, key);
        return scope(me, key);
    }
}
