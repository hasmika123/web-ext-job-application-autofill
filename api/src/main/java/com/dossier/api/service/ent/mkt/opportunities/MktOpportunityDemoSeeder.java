package com.dossier.api.service.ent.mkt.opportunities;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demo data for the Opportunities board: the consultants' interest, the owners, the next actions and the activity feed over the opportunities
 * (requirement_match rows) that {@code TalentDemoSeeder} already created. It runs under the same switches as the other demo seeders
 * ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never under {@code prod}) once the application is READY, which is after the
 * {@code EnterpriseDemoBootstrap} runner has seeded the tenants and the talent data (so no shared class needs an edit to hook it in).
 *
 * <p><b>Idempotent:</b> a match that already has an {@code mkt_opportunity} row (the consultant workspace seeder writes the consultants' answers first) is
 * left alone, so a second run adds nothing; an organization without talent data is skipped.
 * Interest follows the board's mix (32 % very interested, 28 % interested, 20 % open, 12 % not interested, 8 % no response). No PII: names stay
 * where the talent seeder put them, events carry only short verb phrases.
 */
@Component
public class MktOpportunityDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktOpportunityDemoSeeder.class);

    private static final String[] INTEREST = {"VERY_INTERESTED", "INTERESTED", "OPEN", "NOT_INTERESTED", "NO_RESPONSE"};
    private static final int[] WEIGHT = {32, 28, 20, 12, 8};
    private static final Map<String, String> VERB = Map.of(
        "VERY_INTERESTED", "marked as Very Interested", "INTERESTED", "marked as Interested", "OPEN", "marked as Open to it", "NOT_INTERESTED", "marked as Not Interested"
    );
    /** Rows that get marketing state per organization: every open assigned one plus the best suggestions up to this many. */
    static final int TARGET = 90;

    private final EnterpriseDemoSeeder base;
    private final OrganizationRepository orgs;
    private final MktOpportunityRepository repo;
    private final MktOpportunityEventRepository eventRepo;
    private final PlatformTransactionManager tx;

    public MktOpportunityDemoSeeder(EnterpriseDemoSeeder base, OrganizationRepository orgs, MktOpportunityRepository repo, MktOpportunityEventRepository eventRepo, PlatformTransactionManager tx) {
        this.base = base;
        this.orgs = orgs;
        this.repo = repo;
        this.eventRepo = eventRepo;
        this.tx = tx;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            seed();
        } catch (RuntimeException e) {
            LOG.error("Opportunities demo seed failed; the Opportunities page has no demo interest data.", e);
        }
    }

    /** Seeds every demo organization that has talent data and no opportunity state yet. Returns the number of opportunities created. */
    public int seed() {
        if (base.refusal() != null) return 0;
        int total = 0;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            Integer made = new TransactionTemplate(tx).execute(status -> seedOrg(org.getId()));
            total += made == null ? 0 : made;
        }
        return total;
    }

    int seedOrg(Long orgId) {
        List<MktOpportunityRow> rows = repo.findRows(orgId).stream().filter(r -> "OPEN".equals(r.requirementStatus()) || "IN_REVIEW".equals(r.requirementStatus())).toList();
        if (rows.isEmpty()) return 0; // no talent data yet
        Random rnd = new Random(orgId * 31 + 7);
        Instant now = Instant.now();

        List<MktOpportunityRow> pick = new ArrayList<>(rows.stream().filter(r -> "ASSIGNED".equals(r.matchStatus())).toList());
        int room = Math.max(0, TARGET - pick.size());
        rows.stream().filter(r -> "SUGGESTED".equals(r.matchStatus())).sorted(Comparator.comparing(MktOpportunityRow::score).reversed().thenComparing(MktOpportunityRow::matchId)).limit(room).forEach(pick::add);

        Set<Long> have = repo.findByOrgId(orgId).stream().map(MktOpportunity::getMatchId).collect(Collectors.toSet());
        int made = 0;
        for (MktOpportunityRow r : pick) {
            if (have.contains(r.matchId())) continue; // idempotent, and keeps the consultants' own answers
            String interest = draw(rnd);
            long ageDays = rnd.nextInt(100) < 70 ? rnd.nextInt(14) : rnd.nextInt(100) < 85 ? 14 + rnd.nextInt(16) : 30 + rnd.nextInt(40);
            Instant updated = now.minus(Duration.ofDays(ageDays)).minus(Duration.ofMinutes(rnd.nextInt(60 * 14)));
            boolean assigned = "ASSIGNED".equals(r.matchStatus());

            MktOpportunity o = new MktOpportunity();
            o.setOrgId(orgId);
            o.setMatchId(r.matchId());
            o.setInterest(interest);
            if (assigned) { // the lifecycle state follows what the consultant said, like the Phase 1 backfill (SUGGESTED overlays stay at the default)
                if ("VERY_INTERESTED".equals(interest) || "INTERESTED".equals(interest)) o.setState("INTERESTED");
                else if ("NOT_INTERESTED".equals(interest)) {
                    o.setState("DECLINED");
                    o.setDeclineReason("NOT_INTERESTED");
                }
            }
            o.setOwnerMemberId(r.assignedMarketerId());
            o.setNextActionAt(rnd.nextInt(10) == 0 ? null : now.plus(Duration.ofHours(rnd.nextInt(24 * 5))));
            o.setLastResponseAt("NO_RESPONSE".equals(interest) ? null : updated.minus(Duration.ofHours(rnd.nextInt(24))));
            o.setInterestRequestedAt(assigned ? updated.minus(Duration.ofDays(1 + rnd.nextInt(3))) : null);
            o.setCreatedAt(updated.minus(Duration.ofDays(1 + rnd.nextInt(5))));
            o.setUpdatedAt(updated);
            o = repo.save(o);
            made++;

            List<MktOpportunityEvent> events = new ArrayList<>();
            if (assigned) events.add(event(o, "ASSIGNED", r.assignedMarketerId(), "was assigned to this opportunity", o.getCreatedAt()));
            if (assigned && o.getInterestRequestedAt() != null) events.add(event(o, "INTEREST_REQUESTED", r.assignedMarketerId(), "was asked for their interest", o.getInterestRequestedAt()));
            if (!"NO_RESPONSE".equals(interest)) events.add(event(o, "INTEREST_CHANGED", null, VERB.get(interest), o.getLastResponseAt()));
            else if (rnd.nextBoolean()) events.add(event(o, "REVIEWED", r.assignedMarketerId(), "reviewed opportunity", updated));
            for (var ev : events) eventRepo.save(ev);
        }
        LOG.info("Opportunities demo seeded for org {}: {} opportunities", orgId, made);
        return made;
    }

    private static MktOpportunityEvent event(MktOpportunity o, String kind, Long actor, String text, Instant at) {
        MktOpportunityEvent e = new MktOpportunityEvent();
        e.setOrgId(o.getOrgId());
        e.setOpportunityId(o.getId());
        e.setKind(kind);
        e.setActorMemberId(actor);
        e.setText(text);
        e.setOccurredAt(at);
        return e;
    }

    private static String draw(Random rnd) {
        int n = rnd.nextInt(100);
        int acc = 0;
        for (int i = 0; i < WEIGHT.length; i++) {
            acc += WEIGHT[i];
            if (n < acc) return INTEREST[i];
        }
        return INTEREST[INTEREST.length - 1];
    }
}
