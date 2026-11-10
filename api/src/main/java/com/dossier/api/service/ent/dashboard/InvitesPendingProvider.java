package com.dossier.api.service.ent.dashboard;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.service.dto.ent.DashboardDTO.Invites;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/** {@code invites.pending}: invited seats (and how many expire within 48 hours) and suspended seats: the people waiting on an admin. */
@Component
public class InvitesPendingProvider implements DashboardWidgetProvider {

    static final List<String> PERMISSIONS = List.of("members.invite", "members.suspend");

    @Override
    public String key() {
        return "invites.pending";
    }

    @Override
    public int order() {
        return 110;
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
        Set<Long> inScope = ctx.inScope(PERMISSIONS, ctx.seats().stream().map(DashboardContext.Seat::id).toList());
        List<DashboardContext.Seat> seats = ctx.seats().stream().filter(s -> inScope.contains(s.id())).toList();
        Instant soon = ctx.now().plus(Duration.ofHours(48));
        long invited = seats.stream().filter(s -> s.status() == OrgMemberStatus.INVITED).count();
        long expiring = seats
            .stream()
            .filter(s -> s.status() == OrgMemberStatus.INVITED && s.inviteExpiresAt() != null && s.inviteExpiresAt().isAfter(ctx.now()) && !s.inviteExpiresAt().isAfter(soon))
            .count();
        long suspended = seats.stream().filter(s -> s.status() == OrgMemberStatus.SUSPENDED).count();
        if (invited == 0 && suspended == 0) return WidgetResult.empty("NOTHING_PENDING");
        return WidgetResult.ok(new Invites(invited, expiring, suspended));
    }
}
