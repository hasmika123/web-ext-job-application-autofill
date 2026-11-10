package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.service.dto.ent.DashboardDTO.Checklist;
import com.dossier.api.service.dto.ent.DashboardDTO.ChecklistItem;
import com.dossier.api.service.ent.RoleTemplates;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * {@code checklist}: the activation checklist of a new organization (14-organization-administration.md section 2.4). Every step is computed from
 * the organization's real state, never stored as a tick: branding published, a department added, the first employees invited or created, roles
 * given to them, consultants assigned to a marketer. When all five are done the widget is empty (the card hides); an administrator who dismisses
 * it hides it for 7 days (the same per-member dismissal the alerts use, under the key {@link #DISMISS_KEY}).
 */
@Component
public class ChecklistProvider implements DashboardWidgetProvider {

    static final List<String> PERMISSIONS = List.of("org.settings.manage");
    /** The key the dismiss route accepts for this card. */
    public static final String DISMISS_KEY = "CHECKLIST";

    @Override
    public String key() {
        return "checklist";
    }

    @Override
    public int order() {
        return 95;
    }

    @Override
    public List<String> permissions() {
        return PERMISSIONS;
    }

    @Override
    public String module() {
        return null;
    }

    @Override
    public WidgetResult compute(DashboardContext ctx) {
        var repo = ctx.repo();
        Long org = ctx.orgId();

        Set<Long> notEmployees = new HashSet<>(ctx.consultantSeatIds());
        notEmployees.addAll(repo.seatIdsHoldingTemplate(org, RoleTemplates.OWNER));
        notEmployees.addAll(repo.seatIdsHoldingTemplate(org, RoleTemplates.ORG_ADMIN));
        long employees = ctx.seats().stream().filter(s -> (s.status() == OrgMemberStatus.ACTIVE || s.status() == OrgMemberStatus.INVITED) && !notEmployees.contains(s.id())).count();
        long withRoles = repo
            .seatIdsHoldingOtherThan(org, List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.INVITED), List.of(RoleTemplates.OWNER, RoleTemplates.ORG_ADMIN, RoleTemplates.CONSULTANT))
            .size();

        List<ChecklistItem> items = new ArrayList<>();
        items.add(new ChecklistItem("branding", "Set your branding", "Your logo and colors on the sign-in page and every workspace.", repo.countPublishedBranding(org) > 0, "/w/admin/branding"));
        items.add(new ChecklistItem("department", "Add a department", "Group people the way your company is organized.", repo.countActiveDepartments(org) > 0, "/w/admin/departments"));
        items.add(new ChecklistItem("employees", "Invite or create your first employees", "Marketers, recruiters and managers who will run the work.", employees > 0, "/w/admin/employees"));
        items.add(new ChecklistItem("roles", "Assign roles", "Decide what each person can see and do.", withRoles > 0, "/w/admin/roles"));
        items.add(new ChecklistItem("assignments", "Assign consultants to a marketer", "A marketer prepares everything for the consultants they look after.", repo.countActiveMarketerAssignments(org) > 0, "/w/admin/marketing-assignments"));

        int done = (int) items.stream().filter(ChecklistItem::done).count();
        if (done == items.size()) return WidgetResult.empty("COMPLETE");
        if (repo.activeDismissalKeys(org, ctx.me().memberId(), ctx.now()).contains(DISMISS_KEY)) return WidgetResult.empty("DISMISSED");
        return WidgetResult.ok(new Checklist(done, items.size(), items));
    }
}
