package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.AssignmentHealth;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TenantScoped;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Optional nightly producer for organization matching. It only submits explicit system runs after selecting an active,
 * marketed consultant and proving an effective acting assignment; all entitlement and provider work remains in the
 * matching service.
 */
@Component
public final class OrgMatchJob {

    private static final Logger LOG = LoggerFactory.getLogger(OrgMatchJob.class);
    private static final Set<AssignmentKind> ACTING_KINDS = AssignmentKind.ACTING;
    private static final Set<String> EXPECTED_SKIP_CODES = Set.of("FEATURE_NOT_LICENSED", "CONSENT_REQUIRED", "FEATURE_ALLOWANCE_EXHAUSTED");

    private final OrganizationRepository organizations;
    private final ConsultantProfileRepository consultants;
    private final OrgAssignmentRepository assignments;
    private final OrgMatchService matcher;
    private final OrgMatchJobProperties properties;

    public OrgMatchJob(
        OrganizationRepository organizations,
        ConsultantProfileRepository consultants,
        OrgAssignmentRepository assignments,
        OrgMatchService matcher,
        OrgMatchJobProperties properties
    ) {
        this.organizations = organizations;
        this.consultants = consultants;
        this.assignments = assignments;
        this.matcher = matcher;
        this.properties = properties;
    }

    public record OrgResult(Long orgId, int checked, int ran, int skipped, int failed, int written) {}

    @Scheduled(cron = "${dossier.ent.matching-cron:0 0 2 * * *}", zone = "UTC")
    public void scheduled() {
        if (!properties.isEnabled()) return;
        try {
            List<OrgResult> results = runOnce(Instant.now());
            int ran = results.stream().mapToInt(OrgResult::ran).sum();
            int written = results.stream().mapToInt(OrgResult::written).sum();
            if (ran > 0) LOG.info("Nightly organization matching ran {} consultant batch(es) and wrote {} match(es)", ran, written);
        } catch (RuntimeException failure) {
            LOG.warn("Nightly organization matching run failed", failure);
        }
    }

    /** Runs one bounded pass. A failure in one organization or consultant never stops the remaining work. */
    public List<OrgResult> runOnce(Instant now) {
        if (!properties.isEnabled()) return List.of();
        Instant reference = now == null ? Instant.now() : now;
        List<Long> orgIds = new ArrayList<>();
        TenantScoped.unscoped(() -> {
            List<Long> found = organizations.findAllOrgIds();
            if (found != null) orgIds.addAll(found);
        });

        List<OrgResult> results = new ArrayList<>();
        for (Long orgId : orgIds) {
            if (orgId == null) continue;
            try {
                results.add(TenantScoped.get(orgId, () -> runOrganization(orgId, reference)));
            } catch (RuntimeException failure) {
                LOG.warn("Nightly organization matching failed for org {}", orgId, failure);
                results.add(new OrgResult(orgId, 0, 0, 0, 1, 0));
            }
        }
        return List.copyOf(results);
    }

    private OrgResult runOrganization(Long orgId, Instant now) {
        Organization organization = organizations.findByOrgId(orgId).orElse(null);
        if (organization == null || organization.getStatus() != OrgStatus.ACTIVE) return new OrgResult(orgId, 0, 0, 1, 0, 0);

        OrgMembership system = systemActor(organization);
        ZoneId zone = zoneOf(organization.getTimezone());
        LocalDate day = now.atZone(zone).toLocalDate();
        int cap = properties.boundedChecksPerRun();
        List<ConsultantProfile> eligible = consultants.findByOrgId(orgId).stream()
            .filter(OrgMatchJob::eligible)
            .sorted(Comparator.comparing(ConsultantProfile::getDisplayName, Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER)).thenComparing(ConsultantProfile::getMemberId))
            .limit(cap)
            .toList();

        int checked = 0;
        int ran = 0;
        int skipped = 0;
        int failed = 0;
        int written = 0;
        for (ConsultantProfile profile : eligible) {
            checked++;
            List<Long> assigneeIds = effectiveAssignees(orgId, profile.getMemberId(), now);
            if (assigneeIds.isEmpty()) {
                skipped++;
                continue;
            }

            String attemptId = "match:" + orgId + ":" + profile.getMemberId() + ":" + day;
            try {
                OrgMatchService.Result result = matcher.matchOneSystem(system, profile.getMemberId(), attemptId, assigneeIds);
                ran++;
                if (result != null) written += Math.max(0, result.written());
            } catch (OrgException refusal) {
                if (EXPECTED_SKIP_CODES.contains(refusal.getCode())) {
                    skipped++;
                    LOG.info("Nightly organization matching skipped org={} consultant={} reason={} status={}", orgId, profile.getMemberId(), refusal.getCode(), refusal.getStatus());
                } else {
                    failed++;
                    LOG.warn("Nightly organization matching refused unexpectedly for org {} consultant {}: {}", orgId, profile.getMemberId(), refusal.getCode(), refusal);
                }
            } catch (RuntimeException failureForConsultant) {
                failed++;
                LOG.warn("Nightly organization matching failed for org {} consultant {}", orgId, profile.getMemberId(), failureForConsultant);
            }
        }
        return new OrgResult(orgId, checked, ran, skipped, failed, written);
    }

    private List<Long> effectiveAssignees(Long orgId, Long consultantMemberId, Instant now) {
        Set<Long> ids = new LinkedHashSet<>();
        List<OrgAssignment> rows = assignments.findByConsultant(orgId, consultantMemberId);
        if (rows == null) return List.of();
        for (OrgAssignment row : rows) {
            if (
                row != null &&
                row.getAssigneeMemberId() != null &&
                ACTING_KINDS.contains(row.getKind()) &&
                row.getStartsAt() != null &&
                !row.getStartsAt().isAfter(now) &&
                (row.getEndsAt() == null || row.getEndsAt().isAfter(now)) &&
                row.getHealth() == AssignmentHealth.OK
            ) {
                ids.add(row.getAssigneeMemberId());
            }
        }
        return List.copyOf(ids);
    }

    private static boolean eligible(ConsultantProfile profile) {
        return profile != null &&
            profile.getMemberId() != null &&
            "ACTIVE".equalsIgnoreCase(profile.getStatus()) &&
            "ACTIVE".equalsIgnoreCase(profile.getMarketingStatus());
    }

    private static OrgMembership systemActor(Organization organization) {
        return new OrgMembership(
            organization.getId(),
            null,
            null,
            OrgAuditService.SYSTEM_ACTOR,
            null,
            OrgMemberStatus.ACTIVE,
            organization.getStatus(),
            List.of(),
            Map.of()
        );
    }

    private static ZoneId zoneOf(String raw) {
        if (raw == null || raw.isBlank()) return ZoneId.of("UTC");
        try {
            return ZoneId.of(raw);
        } catch (DateTimeException ignored) {
            return ZoneId.of("UTC");
        }
    }
}
