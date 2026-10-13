package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * {@code consultants.total}: members who hold the consultant role. The headline is the ACTIVE ones with their change over 30
 * days; invited and suspended are shown as parts. A team or department actor sees only the consultants inside their scope.
 */
@Component
public class ConsultantsTotalProvider implements DashboardWidgetProvider {

    static final List<String> PERMISSIONS = List.of("member.view_summary", "consultants.view");

    @Override
    public String key() {
        return "consultants.total";
    }

    @Override
    public int order() {
        return 10;
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
        Set<Long> inScope = ctx.inScope(PERMISSIONS, ctx.consultantSeatIds());
        List<DashboardContext.Seat> history = ctx.seats().stream().filter(s -> inScope.contains(s.id())).toList();
        List<DashboardContext.Seat> live = history.stream().filter(s -> OrgMemberStatus.LIVE.contains(s.status())).toList();
        if (live.isEmpty()) return WidgetResult.empty("NO_CONSULTANTS");
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("active", live.stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).count());
        counts.put("invited", live.stream().filter(s -> s.status() == OrgMemberStatus.INVITED).count());
        counts.put("suspended", live.stream().filter(s -> s.status() == OrgMemberStatus.SUSPENDED).count());
        // seats that left stay in the history, so the 30-day change is real
        return WidgetResult.ok(StatTiles.of(history, ctx.now(), counts));
    }
}
