package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo rows for the job source flow: every OPEN job of the demo organizations gets an example source link
 * ({@code <base>/<org-slug>/<requirementId>?t=<title>}, base {@code dossier.demo.job-link-base}, default {@code https://jobs.example.com}), a source name
 * and a short note, all marked {@code sample_data}. The enterprise demo points the base at the local stand-in employer pages
 * ({@code web/scripts/demo-ats-server.mjs}) so every seeded opening really opens and can be filled by the extension. In the real product the
 * MARKETER role writes these (no marketer-side write exists yet: "mock data now, fix cross-role data when all role branches merge"). Call it after the
 * other consultant seeders. Idempotent: a job that already has a row is skipped (a sample row that still carries another base is moved to the current one).
 */
@Service
public class ConsultantWsJobSourceDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantWsJobSourceDemoSeeder.class);

    private static final String[] SOURCE_NAMES = { "LinkedIn", "Dice", "Company site", "Indeed" };
    private static final String[] NOTES = {
        "Contract role. Apply on the source site and tailor your resume to the posting first.",
        "Client wants a fast turnaround. Open the link, check the posting details, then apply.",
        "Strong fit for your recent work. The full posting is on the source site.",
        "Interview process is quick on this one. Apply from the link with the extension.",
        "Rate is negotiable. Read the posting on the source site before you apply."
    };

    public static final String DEFAULT_BASE = "https://jobs.example.com";

    private final OrganizationRepository orgs;
    private final ClientRequirementRepository requirements;
    private final CwsJobSourceRepository sources;
    private final String base;

    public ConsultantWsJobSourceDemoSeeder(
        OrganizationRepository orgs,
        ClientRequirementRepository requirements,
        CwsJobSourceRepository sources,
        @Value("${dossier.demo.job-link-base:" + DEFAULT_BASE + "}") String base
    ) {
        this.orgs = orgs;
        this.requirements = requirements;
        this.sources = sources;
        String b = base == null || base.isBlank() ? DEFAULT_BASE : base.trim();
        this.base = b.endsWith("/") ? b.substring(0, b.length() - 1) : b;
    }

    /** The sample link of one opening: {@code <base>/<org-slug>/<requirementId>?t=<title>} (the stand-in page shows the title). */
    String linkFor(String slug, ClientRequirement r) {
        String title = r.getTitle() == null ? "" : r.getTitle();
        return base + "/" + slug + "/" + r.getId() + "?t=" + URLEncoder.encode(title, StandardCharsets.UTF_8);
    }

    @Transactional
    public int seed() {
        int made = 0;
        Instant now = Instant.now();
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = orgs.findBySlug(slug).orElse(null);
            if (org == null) continue;
            List<ClientRequirement> open = requirements.findByOrgIdAndStatusOrderByPostedAtDesc(org.getId(), "OPEN");
            if (open.isEmpty()) continue;
            List<CwsJobSource> existing = sources.findByOrgIdAndRequirementIdIn(org.getId(), open.stream().map(ClientRequirement::getId).toList());
            Set<Long> have = existing.stream().map(CwsJobSource::getRequirementId).collect(Collectors.toSet());
            Map<Long, ClientRequirement> byId = open.stream().collect(Collectors.toMap(ClientRequirement::getId, r -> r, (a, b) -> a));
            // A sample row seeded under another base (a different demo stack setting) follows the current one; real rows are never touched.
            for (CwsJobSource s : existing) {
                ClientRequirement r = byId.get(s.getRequirementId());
                if (r == null || !s.isSampleData() || s.getSourceUrl() == null || s.getSourceUrl().startsWith(base + "/")) continue;
                s.setSourceUrl(linkFor(slug, r));
                s.setUpdatedAt(now);
                sources.save(s);
                made++;
            }
            for (ClientRequirement r : open) {
                if (have.contains(r.getId())) continue;
                int k = (int) (r.getId() % 1000);
                CwsJobSource s = new CwsJobSource();
                s.setOrgId(org.getId());
                s.setRequirementId(r.getId());
                s.setSourceUrl(linkFor(slug, r));
                s.setSourceName(SOURCE_NAMES[k % SOURCE_NAMES.length]);
                s.setQuickInfo(NOTES[k % NOTES.length]);
                s.setSampleData(true);
                s.setCreatedAt(now);
                s.setUpdatedAt(now);
                sources.save(s);
                made++;
            }
        }
        if (made > 0) LOG.info("Consultant workspace job source demo rows seeded: {}", made);
        return made;
    }
}
