package com.dossier.api.service.ent.dashboard;

import com.dossier.api.service.dto.ent.DashboardDTO.QuickAction;
import com.dossier.api.service.dto.ent.DashboardDTO.QuickActions;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * {@code quick.actions} (14 section 2.5): the six shortcuts the caller's permissions allow, each with a real route. A shortcut
 * whose page or module does not exist yet is {@code available = false} ("soon"), never a link to nothing. The story that builds
 * the page flips its flag here.
 */
@Component
public class QuickActionsProvider implements DashboardWidgetProvider {

    /**
     * The board's order. {@code exists} says whether the route is a page of the Admin menu today; {@code module} is the tenant module
     * its menu entry needs (null when none). A shortcut is available only when its page exists and its module is on, the same test the
     * sidebar applies, so a shortcut never leads where the menu does not.
     */
    private record Def(String key, String label, String description, String href, String permission, boolean exists, String module) {}


    private static final List<Def> DEFS = List.of(
        new Def("invite-employee", "Invite Employee", "Add a new team member", "/w/admin/employees?invite=1", "members.invite", true, null),
        new Def("assign-marketer", "Assign Marketer", "Connect a marketer to roles", "/w/admin/marketing-assignments", "assignments.manage", true, null),
        new Def("configure-licenses", "Configure Licenses", "Manage seats and permissions", "/w/admin/licenses", "licenses.manage", true, null),
        new Def("review-applications", "Review Applications", "View pending applications", "/w/admin/applications", "member.view_summary", true, null),
        new Def("view-pipeline", "View Pipeline", "See applications by stage", "/w/admin/pipeline", "pipeline.view", false, null),
        new Def("configure-organization", "Configure Organization", "Settings and defaults", "/w/admin/settings", "org.settings.manage", true, null)
    );

    @Override
    public String key() {
        return "quick.actions";
    }

    @Override
    public int order() {
        return 90;
    }

    @Override
    public List<String> permissions() {
        return DEFS.stream().map(Def::permission).distinct().toList();
    }

    @Override
    public String module() {
        return null;
    }

    @Override
    public WidgetResult compute(DashboardContext ctx) {
        List<QuickAction> items = DEFS
            .stream()
            .filter(d -> ctx.can(d.permission()))
            .map(d -> {
                boolean on = d.exists();
                return new QuickAction(d.key(), d.label(), d.description(), d.href(), d.permission(), on, on ? null : (d.module() != null ? d.module() : "pipeline"));
            })
            .toList();
        return items.isEmpty() ? WidgetResult.empty("NO_ACTIONS") : WidgetResult.ok(new QuickActions(items));
    }
}
