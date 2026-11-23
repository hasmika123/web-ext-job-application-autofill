package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.service.jobs.JobPrefilter;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Projects the two existing job-source shapes into the candidate contract consumed by organization matching.
 * The public-posting list is already filtered by {@link JobPrefilter}; this seam only loads the org-owned open rows,
 * maps fields, and removes identities that would otherwise be scored twice.
 */
@Service
public class OpportunityCandidateProjector {

    public static final List<String> OPEN_STATUSES = List.of("NEW", "TRIAGED", "ASSIGNED");
    private static final Set<String> OPEN_STATUS_SET = Set.copyOf(OPEN_STATUSES);

    public enum Source {
        CANONICAL_OPPORTUNITY,
        PUBLIC_POSTING
    }

    /** One source-neutral candidate; scoring and match persistence should not inspect the source entity. */
    public record Candidate(
        Long orgId,
        Source source,
        Long opportunityId,
        Long postingId,
        String kind,
        String title,
        String company,
        String location,
        String workplaceType,
        Boolean remote,
        String url,
        String applyUrl,
        String descriptionText,
        String skillsJson,
        String sourceLabel,
        String dedupeKey,
        Instant availableAt,
        Instant closesAt,
        int prefilterRank
    ) {}

    private final JobOpportunityRepository opportunities;

    @Autowired
    public OpportunityCandidateProjector(JobOpportunityRepository opportunities) {
        this.opportunities = opportunities;
    }

    /**
     * Loads this organization's open opportunities and merges them with public candidates already selected by
     * {@link JobPrefilter}. Canonical rows are emitted first and reserve their posting/dedupe identities.
     */
    public List<Candidate> projectOpen(Long orgId, List<JobPrefilter.Candidate> publicCandidates) {
        Objects.requireNonNull(orgId, "orgId");
        List<JobOpportunity> canonical = opportunities.findByOrgIdAndStatusInOrderByUpdatedAtDesc(orgId, OPEN_STATUSES);
        return project(orgId, canonical, publicCandidates);
    }

    private static List<Candidate> project(
        Long orgId,
        List<JobOpportunity> canonical,
        List<JobPrefilter.Candidate> publicCandidates
    ) {
        List<Candidate> out = new ArrayList<>();
        Set<Long> postingIds = new HashSet<>();
        Set<String> dedupeKeys = new HashSet<>();

        for (JobOpportunity opportunity : emptyIfNull(canonical)) {
            if (opportunity == null || !Objects.equals(orgId, opportunity.getOrgId()) || opportunity.getId() == null) continue;
            if (!OPEN_STATUS_SET.contains(normalizeStatus(opportunity.getStatus()))) continue;
            String dedupeKey = normalizeKey(opportunity.getDedupeKey());
            if (!reserve(opportunity.getPostingId(), dedupeKey, postingIds, dedupeKeys)) continue;

            out.add(new Candidate(
                orgId,
                Source.CANONICAL_OPPORTUNITY,
                opportunity.getId(),
                opportunity.getPostingId(),
                opportunity.getKind(),
                opportunity.getTitle(),
                opportunity.getCompany(),
                opportunity.getLocation(),
                null,
                null,
                opportunity.getUrl(),
                opportunity.getApplyUrl(),
                opportunity.getDescriptionText(),
                opportunity.getSkillsJson(),
                opportunity.getSourceLabel(),
                opportunity.getDedupeKey(),
                opportunity.getUpdatedAt() != null ? opportunity.getUpdatedAt() : opportunity.getCreatedAt(),
                opportunity.getClosesAt(),
                0
            ));
        }

        for (JobPrefilter.Candidate publicCandidate : emptyIfNull(publicCandidates)) {
            if (publicCandidate == null || publicCandidate.posting() == null) continue;
            JobPosting posting = publicCandidate.posting();
            if (posting.getId() == null) continue;
            if (!reserve(posting.getId(), normalizeKey(posting.getDedupKey()), postingIds, dedupeKeys)) continue;

            out.add(new Candidate(
                orgId,
                Source.PUBLIC_POSTING,
                null,
                posting.getId(),
                "JOB_POSTING",
                posting.getTitle(),
                posting.getCompany(),
                posting.getLocation(),
                posting.getWorkplaceType(),
                posting.getRemote(),
                posting.getUrl(),
                posting.getApplyUrl(),
                posting.getDescriptionText(),
                null,
                "BOARD_API",
                posting.getDedupKey(),
                posting.getPublishedAt(),
                null,
                publicCandidate.rank()
            ));
        }

        return List.copyOf(out);
    }

    private static boolean reserve(Long postingId, String dedupeKey, Set<Long> postingIds, Set<String> dedupeKeys) {
        if (postingId != null && postingIds.contains(postingId)) return false;
        if (dedupeKey != null && dedupeKeys.contains(dedupeKey)) return false;
        if (postingId != null) postingIds.add(postingId);
        if (dedupeKey != null) dedupeKeys.add(dedupeKey);
        return true;
    }

    private static String normalizeStatus(String value) {
        return value == null ? "" : value.strip().toUpperCase(Locale.ROOT);
    }

    private static String normalizeKey(String value) {
        if (value == null || value.isBlank()) return null;
        return value.strip().toLowerCase(Locale.ROOT);
    }

    private static <T> List<T> emptyIfNull(List<T> values) {
        return values == null ? List.of() : values;
    }
}
