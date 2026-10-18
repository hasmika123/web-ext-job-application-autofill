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
        // the consultant directory (talent-foundation.md section 5), when the organization has one and the caller sees all of it
        boolean wholeOrg = ctx.scope(PERMISSIONS).filter(sc -> sc == com.dossier.api.domain.enumeration.PermissionScope.ORG).isPresent();
        long profiles = wholeOrg ? ctx.repo().countActiveConsultantProfiles(ctx.orgId()) : 0;
        if (profiles > 0) return fromDirectory(ctx, profiles);
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

    /** Active consultant profiles; previous = those that already existed 30 days ago; the parts are the availability mix. */
    private static WidgetResult fromDirectory(DashboardContext ctx, long value) {
        var repo = ctx.repo();
        Long org = ctx.orgId();
        long previous = repo.countActiveConsultantProfilesCreatedBy(org, ctx.now().minus(java.time.Duration.ofDays(StatTiles.COMPARE_DAYS)));
        List<Long> spark = TalentTiles.spark(TalentTiles.monthlyMarks(ctx.now()), value, t -> repo.countActiveConsultantProfilesCreatedBy(org, t));
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Object[] r : repo.consultantAvailability(org)) counts.put(String.valueOf(r[0]).toLowerCase(java.util.Locale.ROOT).replace('_', ' '), ((Number) r[1]).longValue());
        return WidgetResult.ok(TalentTiles.tile(value, previous, spark, "30d", counts));
    }
}
