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

    /** The board's order. {@code soonModule} is null when the target exists today. */
    private record Def(String key, String label, String description, String href, String permission, String soonModule) {}

    private static final List<Def> DEFS = List.of(
        new Def("invite-employee", "Invite Employee", "Add a new team member", "/w/admin/employees?invite=1", "members.invite", null),
        new Def("assign-marketer", "Assign Marketer", "Connect a marketer to consultants", "/w/admin/assignments", "assignments.manage", "marketing"),
        new Def("configure-licenses", "Configure Licenses", "Manage seats and features", "/w/admin/licenses", "licenses.manage", "billing"),
        new Def("review-applications", "Review Applications", "View pending applications", "/w/admin/applications", "member.view_summary", "applications"),
        new Def("view-pipeline", "View Pipeline", "See applications by stage", "/w/admin/pipeline", "pipeline.view", "applications"),
        new Def("configure-organization", "Configure Organization", "Settings and defaults", "/w/admin/settings", "org.settings.manage", "settings")
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
            .map(d -> new QuickAction(d.key(), d.label(), d.description(), d.href(), d.permission(), d.soonModule() == null, d.soonModule()))
            .toList();
        return items.isEmpty() ? WidgetResult.empty("NO_ACTIONS") : WidgetResult.ok(new QuickActions(items));
    }
}
