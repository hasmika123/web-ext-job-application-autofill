package com.dossier.api.service.ent;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.PlacementEvent;
import com.dossier.api.domain.ent.talent.PlacementExtension;
import com.dossier.api.domain.ent.talent.PlacementNote;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo data for the Placements page (docs/enterprise-v2/page-placements.md), on top of the talent foundation's placements. Same switches as the other
 * demo seeders (dev only, enterprise demo organizations only). First run for an organization (no placement event yet): gives every active placement an end
 * date so the Ending Soon figures are real, fills missing account manager / client contact / type, adds upcoming placements for consultants who are free,
 * a few extension requests and recorded extensions, redeployment-pool members and notes, and one CREATED event per placement. Later runs change nothing.
 * Dates are relative to now; the random stream is seeded per organization (the same story every time).
 */
@Service
public class PlacementDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(PlacementDemoSeeder.class);

    private final TalentDemoSeeder talent;
    private final OrganizationRepository orgs;
    private final UserRepository users;
    private final EntityManager em;

    public PlacementDemoSeeder(TalentDemoSeeder talent, OrganizationRepository orgs, UserRepository users, EntityManager em) {
        this.talent = talent;
        this.orgs = orgs;
        this.users = users;
        this.em = em;
    }

    @Transactional
    public Map<String, Integer> seed() {
        Map<String, Integer> done = new HashMap<>();
        if (talent.refusal() != null) return done;
        for (TalentDemoSeeder.Spec spec : TalentDemoSeeder.SPECS) {
            Organization org = orgs.findBySlug(spec.slug()).orElse(null);
            if (org == null) continue;
            User creator = org.getCreatedByUserId() == null ? null : users.findById(org.getCreatedByUserId()).orElse(null);
            if (creator == null || !EnterpriseDemoSeeder.isEnterpriseDemoLogin(creator.getLogin())) continue;
            long placements = count("select count(p) from TalentPlacement p where p.orgId = :o", org.getId());
            if (placements == 0) continue;
            fillGaps(org.getId());
            long events = count("select count(e) from PlacementEvent e where e.orgId = :o", org.getId());
            if (events > 0) continue; // already seeded: idempotent
            int n = new Gen(org.getId(), spec.seed()).run();
            done.put(spec.slug(), n);
            LOG.info("Placements demo seeded for {}: {} rows touched", spec.slug(), n);
        }
        return done;
    }

    private long count(String jpql, Long orgId) {
        return ((Number) em.createQuery(jpql).setParameter("o", orgId).getSingleResult()).longValue();
    }

    /** Rows seeded before the page existed (or by a fresh database) have no account manager, contact or type: derive them from the marketer assignment, the client and the job. */
    private void fillGaps(Long orgId) {
        em.createQuery(
            "update TalentPlacement p set p.accountManagerMemberId = (select ma.marketerMemberId from MarketerAssignment ma where ma.orgId = p.orgId and ma.consultantId = p.consultantId)" +
            " where p.orgId = :o and p.accountManagerMemberId is null"
        ).setParameter("o", orgId).executeUpdate();
        em.createQuery(
            "update TalentPlacement p set p.clientContactId = (select min(cc.id) from ClientContact cc where cc.orgId = p.orgId and cc.clientId = p.clientId)" +
            " where p.orgId = :o and p.clientContactId is null"
        ).setParameter("o", orgId).executeUpdate();
        em.createQuery(
            "update TalentPlacement p set p.placementType = (select r.employmentLabel from ClientRequirement r where r.orgId = p.orgId and r.id = p.requirementId)" +
            " where p.orgId = :o and p.requirementId is not null and exists (select 1 from ClientRequirement r2 where r2.orgId = p.orgId and r2.id = p.requirementId and r2.employmentLabel in ('CONTRACT', 'FTE', 'C2C'))"
        ).setParameter("o", orgId).executeUpdate();
        em.flush();
        em.clear();
    }

    private final class Gen {
        final Long orgId;
        final Random rnd;
        final Instant now = Instant.now();
        final LocalDate today = LocalDate.now(ZoneOffset.UTC);
        int touched;

        Gen(Long orgId, long seed) {
            this.orgId = orgId;
            this.rnd = new Random(seed * 31 + 7);
        }

        int between(int lo, int hi) {
            return lo + rnd.nextInt(hi - lo + 1);
        }

        Instant daysAgo(int d) {
            return now.minus(d, ChronoUnit.DAYS).minusSeconds(rnd.nextInt(80_000));
        }

        @SuppressWarnings("unchecked")
        int run() {
            List<TalentPlacement> all = em.createQuery("select p from TalentPlacement p where p.orgId = :o order by p.id", TalentPlacement.class).setParameter("o", orgId).getResultList();
            List<TalentPlacement> active = new ArrayList<>();
            List<TalentPlacement> ended = new ArrayList<>();
            for (TalentPlacement p : all) (p.getStatus().equals("ENDED") ? ended : active).add(p);
            // 1. an end date for every active placement: some close, most later
            for (TalentPlacement p : active) {
                if (p.getEndDate() != null) continue;
                int roll = rnd.nextInt(100);
                int left = roll < 12 ? between(3, 14) : roll < 26 ? between(15, 45) : roll < 36 ? between(46, 90) : between(91, 420);
                LocalDate end = today.plusDays(left);
                LocalDate floor = p.getStartDate().plusDays(45);
                p.setEndDate(end.isBefore(floor) ? floor : end);
                touched++;
            }
            em.flush();
            // 2. every placement gets a CREATED event
            for (TalentPlacement p : all) event(p, "CREATED", "Placement recorded", p.getCreatedAt() == null ? daysAgo(40) : p.getCreatedAt(), null, p.getAccountManagerMemberId());
            // 3. upcoming placements for consultants that are free
            upcoming(Math.max(4, all.size() / 8));
            // 4. extension requests and recorded extensions on active placements
            Collections.shuffle(active, rnd);
            int requests = Math.max(3, active.size() / 7);
            int recorded = Math.max(2, active.size() / 15);
            int i = 0;
            for (; i < requests && i < active.size(); i++) {
                TalentPlacement p = active.get(i);
                if (p.getEndDate() == null) continue;
                PlacementExtension x = ext(p, "REQUESTED", p.getEndDate(), p.getEndDate().plusDays(between(45, 150)), "The client wants to continue the engagement", daysAgo(between(2, 18)), null);
                event(p, "EXTENSION_REQUESTED", "Extension requested to " + x.getRequestedEndDate(), x.getCreatedAt(), x.getId(), p.getAccountManagerMemberId());
            }
            for (int k = 0; k < recorded && i < active.size(); k++, i++) {
                TalentPlacement p = active.get(i);
                if (p.getEndDate() == null) continue;
                LocalDate was = p.getEndDate().minusDays(between(60, 120));
                if (!was.isAfter(p.getStartDate())) continue;
                Instant at = daysAgo(between(20, 80));
                PlacementExtension x = ext(p, "APPROVED", was, p.getEndDate(), "Extended by the client", at, at);
                event(p, "EXTENDED", "Extended from " + was + " to " + p.getEndDate(), at, x.getId(), p.getAccountManagerMemberId());
            }
            // 5. the redeployment pool: ended placements and active ones about to end
            int poolFlag = 0;
            for (TalentPlacement p : all) {
                boolean candidate = p.getStatus().equals("ENDED") ? rnd.nextInt(100) < 55 : p.getEndDate() != null && !p.getEndDate().isAfter(today.plusDays(60)) && rnd.nextInt(100) < 70;
                if (!candidate) continue;
                if (p.getStatus().equals("PENDING_START")) continue;
                LocalDate from = p.getStatus().equals("ENDED") ? today.plusDays(between(0, 20)) : p.getEndDate().plusDays(1);
                p.setRedeploymentPool(true);
                p.setRedeploymentDate(from);
                Instant at = daysAgo(between(1, 55));
                if (at.isBefore(p.getCreatedAt())) at = p.getCreatedAt().plus(1, ChronoUnit.DAYS);
                if (at.isAfter(now)) at = now.minusSeconds(3600);
                event(p, "REDEPLOY_STARTED", "Redeployment started: available from " + from, at, null, p.getAccountManagerMemberId());
                poolFlag++;
            }
            em.flush();
            // 6. a few notes
            String[] bodies = { "Client is happy with the work so far.", "Check in with the client before the end date.", "Consultant asked about a longer engagement.", "Rate review is due at the next renewal." };
            for (TalentPlacement p : all) {
                if (rnd.nextInt(100) >= 12) continue;
                PlacementNote n = new PlacementNote();
                n.setOrgId(orgId);
                n.setPlacementId(p.getId());
                n.setAuthorMemberId(p.getAccountManagerMemberId());
                n.setBody(bodies[rnd.nextInt(bodies.length)]);
                n.setCreatedAt(daysAgo(between(1, 30)));
                em.persist(n);
                event(p, "NOTE", n.getBody(), n.getCreatedAt(), null, p.getAccountManagerMemberId());
            }
            em.flush();
            return touched + poolFlag;
        }

        PlacementExtension ext(TalentPlacement p, String status, LocalDate from, LocalDate to, String note, Instant created, Instant decided) {
            PlacementExtension x = new PlacementExtension();
            x.setOrgId(orgId);
            x.setPlacementId(p.getId());
            x.setStatus(status);
            x.setFromEndDate(from);
            x.setRequestedEndDate(to);
            x.setNote(note);
            x.setRequestedByMemberId(p.getAccountManagerMemberId());
            x.setDecidedByMemberId(decided == null ? null : p.getAccountManagerMemberId());
            x.setCreatedAt(created);
            x.setDecidedAt(decided);
            em.persist(x);
            em.flush();
            touched++;
            return x;
        }

        void event(TalentPlacement p, String type, String detail, Instant at, Long ref, Long actor) {
            PlacementEvent e = new PlacementEvent();
            e.setOrgId(orgId);
            e.setPlacementId(p.getId());
            e.setEventType(type);
            e.setActorMemberId(actor);
            e.setDetail(detail);
            e.setRefId(ref);
            e.setOccurredAt(at);
            em.persist(e);
        }

        @SuppressWarnings("unchecked")
        void upcoming(int wanted) {
            List<ConsultantProfile> free = em.createQuery(
                "select c from ConsultantProfile c where c.orgId = :o and c.status = 'ACTIVE' and c.availabilityStatus in ('AVAILABLE', 'NOTICE')" +
                " and not exists (select 1 from TalentPlacement p where p.orgId = :o and p.consultantId = c.id and p.status <> 'ENDED') order by c.id", ConsultantProfile.class
            ).setParameter("o", orgId).getResultList();
            List<ClientAccount> clients = em.createQuery("select c from ClientAccount c where c.orgId = :o and c.status = 'ACTIVE' order by c.id", ClientAccount.class).setParameter("o", orgId).getResultList();
            if (free.isEmpty() || clients.isEmpty()) return;
            Collections.shuffle(free, rnd);
            Set<Long> used = new HashSet<>();
            for (ConsultantProfile c : free) {
                if (used.size() >= wanted) break;
                ClientAccount client = clients.get(rnd.nextInt(clients.size()));
                LocalDate start = today.plusDays(used.size() < wanted / 2 ? between(2, 28) : between(29, 75));
                TalentPlacement p = new TalentPlacement();
                p.setOrgId(orgId);
                p.setConsultantId(c.getId());
                p.setClientId(client.getId());
                p.setRoleTitle(c.getJobTitle() == null ? "Consultant" : c.getJobTitle());
                p.setStatus("PENDING_START");
                p.setStartDate(start);
                p.setEndDate(start.plusDays(between(120, 380)));
                p.setRateUnit("HOUR");
                p.setBillRateMinor((long) between(55, 140) * 100);
                p.setCurrency("USD");
                p.setPlacementType(rnd.nextInt(100) < 70 ? "CONTRACT" : rnd.nextInt(2) == 0 ? "C2C" : "FTE");
                Long manager = em.createQuery("select ma.marketerMemberId from MarketerAssignment ma where ma.orgId = :o and ma.consultantId = :c", Long.class).setParameter("o", orgId).setParameter("c", c.getId()).getResultStream().findFirst().orElse(null);
                p.setAccountManagerMemberId(manager);
                List<ClientContact> cc = em.createQuery("select cc from ClientContact cc where cc.orgId = :o and cc.clientId = :cl order by cc.id", ClientContact.class).setParameter("o", orgId).setParameter("cl", client.getId()).getResultList();
                if (!cc.isEmpty()) p.setClientContactId(cc.get(0).getId());
                Instant created = daysAgo(between(3, 24));
                p.setCreatedAt(created);
                p.setUpdatedAt(created);
                em.persist(p);
                em.flush();
                used.add(c.getId());
                touched++;
                event(p, "CREATED", "Placement recorded", created, null, manager);
            }
        }
    }
}
