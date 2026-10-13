package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.service.dto.ent.DashboardDTO.Activity;
import com.dossier.api.service.dto.ent.DashboardDTO.ActivityItem;
import com.dossier.api.service.org.OrgAuditService;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

/**
 * {@code activity.recent}: the last ten rows of the organization's own audit trail, newest first, for members who hold
 * {@code audit.view}. The audit permission can carry a row filter (finance sees billing and operations rows only, HR sees member
 * rows only); when every role that grants it is filtered, the feed is filtered the same way. Free-text details are never sent:
 * the page gets who, what kind of action, to whom and when.
 */
@Component
public class ActivityRecentProvider implements DashboardWidgetProvider {

    static final int LIMIT = 10;
    private static final String NONE = "~none~";

    private final OrgRolePermissionRepository permissions;
    private final UserRepository users;

    public ActivityRecentProvider(OrgRolePermissionRepository permissions, UserRepository users) {
        this.permissions = permissions;
        this.users = users;
    }

    @Override
    public String key() {
        return "activity.recent";
    }

    @Override
    public int order() {
        return 120;
    }

    @Override
    public List<String> permissions() {
        return List.of("audit.view");
    }

    @Override
    public String module() {
        return null;
    }

    @Override
    public WidgetResult compute(DashboardContext ctx) {
        Set<String> filters = rowFilters(ctx);
        PageRequest page = PageRequest.of(0, LIMIT);
        List<OrgAuditEvent> rows;
        if (filters.isEmpty()) {
            rows = ctx.repo().latestAudit(ctx.orgId(), page);
        } else {
            List<String> prefixes = new ArrayList<>();
            if (filters.contains(OrgRolePermission.ROW_FILTER_BILLING_OPS)) prefixes.addAll(List.of(OrgAuditService.PREFIX_BILLING + "%", OrgAuditService.PREFIX_OPS + "%"));
            if (filters.contains(OrgRolePermission.ROW_FILTER_HR)) prefixes.addAll(List.of("MEMBER_%", "ASSIGNMENT_%"));
            while (prefixes.size() < 4) prefixes.add(NONE);
            rows = ctx.repo().latestAuditWithPrefixes(ctx.orgId(), prefixes.get(0), prefixes.get(1), prefixes.get(2), prefixes.get(3), page);
        }
        if (rows.isEmpty()) return WidgetResult.empty("NO_ACTIVITY");
        Set<String> logins = new HashSet<>();
        for (OrgAuditEvent e : rows) {
            logins.add(e.getActorLogin());
            if (e.getTargetLogin() != null) logins.add(e.getTargetLogin());
        }
        Map<String, String> names = new HashMap<>();
        for (User u : users.findAllByLoginIn(logins)) names.put(u.getLogin(), displayName(u));
        List<ActivityItem> items = rows
            .stream()
            .map(e ->
                new ActivityItem(
                    e.getId(),
                    e.getAction(),
                    label(e),
                    e.getActorLogin(),
                    names.get(e.getActorLogin()),
                    e.getTargetType(),
                    e.getTargetLogin(),
                    e.getTargetLogin() == null ? null : names.get(e.getTargetLogin()),
                    e.getCreatedAt()
                )
            )
            .toList();
        return WidgetResult.ok(new Activity(items));
    }

    /** The row filters of the roles that grant {@code audit.view}; empty when any role grants it unfiltered (or none is recorded: the legacy grant is whole). */
    private Set<String> rowFilters(DashboardContext ctx) {
        List<Long> roleIds = ctx.me().roles().stream().map(r -> r.roleId()).filter(Objects::nonNull).toList();
        if (roleIds.isEmpty()) return Set.of();
        Set<String> filters = new HashSet<>();
        for (OrgRolePermission p : permissions.findForRoles(ctx.orgId(), roleIds)) {
            if (!"audit.view".equals(p.getPermissionKey())) continue;
            if (p.getRowFilter() == null) return Set.of();
            filters.add(p.getRowFilter());
        }
        return filters;
    }

    private static String displayName(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last = u.getLastName() == null ? "" : u.getLastName().trim();
        String full = (first + " " + last).trim();
        return full.isEmpty() ? null : full;
    }

    /** A short human label for an audit action key (no free text from the row). */
    static String label(OrgAuditEvent e) {
        return switch (e.getAction()) {
            case OrgAuditService.ORG_CREATE -> "created the organization";
            case OrgAuditService.ORG_SETTINGS -> "changed the organization settings";
            case OrgAuditService.MEMBER_INVITE -> "invited a member";
            case OrgAuditService.MEMBER_INVITE_RESEND -> "resent an invitation";
            case OrgAuditService.MEMBER_ROLE -> "changed a member's role";
            case OrgAuditService.MEMBER_SUSPEND -> "suspended or reinstated a member";
            case OrgAuditService.MEMBER_REMOVE -> "removed a member";
            case OrgAuditService.MEMBER_LEFT -> "left the organization";
            case OrgAuditService.ASSIGNMENT_CREATE -> "assigned a consultant";
            case OrgAuditService.ASSIGNMENT_END -> "ended an assignment";
            case OrgAuditService.GROUP_CREATE -> "created a department or team";
            case OrgAuditService.GROUP_UPDATE -> "changed a department or team";
            case OrgAuditService.GROUP_DELETE -> "deleted a department or team";
            case OrgAuditService.BRANDING_PUBLISH -> "published the branding";
            case OrgAuditService.BRANDING_RESTORE -> "restored an earlier branding";
            case OrgAuditService.BRANDING_ASSET -> "changed a branding image";
            case "ROLE_CREATE" -> "created a role";
            case "ROLE_UPDATE" -> "changed a role";
            case "ROLE_DELETE" -> "deleted a role";
            case "ROLE_ASSIGN" -> "assigned a role";
            case "ROLE_REVOKE" -> "removed a role";
            default -> e.getAction().toLowerCase(java.util.Locale.ROOT).replace('_', ' ');
        };
    }
}
