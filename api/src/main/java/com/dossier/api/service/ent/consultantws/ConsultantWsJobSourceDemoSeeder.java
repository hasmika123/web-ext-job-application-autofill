package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsJobSource;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.consultantws.CwsJobSourceRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
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
 * A job with its OWN link (a real posting a marketer saved from the extension) gets no sample row, and a sample row it was given earlier is removed,
 * so the consultant opens the real posting and never a stand-in copy of it.
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
    private final ClientAccountRepository clients;
    private final String base;

    public ConsultantWsJobSourceDemoSeeder(
        OrganizationRepository orgs,
        ClientRequirementRepository requirements,
        CwsJobSourceRepository sources,
        ClientAccountRepository clients,
        @Value("${dossier.demo.job-link-base:" + DEFAULT_BASE + "}") String base
    ) {
        this.orgs = orgs;
        this.requirements = requirements;
        this.sources = sources;
        this.clients = clients;
        String b = base == null || base.isBlank() ? DEFAULT_BASE : base.trim();
        this.base = b.endsWith("/") ? b.substring(0, b.length() - 1) : b;
    }

    /**
     * The sample link of one opening: {@code <base>/<client-slug>/<requirementId>?t=<title>&c=<client>} (the stand-in page shows the title and the
     * client as the employer); the organization's slug stands in when the opening has no client.
     */
    String linkFor(String slug, ClientRequirement r, String client) {
        String title = r.getTitle() == null ? "" : r.getTitle();
        String who = client == null || client.isBlank() ? null : client.trim();
        String path = who == null ? slug : who.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        return base + "/" + path + "/" + r.getId() + "?t=" + URLEncoder.encode(title, StandardCharsets.UTF_8) + (who == null ? "" : "&c=" + URLEncoder.encode(who, StandardCharsets.UTF_8));
    }

    /** A job saved with its own posting link (from the extension): the consultant opens that link, not a sample one. */
    static boolean hasOwnLink(ClientRequirement r) {
        return r.getJobUrl() != null && !r.getJobUrl().isBlank();
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
            Set<Long> clientIds = open.stream().map(ClientRequirement::getClientId).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
            Map<Long, String> clientName = clientIds.isEmpty() ? Map.of() : clients.findByOrgIdAndIdIn(org.getId(), clientIds).stream().collect(Collectors.toMap(c -> c.getId(), c -> c.getName(), (a, b) -> a));
            // A sample row seeded under another base (a different demo stack setting) follows the current one; real rows are never touched.
            for (CwsJobSource s : existing) {
                ClientRequirement r = byId.get(s.getRequirementId());
                if (r == null || !s.isSampleData()) continue;
                if (hasOwnLink(r)) {
                    sources.delete(s);
                    made++;
                    continue;
                }
                if (s.getSourceUrl() == null) continue;
                String want = linkFor(slug, r, (r.getClientId() == null ? null : clientName.get(r.getClientId())));
                if (want.equals(s.getSourceUrl())) continue;
                s.setSourceUrl(want);
                s.setUpdatedAt(now);
                sources.save(s);
                made++;
            }
            for (ClientRequirement r : open) {
                if (have.contains(r.getId()) || hasOwnLink(r)) continue;
                int k = (int) (r.getId() % 1000);
                CwsJobSource s = new CwsJobSource();
                s.setOrgId(org.getId());
                s.setRequirementId(r.getId());
                s.setSourceUrl(linkFor(slug, r, (r.getClientId() == null ? null : clientName.get(r.getClientId()))));
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
