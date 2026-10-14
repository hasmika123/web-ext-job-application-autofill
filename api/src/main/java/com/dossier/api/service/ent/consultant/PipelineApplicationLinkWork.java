package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.mkt.MktPipelineApplicationLink;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ent.consultant.ConOpportunityRepository;
import com.dossier.api.repository.ent.consultant.ConOpportunityRow;
import com.dossier.api.repository.ent.consultant.ConProfileRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktPipelineApplicationLinkRepository;
import com.dossier.api.service.ApplicationKeys;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.jobs.UrlKeys;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * What {@link PipelineApplicationLinker} does for ONE organization, in a transaction of its own (docs/enterprise-v2/60-job-phase1-contract.md section 5).
 *
 * <p>For the consultant seat {@code memberId} of {@code orgId}: nothing unless the consultant jobs flag is on and the seat has exactly one ACTIVE
 * {@code consultant_profile}. Then, by the consultant's own consent ({@link DataShareService#scopeOf}):
 * <ul>
 *   <li><b>NONE</b>: nothing at all. No link, no projection, no event. The application stays private.</li>
 *   <li><b>SUMMARY</b>: the opportunity follows (APPLIED, link, event; CLOSED when the application ended).</li>
 *   <li><b>FULL</b>: also the {@code talent_application} projection (entry path LINKED, SYSTEM-owned) and its stage while the application moves.</li>
 * </ul>
 *
 * <p><b>APPLIED</b> (the application became APPLIED, or was created as APPLIED): the consultant's open opportunities (state not DECLINED, CLOSED, APPLIED)
 * whose job is this posting by {@code (ats_platform, external_job_id)}, then by the hash of the normalized job URL, are linked (source LINKER), set to
 * APPLIED with {@code applied_at}, and get an event. Company plus title is only ever a SUGGESTION (event {@code LINK_SUGGESTED}, once per opportunity),
 * never a link: the consultant confirms it in the UI. A SAVED or DRAFT application is not an application yet and links nothing.
 * <b>REJECTED / WITHDRAWN</b>: the opportunities live-linked to this application are CLOSED ({@code APPLICATION_TERMINAL}). OFFER and other moves keep the
 * opportunity APPLIED. Idempotent: a live link is never created twice (the database key {@code (org_id, live_key)} backs it).
 *
 * <p>The actor of every row it writes is the system, never a marketer: no marketer ever sets a consultant's APPLIED. It reads the application only.
 */
@Component
public class PipelineApplicationLinkWork {

    /** What the linker needs to know about the application: facts, not the entity (the work runs in another transaction). */
    public record Facts(
        Long userId,
        Long applicationId,
        ApplicationStatus status,
        String company,
        String title,
        String jobUrl,
        String atsPlatform,
        String externalJobId,
        Instant appliedAt,
        String source
    ) {
        /** Without a source (a caller that does not know what moved the application). */
        public Facts(Long userId, Long applicationId, ApplicationStatus status, String company, String title, String jobUrl, String atsPlatform, String externalJobId, Instant appliedAt) {
            this(userId, applicationId, status, company, title, jobUrl, atsPlatform, externalJobId, appliedAt, null);
        }
    }

    public static final String SUGGESTED = "LINK_SUGGESTED";
    public static final String APPLICATION_TERMINAL = "APPLICATION_TERMINAL";
    static final int SUGGESTION_LIMIT = 3;

    private final ConProfileRepository profiles;
    private final EnterpriseFeatureFlag flags;
    private final DataShareService shares;
    private final ConOpportunityRepository repo;
    private final MktOpportunityRepository opportunities;
    private final MktOpportunityEventRepository events;
    private final MktPipelineApplicationLinkRepository links;
    private final LinkedApplicationProjection projection;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public PipelineApplicationLinkWork(
        ConProfileRepository profiles, EnterpriseFeatureFlag flags, DataShareService shares, ConOpportunityRepository repo, MktOpportunityRepository opportunities,
        MktOpportunityEventRepository events, MktPipelineApplicationLinkRepository links, LinkedApplicationProjection projection, OrgAuditService audit
    ) {
        this(profiles, flags, shares, repo, opportunities, events, links, projection, audit, Clock.systemUTC());
    }

    PipelineApplicationLinkWork(
        ConProfileRepository profiles, EnterpriseFeatureFlag flags, DataShareService shares, ConOpportunityRepository repo, MktOpportunityRepository opportunities,
        MktOpportunityEventRepository events, MktPipelineApplicationLinkRepository links, LinkedApplicationProjection projection, OrgAuditService audit, Clock clock
    ) {
        this.profiles = profiles;
        this.flags = flags;
        this.shares = shares;
        this.repo = repo;
        this.opportunities = opportunities;
        this.events = events;
        this.links = links;
        this.projection = projection;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void process(Long orgId, Long memberId, Facts f) {
        if (orgId == null || memberId == null || f == null || f.applicationId() == null || f.status() == null) return;
        if (!flags.isEnabled(EnterpriseSettingKeys.FLAG_CONSULTANT_JOBS, orgId)) return;
        List<ConsultantProfile> mine = profiles.findByOrgIdAndMemberId(orgId, memberId);
        if (mine.size() != 1 || !"ACTIVE".equals(mine.get(0).getStatus()) || mine.get(0).getId() == null) return;
        Long consultantId = mine.get(0).getId();
        ShareScope consent = shares.scopeOf(orgId, memberId);
        if (consent == null || !consent.atLeast(ShareScope.SUMMARY)) return; // NONE: no link, no projection, nothing the org can see

        List<MktPipelineApplicationLink> live = links.findByOrgIdAndPersonalApplicationIdAndUnlinkedAtIsNull(orgId, f.applicationId()).stream()
            .filter(l -> consultantId.equals(l.getConsultantId())).toList();
        if (!live.isEmpty()) {
            follow(orgId, consultantId, consent, f, live);
            return;
        }
        if (f.status() == ApplicationStatus.APPLIED) link(orgId, consultantId, memberId, consent, f);
    }

    // ---- an application the consultant already linked: follow it -----------------------------------------------------------------

    private void follow(Long orgId, Long consultantId, ShareScope consent, Facts f, List<MktPipelineApplicationLink> live) {
        Instant now = clock.instant();
        boolean terminal = f.status() == ApplicationStatus.REJECTED || f.status() == ApplicationStatus.WITHDRAWN;
        if (terminal) {
            for (MktPipelineApplicationLink l : live) {
                MktOpportunity opp = repo.findOwned(orgId, consultantId, l.getOpportunityId()).orElse(null);
                if (opp == null || "CLOSED".equals(opp.getState())) continue;
                opp.setState("CLOSED");
                opp.setClosedAt(now);
                opp.setClosedReason(APPLICATION_TERMINAL);
                opp.setUpdatedAt(now);
                opportunities.save(opp);
                record(opp, "CLOSED", "closed: the application ended (" + f.status() + ")", now);
                audit.record(orgId, OrgAuditService.SYSTEM_ACTOR, null, "LINKER_OPPORTUNITY_CLOSED", "OPPORTUNITY", null, String.valueOf(opp.getId()), APPLICATION_TERMINAL, null);
            }
        }
        if (consent == ShareScope.FULL) projection.mirror(orgId, f.applicationId(), f.status(), f.source());
    }

    // ---- a new APPLIED application: find its opportunity ---------------------------------------------------------------------------

    private void link(Long orgId, Long consultantId, Long memberId, ShareScope consent, Facts f) {
        Instant now = clock.instant();
        Map<Long, ConOpportunityRow> matched = new LinkedHashMap<>();
        if (notBlank(f.atsPlatform()) && notBlank(f.externalJobId())) {
            for (ConOpportunityRow r : repo.findByAtsAndExternalId(orgId, consultantId, f.atsPlatform().trim(), f.externalJobId().trim())) matched.putIfAbsent(r.opportunityId(), r);
        }
        if (notBlank(f.jobUrl())) {
            Set<String> hashes = new LinkedHashSet<>();
            String withId = UrlKeys.keyHash(f.jobUrl().trim(), notBlank(f.externalJobId()) ? f.externalJobId().trim() : null);
            String plain = UrlKeys.keyHash(f.jobUrl().trim(), null);
            if (withId != null) hashes.add(withId);
            if (plain != null) hashes.add(plain);
            for (String h : hashes) for (ConOpportunityRow r : repo.findByUrlKeyHash(orgId, consultantId, h)) matched.putIfAbsent(r.opportunityId(), r);
        }
        boolean linked = false;
        for (ConOpportunityRow r : matched.values()) {
            if (ConOpportunityService.NOT_OPEN.contains(r.state())) continue;
            if (links.findByOrgIdAndOpportunityIdAndUnlinkedAtIsNull(orgId, r.opportunityId()).isPresent()) continue;
            MktOpportunity opp = repo.findOwned(orgId, consultantId, r.opportunityId()).orElse(null);
            if (opp == null || ConOpportunityService.NOT_OPEN.contains(opp.getState())) continue;
            opp.setState("APPLIED");
            opp.setAppliedAt(f.appliedAt() != null ? f.appliedAt() : now);
            opp.setLastResponseAt(now);
            opp.setUpdatedAt(now);
            opportunities.save(opp);
            MktPipelineApplicationLink l = new MktPipelineApplicationLink();
            l.setOrgId(orgId);
            l.setOpportunityId(opp.getId());
            l.setConsultantId(consultantId);
            l.setPersonalApplicationId(f.applicationId());
            l.setSource(MktPipelineApplicationLink.SOURCE_LINKER);
            l.setLinkedAt(now);
            if (consent == ShareScope.FULL) {
                l.setTalentApplicationId(projection.upsert(orgId, opp.getId(), r.jobId(), consultantId, r.assignedByMemberId(), f.applicationId(), opp.getAppliedAt()));
            }
            links.save(l);
            record(opp, "APPLIED", "applied (detected from their own submission)", now);
            audit.record(orgId, OrgAuditService.SYSTEM_ACTOR, null, "LINKER_OPPORTUNITY_APPLIED", "OPPORTUNITY", null, String.valueOf(opp.getId()), "application " + f.applicationId(), null);
            linked = true;
        }
        if (!linked && matched.isEmpty()) suggest(orgId, consultantId, f, now);
    }

    /** Same company and same title on an open opportunity: only an event for the consultant to act on, never a link (doc 60 section 0.7). Once per opportunity. */
    private void suggest(Long orgId, Long consultantId, Facts f, Instant now) {
        String company = ApplicationKeys.company(f.company());
        String title = ApplicationKeys.title(f.title());
        if (company.isEmpty() || title.isEmpty()) return;
        int made = 0;
        for (ConOpportunityRow r : repo.findNotIn(orgId, consultantId, ConOpportunityService.NOT_OPEN)) {
            if (made >= SUGGESTION_LIMIT) break;
            if (!company.equals(ApplicationKeys.company(r.employer())) || !title.equals(ApplicationKeys.title(r.title()))) continue;
            boolean already = events.findByOrgIdAndOpportunityIdOrderByOccurredAtDesc(orgId, r.opportunityId()).stream().anyMatch(e -> SUGGESTED.equals(e.getKind()));
            if (already) continue;
            MktOpportunityEvent e = new MktOpportunityEvent();
            e.setOrgId(orgId);
            e.setOpportunityId(r.opportunityId());
            e.setKind(SUGGESTED);
            e.setText("may have applied to this job (link suggested to the consultant)");
            e.setOccurredAt(now);
            events.save(e);
            made++;
        }
    }

    private void record(MktOpportunity opp, String kind, String text, Instant now) {
        MktOpportunityEvent e = new MktOpportunityEvent();
        e.setOrgId(opp.getOrgId());
        e.setOpportunityId(opp.getId());
        e.setKind(kind);
        e.setText(text);
        e.setOccurredAt(now);
        events.save(e);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
