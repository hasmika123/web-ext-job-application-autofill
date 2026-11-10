package com.dossier.api.service.ent.mkt.jobs;

import com.dossier.api.domain.ent.mkt.MktJobMeta;
import com.dossier.api.domain.ent.mkt.MktSavedSearch;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktJobMetaRepository;
import com.dossier.api.repository.ent.mkt.MktSavedSearchRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.mkt.jobs.MktJobsDTO.Criteria;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Demo rows for the Job Discovery page: every existing job gets a source label, a priority and a visa label ({@code mkt_job_meta}), and
 * every marketer seat gets five saved searches ({@code mkt_saved_search}). It runs under exactly the switches of the enterprise demo
 * ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never under {@code prod}) and only for the demo tenants, after
 * {@link com.dossier.api.config.EnterpriseDemoBootstrap} (which seeds the talent tables it reads). Idempotent: a job that already has meta
 * is left alone, and an organization that already has saved searches gets no more. Nothing here is personal data.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
@DependsOn("enterpriseDemoBootstrap")
public class MktJobsDemoSeeder implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(MktJobsDemoSeeder.class);

    static final String[] SOURCES = { "LinkedIn Jobs", "Indeed", "Dice", "ZipRecruiter", "Client Portal" };
    static final String[] PRIORITIES = { "HIGH", "MEDIUM", "HIGH", "MEDIUM", "LOW", "HIGH", "MEDIUM" };
    static final String[] VISAS = { "Any visa", "US Citizen / Green Card", "H-1B transfer", "OPT / CPT" };

    /** name, skills, location (null = anywhere), days since created; "N new" then counts the jobs posted since last seen. */
    record Template(String name, List<String> skills, String location, int createdDaysAgo, int seenDaysAgo) {}

    static final List<Template> TEMPLATES = List.of(
        new Template("Java Developers - East Coast", List.of("Java", "Spring Boot", "AWS"), "NY", 10, 3),
        new Template("Data & Analytics Roles", List.of("Python", "SQL", "Tableau"), "Remote", 22, 5),
        new Template("AWS Cloud Roles", List.of("AWS", "DevOps", "Kubernetes"), null, 34, 8),
        new Template("Project Managers", List.of("Agile", "Program Management", "Scrum"), "Remote", 46, 12),
        new Template("Salesforce Opportunities", List.of("Salesforce", "Apex"), null, 58, 20)
    );

    private final EnterpriseDemoSeeder gate;
    private final OrganizationRepository orgs;
    private final ClientRequirementRepository requirements;
    private final MarketerCapacityRepository marketers;
    private final MktJobMetaRepository metas;
    private final MktSavedSearchRepository searches;
    private final ObjectMapper mapper;
    private final boolean createAccounts;

    public MktJobsDemoSeeder(
        EnterpriseDemoSeeder gate,
        OrganizationRepository orgs,
        ClientRequirementRepository requirements,
        MarketerCapacityRepository marketers,
        MktJobMetaRepository metas,
        MktSavedSearchRepository searches,
        ObjectMapper mapper,
        @Value("${dossier.demo.create-accounts:true}") boolean createAccounts
    ) {
        this.gate = gate;
        this.orgs = orgs;
        this.requirements = requirements;
        this.marketers = marketers;
        this.metas = metas;
        this.searches = searches;
        this.mapper = mapper;
        this.createAccounts = createAccounts;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!createAccounts) return;
        try {
            if (gate.refusal() != null) return;
            LOG.info("Job Discovery demo seeded: {}", seed());
        } catch (RuntimeException e) {
            LOG.error("Job Discovery demo seed failed; the page has no demo meta or saved searches.", e);
        }
    }

    /** Seed every demo tenant; returns, per organization slug, how many job meta rows and saved searches were added. */
    public Map<String, long[]> seed() {
        Map<String, long[]> done = new LinkedHashMap<>();
        Instant now = Instant.now();
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            long meta = seedMeta(org.getId(), now);
            long saved = seedSearches(org.getId(), now);
            if (meta > 0 || saved > 0) done.put(slug, new long[] { meta, saved });
        }
        return done;
    }

    public long seedMeta(Long orgId, Instant now) {
        Set<Long> have = new HashSet<>();
        for (MktJobMeta m : metas.findByOrgId(orgId)) have.add(m.getRequirementId());
        long added = 0;
        for (ClientRequirement r : requirements.findByOrgId(orgId)) {
            if (have.contains(r.getId())) continue;
            int k = (int) (r.getId() % 1000);
            MktJobMeta m = new MktJobMeta();
            m.setOrgId(orgId);
            m.setRequirementId(r.getId());
            m.setSourceLabel(SOURCES[k % SOURCES.length]);
            m.setPriority(PRIORITIES[(k * 3 + 1) % PRIORITIES.length]);
            m.setVisaLabel(VISAS[(k * 5 + 2) % VISAS.length]);
            m.setCreatedAt(now);
            m.setUpdatedAt(now);
            metas.save(m);
            added++;
        }
        return added;
    }

    public long seedSearches(Long orgId, Instant now) {
        if (searches.countByOrgId(orgId) > 0) return 0;
        long added = 0;
        for (MarketerCapacity cap : marketers.findByOrgId(orgId)) {
            for (Template t : TEMPLATES) {
                MktSavedSearch s = new MktSavedSearch();
                s.setOrgId(orgId);
                s.setOwnerMemberId(cap.getMemberId());
                s.setName(t.name());
                s.setCriteria(json(new Criteria(null, t.skills(), t.location(), null, null, null, null, null)));
                s.setCreatedAt(now.minus(t.createdDaysAgo(), ChronoUnit.DAYS));
                s.setLastSeenAt(now.minus(t.seenDaysAgo(), ChronoUnit.DAYS));
                searches.save(s);
                added++;
            }
        }
        return added;
    }

    private String json(Criteria c) {
        try {
            return mapper.writeValueAsString(c);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
