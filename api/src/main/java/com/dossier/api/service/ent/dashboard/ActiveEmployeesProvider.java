package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** {@code employees.active}: ACTIVE seats that are not consultants (the staff who run the organization), with the real 30-day change. */
@Component
public class ActiveEmployeesProvider implements DashboardWidgetProvider {

    static final List<String> PERMISSIONS = List.of("hr.view", "members.invite");

    @Override
    public String key() {
        return "employees.active";
    }

    @Override
    public int order() {
        return 20;
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
        Set<Long> consultants = ctx.consultantSeatIds();
        List<Long> staffIds = ctx.seats().stream().map(DashboardContext.Seat::id).filter(id -> !consultants.contains(id)).toList();
        Set<Long> inScope = ctx.inScope(PERMISSIONS, staffIds);
        List<DashboardContext.Seat> history = ctx.seats().stream().filter(s -> inScope.contains(s.id())).toList();
        if (history.stream().noneMatch(s -> OrgMemberStatus.LIVE.contains(s.status()))) return WidgetResult.empty("NO_EMPLOYEES");
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("active", history.stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).count());
        counts.put("invited", history.stream().filter(s -> s.status() == OrgMemberStatus.INVITED).count());
        counts.put("suspended", history.stream().filter(s -> s.status() == OrgMemberStatus.SUSPENDED).count());
        return WidgetResult.ok(StatTiles.of(history, ctx.now(), counts));
    }
}
