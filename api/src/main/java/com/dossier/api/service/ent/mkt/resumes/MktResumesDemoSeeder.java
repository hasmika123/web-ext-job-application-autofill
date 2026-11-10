package com.dossier.api.service.ent.mkt.resumes;

import com.dossier.api.domain.ent.mkt.MktResumeEvent;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktResumeEventRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

/**
 * Demo change-log rows for the Resumes board's "Recent Resume Activity" and its "needs update" chip. It derives one story per existing
 * {@code org_resume} (created, edited to its current version, sent for approval or approved, and about one in nine flagged for update),
 * dated from the resume's own timestamps, so nothing is invented that the resume does not already say.
 *
 * <p>Runs under the same switches as {@link EnterpriseDemoSeeder} ({@code DEMO_ENABLED} + {@code ENT_DEMO_SEED}, never under {@code prod}),
 * once the application is ready (after {@code EnterpriseDemoBootstrap} has created the tenants and the talent seed). Idempotent: an
 * organization that already has events is skipped. A failure is logged and never stops the API.
 */
@Service
public class MktResumesDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(MktResumesDemoSeeder.class);

    private final EnterpriseDemoSeeder gate;
    private final OrganizationRepository organizations;
    private final OrgResumeRepository resumes;
    private final MktResumeEventRepository events;

    public MktResumesDemoSeeder(EnterpriseDemoSeeder gate, OrganizationRepository organizations, OrgResumeRepository resumes, MktResumeEventRepository events) {
        this.gate = gate;
        this.organizations = organizations;
        this.resumes = resumes;
        this.events = events;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        try {
            if (gate.refusal() != null) return;
            seed();
        } catch (RuntimeException e) {
            LOG.error("Marketing resumes demo seed failed; the Resumes page has no demo activity.", e);
        }
    }

    /** Seeds the demo tenants that have resumes and no events yet; returns the number of events written. */
    public int seed() {
        int written = 0;
        for (String slug : List.of(EnterpriseDemoSeeder.ACME_SLUG, EnterpriseDemoSeeder.BETA_SLUG)) {
            Organization org = organizations.findBySlug(slug).orElse(null);
            if (org != null) written += seedOrg(org.getId());
        }
        if (written > 0) LOG.info("Marketing resumes demo seed: {} change-log rows", written);
        return written;
    }

    int seedOrg(Long orgId) {
        if (events.countByOrgId(orgId) > 0) return 0;
        List<OrgResume> rows = new ArrayList<>(resumes.findByOrgId(orgId));
        if (rows.isEmpty()) return 0;
        rows.sort(Comparator.comparing(OrgResume::getId));
        Instant now = Instant.now();
        List<MktResumeEvent> out = new ArrayList<>();
        for (OrgResume r : rows) {
            Instant created = r.getCreatedAt();
            Instant updated = r.getUpdatedAt().isBefore(created) ? created : r.getUpdatedAt();
            if (updated.isAfter(now)) updated = now;
            out.add(event(r, MktResumeEvent.CREATED, 1, created));
            if (r.getVersionNo() != null && r.getVersionNo() > 1) out.add(event(r, MktResumeEvent.UPDATED, r.getVersionNo(), updated));
            if ("PENDING".equals(r.getApprovalStatus())) out.add(event(r, MktResumeEvent.APPROVAL_REQUESTED, r.getVersionNo(), updated));
            else {
                Instant approved = r.getApprovedAt() != null && !r.getApprovedAt().isAfter(now) ? r.getApprovedAt() : updated;
                out.add(event(r, MktResumeEvent.APPROVED, r.getVersionNo(), approved));
                if (r.getId() % 9 == 4) out.add(event(r, MktResumeEvent.MARKED_FOR_UPDATE, r.getVersionNo(), updated));
            }
        }
        for (var ev : out) events.save(ev);
        return out.size();
    }

    private static MktResumeEvent event(OrgResume r, String kind, Integer version, Instant at) {
        MktResumeEvent e = new MktResumeEvent();
        e.setOrgId(r.getOrgId());
        e.setResumeId(r.getId());
        e.setConsultantId(r.getConsultantId());
        e.setKind(kind);
        e.setVersionNo(version);
        e.setOccurredAt(at);
        return e;
    }
}
