package com.dossier.api.service.ent.mkt.tasks;

import com.dossier.api.domain.ent.mkt.MktTask;
import com.dossier.api.domain.ent.mkt.MktTaskEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktTaskEventRepository;
import com.dossier.api.repository.ent.mkt.MktTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo tasks for the Marketing workspace (Tasks board). For every marketer that has assignments it creates, relative to now, 24 OPEN tasks (5 overdue, 8 due
 * within the next 7 days, 11 later) and 16 tasks completed in the last 7 days, all owned by that marketer and, when they are about a consultant, about one of
 * THAT marketer's consultants. Same switches as the other demo seeds ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never prod); it runs on
 * {@link ApplicationReadyEvent}, after the tenants and talent data exist, so no shared class is edited. <b>Idempotent:</b> an organization that already has
 * tasks is left alone. No PII: titles are generic work items.
 */
@Component
public class MktTasksDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktTasksDemoSeeder.class);

    public static final int OVERDUE = 5;
    public static final int DUE_THIS_WEEK = 8;
    public static final int LATER = 11;
    public static final int COMPLETED_THIS_WEEK = 16;
    public static final int OPEN = OVERDUE + DUE_THIS_WEEK + LATER;

    private enum Kind { CONSULTANT, CLIENT, LABEL }

    /** title, subtitle, category, priority, who it is about, the client or label ("" for a consultant). */
    private record Template(String title, String detail, String category, String priority, Kind kind, String about) {}

    private static final List<Template> TEMPLATES = List.of(
        new Template("Share new openings with team", "Send 5 new openings from TechCorp", "JOB_OPPORTUNITY", "HIGH", Kind.CLIENT, "TechCorp"),
        new Template("Review and update resume", "Update skills and keywords", "RESUME", "HIGH", Kind.CONSULTANT, ""),
        new Template("Schedule client call", "Discuss Q4 hiring needs", "CLIENT", "MEDIUM", Kind.LABEL, "Global Bank"),
        new Template("Assign job matches", "Send top 3 matches to consultant", "JOB_MATCH", "HIGH", Kind.CONSULTANT, ""),
        new Template("Follow up on application status", "Check status with hiring manager", "APPLICATION", "MEDIUM", Kind.CONSULTANT, ""),
        new Template("Configure new job stream", "Set up AWS job alerts", "JOB_STREAM", "MEDIUM", Kind.LABEL, "AWS"),
        new Template("Prepare consultant for interview", "Share tips and do mock session", "INTERVIEW", "HIGH", Kind.CONSULTANT, ""),
        new Template("Update job description summary", "Create client-facing summary", "CONTENT", "LOW", Kind.CLIENT, "RetailCo"),
        new Template("Send weekly job market update", "Top trends and opportunities", "MARKETING", "MEDIUM", Kind.LABEL, "All Consultants"),
        new Template("Follow up with inactive consultant", "Check availability and interest", "FOLLOW_UP", "HIGH", Kind.CONSULTANT, "")
    );
    private static final String[] OPEN_STATUS = { "IN_PROGRESS", "PENDING", "NOT_STARTED", "PENDING", "IN_PROGRESS", "NOT_STARTED" };

    private final TalentDemoSeeder talent;
    private final OrganizationRepository orgs;
    private final MarketerAssignmentRepository assignments;
    private final ClientAccountRepository clients;
    private final MktTaskRepository tasks;
    private final MktTaskEventRepository events;

    public MktTasksDemoSeeder(
        TalentDemoSeeder talent, OrganizationRepository orgs, MarketerAssignmentRepository assignments, ClientAccountRepository clients, MktTaskRepository tasks,
        MktTaskEventRepository events
    ) {
        this.talent = talent;
        this.orgs = orgs;
        this.assignments = assignments;
        this.clients = clients;
        this.tasks = tasks;
        this.events = events;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            seed();
        } catch (RuntimeException e) {
            LOG.error("Tasks demo seed failed; the Tasks page has no demo data.", e);
        }
    }

    /** Seeds every demo tenant that has assignments and no tasks yet; returns the rows created per organization slug. */
    @Transactional
    public Map<String, Integer> seed() {
        Map<String, Integer> done = new LinkedHashMap<>();
        if (talent.refusal() != null) return done;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null || tasks.countByOrgId(org.getId()) > 0) continue; // not there yet, or already seeded
            int n = seedOrg(org.getId(), slug.hashCode(), Instant.now());
            if (n > 0) {
                done.put(slug, n);
                LOG.info("Tasks demo seeded for {}: {} rows", slug, n);
            }
        }
        return done;
    }

    int seedOrg(Long orgId, long seed, Instant now) {
        Map<Long, List<Long>> byMarketer = new LinkedHashMap<>();
        for (MarketerAssignment a : assignments.findByOrgId(orgId)) byMarketer.computeIfAbsent(a.getMarketerMemberId(), k -> new ArrayList<>()).add(a.getConsultantId());
        if (byMarketer.isEmpty()) return 0;
        Map<String, ClientAccount> clientByName = new LinkedHashMap<>();
        for (ClientAccount c : clients.findByOrgId(orgId)) clientByName.put(c.getName(), c);
        Random rnd = new Random(seed ^ 0x54_41_53_4BL);
        int total = 0;
        for (Map.Entry<Long, List<Long>> e : byMarketer.entrySet()) {
            Long marketer = e.getKey();
            List<Long> cons = e.getValue();
            int k = 0;
            // open: 5 overdue (a few hours to ~5 days late), 8 due in the next week, 11 later
            for (int i = 0; i < OVERDUE; i++) {
                Instant due = now.minus(3 + i * 20L, ChronoUnit.HOURS);
                total += save(orgId, marketer, cons, clientByName, rnd, k++, due, OPEN_STATUS[i % OPEN_STATUS.length], now.minus(8 + rnd.nextInt(8), ChronoUnit.DAYS), null);
            }
            for (int i = 0; i < DUE_THIS_WEEK; i++) {
                Instant due = now.plus(2 + i * 20L, ChronoUnit.HOURS);
                Instant created = i < 3 ? now.minus(1 + rnd.nextInt(5), ChronoUnit.DAYS) : now.minus(8 + rnd.nextInt(8), ChronoUnit.DAYS);
                total += save(orgId, marketer, cons, clientByName, rnd, k++, due, OPEN_STATUS[(i + 1) % OPEN_STATUS.length], created, null);
            }
            for (int i = 0; i < LATER; i++) {
                Instant due = now.plus(8L + i * 16L / 10, ChronoUnit.DAYS).plus(rnd.nextInt(9), ChronoUnit.HOURS);
                Instant created = i < 3 ? now.minus(1 + rnd.nextInt(5), ChronoUnit.DAYS) : now.minus(8 + rnd.nextInt(10), ChronoUnit.DAYS);
                total += save(orgId, marketer, cons, clientByName, rnd, k++, due, "NOT_STARTED", created, null);
            }
            for (int i = 0; i < COMPLETED_THIS_WEEK; i++) {
                Instant done = now.minus(30 + rnd.nextInt(6 * 24 * 60), ChronoUnit.MINUTES);
                Instant due = done.plus(rnd.nextInt(48) - 24, ChronoUnit.HOURS);
                total += save(orgId, marketer, cons, clientByName, rnd, k++, due, "COMPLETED", now.minus(9 + rnd.nextInt(12), ChronoUnit.DAYS), done);
            }
        }
        return total;
    }

    private int save(
        Long orgId, Long marketer, List<Long> cons, Map<String, ClientAccount> clientByName, Random rnd, int k, Instant due, String status, Instant created, Instant completedAt
    ) {
        Template tpl = TEMPLATES.get((k * 3 + rnd.nextInt(3)) % TEMPLATES.size());
        MktTask t = new MktTask();
        t.setOrgId(orgId);
        t.setTitle(tpl.title());
        t.setDetail(tpl.detail());
        t.setCategory(tpl.category());
        t.setPriority(k % 7 == 3 ? "LOW" : tpl.priority());
        t.setStatus(status);
        t.setDueAt(due);
        t.setCompletedAt(completedAt);
        t.setOwnerMemberId(marketer);
        t.setCreatedByMemberId(marketer);
        t.setCreatedAt(created);
        t.setUpdatedAt(completedAt != null ? completedAt : created);
        switch (tpl.kind()) {
            case CONSULTANT -> t.setConsultantId(cons.get(rnd.nextInt(cons.size())));
            case CLIENT -> {
                ClientAccount c = clientByName.get(tpl.about());
                if (c != null) t.setClientAccountId(c.getId());
                else t.setRelatedLabel(tpl.about());
            }
            case LABEL -> t.setRelatedLabel(tpl.about());
        }
        tasks.save(t);
        MktTaskEvent made = event(orgId, t.getId(), MktTaskEvent.CREATED, marketer, created);
        events.save(made);
        if (completedAt != null) events.save(event(orgId, t.getId(), MktTaskEvent.COMPLETED, marketer, completedAt));
        return 1;
    }

    private static MktTaskEvent event(Long orgId, Long taskId, String kind, Long by, Instant at) {
        MktTaskEvent e = new MktTaskEvent();
        e.setOrgId(orgId);
        e.setTaskId(taskId);
        e.setKind(kind);
        e.setOccurredAt(at);
        e.setByMemberId(by);
        return e;
    }
}
