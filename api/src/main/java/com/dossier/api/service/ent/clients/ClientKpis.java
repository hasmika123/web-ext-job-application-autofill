package com.dossier.api.service.ent.clients;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.service.dto.ent.ClientDTO;
import com.dossier.api.service.ent.jobs.JobKpis;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/**
 * The four KPI tiles of the Clients page, computed from rows with an honest "last month" and a weekly sparkline per tile. Pure: the
 * caller passes the organization's rows and "now". A tile has no "previous" (and so no delta) when there is nothing older than a month
 * to compare with: never estimated.
 *
 * <ul>
 *   <li><b>Total Clients</b>: accounts not archived; last month = those created at least 30 days ago.</li>
 *   <li><b>Active Requirements</b>: requirements in status OPEN; last month = requirements that were open 30 days ago ({@link JobKpis#isOpenAt}).</li>
 *   <li><b>New Clients This Month</b>: accounts created in the last 30 days; last month = the 30 days before that.</li>
 *   <li><b>Placements via Clients</b>: placements recorded at a client (active and ended); last month = those started at least 30 days ago.</li>
 * </ul>
 */
public final class ClientKpis {

    public static final int WEEKS = JobKpis.WEEKS;
    static final Duration MONTH = Duration.ofDays(30);

    private ClientKpis() {}

    public record Tiles(ClientDTO.Tile total, ClientDTO.Tile requirements, ClientDTO.Tile fresh, ClientDTO.Tile placements) {}

    public static Tiles compute(List<ClientAccount> clients, List<ClientRequirement> reqs, List<TalentPlacement> placements, Instant now) {
        Instant monthAgo = now.minus(MONTH);
        boolean clientHistory = clients.stream().anyMatch(c -> c.getCreatedAt().isBefore(monthAgo));
        boolean reqHistory = reqs.stream().anyMatch(r -> r.getPostedAt() != null && r.getPostedAt().isBefore(monthAgo));
        boolean placementHistory = placements.stream().anyMatch(p -> startOf(p).isBefore(monthAgo));

        long total = clients.size();
        long openNow = reqs.stream().filter(r -> "OPEN".equals(r.getStatus())).count();
        long fresh = createdIn(clients, now.minus(MONTH), null);
        long freshBefore = createdIn(clients, now.minus(MONTH.multipliedBy(2)), now.minus(MONTH));
        long placed = placements.size();

        List<Long> totalSeries = new ArrayList<>();
        List<Long> openSeries = new ArrayList<>();
        List<Long> freshSeries = new ArrayList<>();
        List<Long> placedSeries = new ArrayList<>();
        for (int i = 0; i < WEEKS; i++) {
            Instant end = JobKpis.weekEndOf(now, i);
            boolean last = i == WEEKS - 1;
            totalSeries.add(last ? total : count(clients, c -> !c.getCreatedAt().isAfter(end)));
            openSeries.add(last ? openNow : count(reqs, r -> JobKpis.isOpenAt(r, end)));
            freshSeries.add(createdIn(clients, end.minus(MONTH), last ? null : end));
            placedSeries.add(last ? placed : count(placements, p -> !startOf(p).isAfter(end)));
        }
        return new Tiles(
            tile(total, clientHistory ? count(clients, c -> !c.getCreatedAt().isAfter(monthAgo)) : null, totalSeries),
            tile(openNow, reqHistory ? count(reqs, r -> JobKpis.isOpenAt(r, monthAgo)) : null, openSeries),
            tile(fresh, clientHistory ? freshBefore : null, freshSeries),
            tile(placed, placementHistory ? count(placements, p -> !startOf(p).isAfter(monthAgo)) : null, placedSeries)
        );
    }

    /** When a placement began: its start date at midnight UTC, or the time it was recorded. */
    static Instant startOf(TalentPlacement p) {
        LocalDate d = p.getStartDate();
        return d == null ? p.getCreatedAt() : d.atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    private static long createdIn(List<ClientAccount> clients, Instant fromInclusive, Instant toExclusive) {
        return count(clients, c -> !c.getCreatedAt().isBefore(fromInclusive) && (toExclusive == null || c.getCreatedAt().isBefore(toExclusive)));
    }

    private static <T> long count(List<T> rows, Predicate<T> test) {
        return rows.stream().filter(test).count();
    }

    static ClientDTO.Tile tile(long value, Long previous, List<Long> series) {
        if (previous == null) return new ClientDTO.Tile(value, null, null, null, series);
        long delta = value - previous;
        Double pct = previous > 0 ? Math.round(delta * 1000.0 / previous) / 10.0 : null;
        return new ClientDTO.Tile(value, previous, delta, pct, series);
    }
}
