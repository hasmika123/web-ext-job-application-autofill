package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Who may see and change which groups (X4.5). Organizations outside the Enterprise flag keep the original rules (everyone who may
 * read sees every group). Inside it a person who holds a read permission at ORG scope sees every group; anyone else sees the groups
 * they sit in or lead and the teams inside departments they sit in or lead (05 section 4: a lead counts as a member). A group
 * the viewer cannot see answers the generic 404, exactly like a group of another organization.
 */
@Component
public class OrgGroupAccess {

    /** Holding any of these at some scope lets a person read the structure of the organization (HR holds {@code groups.manage}, not {@code member.view_summary}). */
    static final List<String> READ_KEYS = List.of("groups.manage", "members.group.set", "members.invite", "member.view_summary", "hr.view", "dashboard.view_org");

    public static final String MANAGE_KEY = "groups.manage";

    private final EnterpriseFeatureFlag flag;

    public OrgGroupAccess(EnterpriseFeatureFlag flag) {
        this.flag = flag;
    }

    /** True when the organization is inside the Enterprise flag (the new rules, If-Match and the empty-only delete apply). */
    public boolean enterprise(Long orgId) {
        return orgId != null && flag.isEnabled(orgId);
    }

    /** The widest scope at which the member holds any read key, or empty when they hold none. */
    public Optional<PermissionScope> readScope(OrgMembership me) {
        PermissionScope widest = null;
        for (String k : READ_KEYS) widest = PermissionScope.widest(widest, me.scopeFor(k).orElse(null));
        return Optional.ofNullable(widest);
    }

    public Optional<PermissionScope> manageScope(OrgMembership me) {
        return me.scopeFor(MANAGE_KEY);
    }

    /** The ids of the groups the member may see, or {@code null} when they may see all of them. */
    public Set<Long> visible(OrgMembership me, OrgGroupSnapshot.View view) {
        if (!enterprise(me.orgId())) return null;
        PermissionScope scope = readScope(me).orElse(null);
        if (scope == null) return Set.of();
        if (scope == PermissionScope.ORG) return null;
        Set<Long> out = new HashSet<>();
        OrgGroupSnapshot.Seat mine = view.seat(me.memberId());
        if (mine != null) {
            if (mine.teamId() != null) out.add(mine.teamId());
            if (mine.departmentId() != null) out.add(mine.departmentId());
            if (mine.cohortId() != null) out.add(mine.cohortId());
        }
        for (OrgGroup g : view.ledBy(me.memberId())) out.add(g.getId());
        for (Long id : Set.copyOf(out)) {
            OrgGroup g = view.group(id);
            if (g != null && g.getKind() == OrgGroupKind.DEPARTMENT) for (OrgGroup t : view.teamsUnder(id)) out.add(t.getId());
        }
        return out;
    }

    /** True when the member may see this group. */
    public boolean canSee(OrgMembership me, OrgGroupSnapshot.View view, OrgGroup g) {
        Set<Long> vis = visible(me, view);
        return vis == null || vis.contains(g.getId());
    }
}
