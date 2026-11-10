package com.dossier.api.service.ent.mkt.streams;

import com.dossier.api.domain.ent.mkt.MktJobStream;
import com.dossier.api.domain.ent.mkt.MktStreamAlert;
import com.dossier.api.domain.ent.mkt.MktStreamRule;
import com.dossier.api.domain.ent.mkt.MktStreamSyncLog;
import com.dossier.api.repository.ent.mkt.MktJobStreamRepository;
import com.dossier.api.repository.ent.mkt.MktStreamAlertRepository;
import com.dossier.api.repository.ent.mkt.MktStreamRuleRepository;
import com.dossier.api.repository.ent.mkt.MktStreamSyncLogRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demo data for the Job Streams board: the board's six streams, one sync per stream per day for 14 days (6 syncs a day; the last 7 days
 * draw the chart and Sync Activity, the 7 before give the "vs" figures), alerts and the four rules. Same switches as every enterprise demo
 * ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never under {@code prod}); idempotent: an organization that already has streams is skipped.
 *
 * <p>It starts on {@link ApplicationReadyEvent}, i.e. after {@code EnterpriseDemoBootstrap} (which creates the demo tenants) has finished,
 * so no shared class had to change to hook it. Nothing is fetched from any site: these are invented rows.
 */
@Component
public class MktStreamsDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktStreamsDemoSeeder.class);

    private record Spec(String label, String subtitle, int everyMinutes, String keywords, String scope, long lastSyncMinutesAgo, int openings, double deltaPct, int createdDaysAgo) {}

    static final List<Spec> STREAMS = List.of(
        new Spec("LinkedIn Jobs", "Global Talent Solutions", 30, "Java, AWS, Cloud, Data Engineer, Spring Boot, Kubernetes, React", null, 10, 124, 12, 60),
        new Spec("Indeed", "Worldwide", 60, "Data Analyst, Business Analyst, SQL, Tableau", null, 25, 86, 8, 60),
        new Spec("Dice", "Tech & Cleared", 120, "Java Developer, DevOps, Azure, AWS, Terraform, Docker, Kubernetes", null, 60, 48, 5, 60),
        new Spec("ZipRecruiter", "All Locations", 60, "Project Manager, IT Consultant, PMP, Agile, Scrum", null, 120, 32, 3, 60),
        new Spec("Client Portal", "ACME Clients", 30, "Client Specific (Requisitions)", "ACME Clients", 30, 67, 15, 60),
        new Spec("Vendor Feed", "Partner Integration", 240, "Multiple Clients (Open Roles)", "Partner Clients", 180, 45, 9, 10)
    );

    private final EnterpriseDemoSeeder base;
    private final OrganizationRepository orgs;
    private final MktJobStreamRepository streams;
    private final MktStreamSyncLogRepository logs;
    private final MktStreamAlertRepository alerts;
    private final MktStreamRuleRepository rules;
    private final TransactionTemplate tx;
    private final boolean createAccounts;

    public MktStreamsDemoSeeder(
        EnterpriseDemoSeeder base, OrganizationRepository orgs, MktJobStreamRepository streams, MktStreamSyncLogRepository logs, MktStreamAlertRepository alerts,
        MktStreamRuleRepository rules, TransactionTemplate tx, @Value("${dossier.demo.create-accounts:true}") boolean createAccounts
    ) {
        this.base = base;
        this.orgs = orgs;
        this.streams = streams;
        this.logs = logs;
        this.alerts = alerts;
        this.rules = rules;
        this.tx = tx;
        this.createAccounts = createAccounts;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (!createAccounts || base.refusal() != null) return;
        try {
            int n = seed();
            if (n > 0) LOG.info("Job Streams demo data seeded for {} organization(s).", n);
        } catch (RuntimeException e) {
            LOG.error("Job Streams demo seed failed; the Job Streams page has no demo data.", e);
        }
    }

    /** Seed every demo organization that has no streams yet; returns how many were seeded. */
    public int seed() {
        int seeded = 0;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Long orgId = orgs.findBySlug(slug).map(o -> o.getId()).orElse(null);
            if (orgId == null) continue;
            Boolean did = tx.execute(status -> seedOrg(orgId, slug.equals(EnterpriseDemoSeeder.ACME_SLUG)));
            if (Boolean.TRUE.equals(did)) seeded++;
        }
        return seeded;
    }

    boolean seedOrg(Long orgId, boolean full) {
        if (streams.countByOrgId(orgId) > 0) return false;
        Instant now = Instant.now();
        List<Spec> specs = full ? STREAMS : STREAMS.subList(0, 3); // Beta Talent is the smaller tenant
        for (Spec spec : specs) {
            MktJobStream s = new MktJobStream();
            s.setOrgId(orgId);
            s.setSourceLabel(spec.label());
            s.setSubtitle(spec.subtitle());
            s.setStatus(MktJobStream.ACTIVE);
            s.setActive(true);
            s.setSyncEveryMinutes(spec.everyMinutes());
            s.setKeywords(spec.keywords());
            s.setClientScope(spec.scope());
            Instant last = now.minus(spec.lastSyncMinutesAgo(), ChronoUnit.MINUTES);
            s.setLastSyncAt(last);
            s.setNewOpenings(spec.openings());
            s.setOpeningsDeltaPct(BigDecimal.valueOf(spec.deltaPct()));
            s.setCreatedAt(now.minus(spec.createdDaysAgo(), ChronoUnit.DAYS));
            s.setUpdatedAt(last);
            MktJobStream saved = streams.saveAndFlush(s);
            for (int d = 0; d <= 13; d++) {
                double factor = d == 0 ? 1.0 : d <= 6 ? 1 - 0.03 * d : 0.80 - 0.012 * (d - 7);
                boolean failed = (spec.label().equals("Vendor Feed") && d == 8) || (spec.label().equals("Dice") && d == 11);
                MktStreamSyncLog l = new MktStreamSyncLog();
                l.setOrgId(orgId);
                l.setStreamId(saved.getId());
                l.setSyncedAt(last.minus(d, ChronoUnit.DAYS));
                l.setOpenings(failed ? 0 : (int) Math.round(spec.openings() * factor));
                l.setStatus(failed ? MktStreamSyncLog.FAILED : MktStreamSyncLog.OK);
                l.setMessage(failed ? "Connection timeout" : "Sync completed");
                logs.save(l);
            }
            if (full) alertsFor(orgId, saved, now);
        }
        if (full) {
            for (int i = 0; i < 9; i++) { // resolved alerts from the month before, so "vs last month" has something to compare with
                MktStreamAlert old = new MktStreamAlert();
                old.setOrgId(orgId);
                old.setSeverity(i % 3 == 0 ? MktStreamAlert.ERROR : MktStreamAlert.WARNING);
                old.setTitle(i % 3 == 0 ? "Sync failed" : "Slow response");
                old.setDetail("Resolved automatically.");
                old.setRaisedAt(now.minus(35 + i * 2L, ChronoUnit.DAYS));
                old.setResolvedAt(old.getRaisedAt().plus(1, ChronoUnit.HOURS));
                alerts.save(old);
            }
        }
        rule(orgId, MktStreamRule.DEFAULT_KEYWORDS, "Java, AWS, Cloud, Data Engineer", true);
        rule(orgId, MktStreamRule.CLIENT_MAPPING, "Map each opening to the client named in the requisition.", true);
        rule(orgId, MktStreamRule.DUPLICATE_DETECTION, "Same title and client within 14 days counts as a duplicate.", true);
        rule(orgId, MktStreamRule.AUTO_PUBLISH, "Sync new openings to talent matches.", true);
        return true;
    }

    private void alertsFor(Long orgId, MktJobStream s, Instant now) {
        switch (s.getSourceLabel()) {
            case "Vendor Feed" -> alert(orgId, s.getId(), MktStreamAlert.ERROR, "Vendor Feed sync failed", "Connection timeout. Retrying in 15 minutes.", now.minus(2, ChronoUnit.HOURS));
            case "Indeed" -> alert(orgId, s.getId(), MktStreamAlert.WARNING, "3 duplicate jobs detected", "Similar titles from Indeed", now.minus(4, ChronoUnit.HOURS));
            case "LinkedIn Jobs" -> alert(orgId, s.getId(), MktStreamAlert.WARNING, "Keyword filter too broad", "\"Developer\" returning high volume", now.minus(26, ChronoUnit.HOURS));
            case "Client Portal" -> alert(orgId, s.getId(), MktStreamAlert.WARNING, "Client Portal slow response", "Sync taking longer than usual", now.minus(30, ChronoUnit.HOURS));
            default -> { }
        }
    }

    private void alert(Long orgId, Long streamId, String severity, String title, String detail, Instant at) {
        MktStreamAlert a = new MktStreamAlert();
        a.setOrgId(orgId);
        a.setStreamId(streamId);
        a.setSeverity(severity);
        a.setTitle(title);
        a.setDetail(detail);
        a.setRaisedAt(at);
        alerts.save(a);
    }

    private void rule(Long orgId, String key, String value, boolean enabled) {
        MktStreamRule r = new MktStreamRule();
        r.setOrgId(orgId);
        r.setRuleKey(key);
        r.setValue(value);
        r.setEnabled(enabled);
        rules.save(r);
    }
}
