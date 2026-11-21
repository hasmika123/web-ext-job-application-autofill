package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.service.jobs.JobPrefilter;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OpportunityCandidateProjectorTest {

    private static final Long ORG = 7L;
    private static final Long OTHER_ORG = 8L;
    private static final List<String> OPEN_STATUSES = List.of("NEW", "TRIAGED", "ASSIGNED");

    @Mock JobOpportunityRepository opportunities;

    private OpportunityCandidateProjector projector;

    @BeforeEach
    void setUp() {
        projector = new OpportunityCandidateProjector(opportunities);
    }

    @Test
    void loadsOnlyOpenRowsForTheRequestedOrganizationAndMergesPublicCandidates() {
        JobOpportunity open = opportunity(101L, ORG, "NEW", 501L, "open-key");
        JobOpportunity closed = opportunity(102L, ORG, "CLOSED", 502L, "closed-key");
        JobOpportunity foreign = opportunity(103L, OTHER_ORG, "NEW", 503L, "foreign-key");
        JobPosting publicPosting = posting(601L, "public-key", "Public Backend Engineer");
        when(opportunities.findByOrgIdAndStatusInOrderByUpdatedAtDesc(ORG, OPEN_STATUSES))
            .thenReturn(List.of(open, closed, foreign));

        List<OpportunityCandidateProjector.Candidate> result = projector.projectOpen(
            ORG,
            List.of(new JobPrefilter.Candidate(publicPosting, 9))
        );

        assertThat(result).extracting(OpportunityCandidateProjector.Candidate::source).containsExactly(
            OpportunityCandidateProjector.Source.CANONICAL_OPPORTUNITY,
            OpportunityCandidateProjector.Source.PUBLIC_POSTING
        );
        assertThat(result.get(0).opportunityId()).isEqualTo(101L);
        assertThat(result.get(0).descriptionText()).isEqualTo("Canonical description");
        assertThat(result.get(1).postingId()).isEqualTo(601L);
        assertThat(result.get(1).prefilterRank()).isEqualTo(9);
        assertThat(result.get(1).sourceLabel()).isEqualTo("BOARD_API");
        assertThat(result.get(1).applyUrl()).isEqualTo("https://jobs.example/apply-posting/601");
        assertThat(result.get(1).availableAt()).isEqualTo(Instant.parse("2026-11-21T08:00:00Z"));
        assertThat(result).allSatisfy(candidate -> assertThat(candidate.orgId()).isEqualTo(ORG));
        verify(opportunities).findByOrgIdAndStatusInOrderByUpdatedAtDesc(ORG, OPEN_STATUSES);
    }

    @Test
    void canonicalOpportunityWinsPostingAndDedupeCollisions() {
        JobOpportunity canonical = opportunity(201L, ORG, "TRIAGED", 701L, "same-key");
        JobPosting samePosting = posting(701L, "different-key", "Same posting");
        JobPosting sameDedupe = posting(702L, "same-key", "Same dedupe");
        JobPosting unique = posting(703L, "unique-key", "Unique posting");
        when(opportunities.findByOrgIdAndStatusInOrderByUpdatedAtDesc(ORG, OPEN_STATUSES)).thenReturn(List.of(canonical));

        List<OpportunityCandidateProjector.Candidate> result = projector.projectOpen(
            ORG,
            List.of(
                new JobPrefilter.Candidate(samePosting, 10),
                new JobPrefilter.Candidate(sameDedupe, 8),
                new JobPrefilter.Candidate(unique, 6)
            )
        );

        assertThat(result).extracting(OpportunityCandidateProjector.Candidate::opportunityId).containsExactly(201L, null);
        assertThat(result).extracting(OpportunityCandidateProjector.Candidate::postingId).containsExactly(701L, 703L);
        assertThat(result.get(0).source()).isEqualTo(OpportunityCandidateProjector.Source.CANONICAL_OPPORTUNITY);
        assertThat(result.get(1).title()).isEqualTo("Unique posting");
    }

    @Test
    void duplicatePublicCandidatesAreKeptInPrefilterOrderOnce() {
        JobPosting first = posting(801L, "duplicate-key", "First public posting");
        JobPosting duplicate = posting(802L, "duplicate-key", "Duplicate public posting");
        JobPosting last = posting(803L, "last-key", "Last public posting");
        when(opportunities.findByOrgIdAndStatusInOrderByUpdatedAtDesc(ORG, OPEN_STATUSES)).thenReturn(List.of());

        List<OpportunityCandidateProjector.Candidate> result = projector.projectOpen(
            ORG,
            List.of(
                new JobPrefilter.Candidate(first, 11),
                new JobPrefilter.Candidate(duplicate, 10),
                new JobPrefilter.Candidate(last, 9)
            )
        );

        assertThat(result).extracting(OpportunityCandidateProjector.Candidate::postingId).containsExactly(801L, 803L);
        assertThat(result).extracting(OpportunityCandidateProjector.Candidate::prefilterRank).containsExactly(11, 9);
    }

    @Test
    void noPublicCandidatesStillReturnsCanonicalRows() {
        JobOpportunity canonical = opportunity(901L, ORG, "ASSIGNED", null, "requirement-key");
        when(opportunities.findByOrgIdAndStatusInOrderByUpdatedAtDesc(ORG, OPEN_STATUSES)).thenReturn(List.of(canonical));

        List<OpportunityCandidateProjector.Candidate> result = projector.projectOpen(ORG, null);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).source()).isEqualTo(OpportunityCandidateProjector.Source.CANONICAL_OPPORTUNITY);
        assertThat(result.get(0).kind()).isEqualTo("CLIENT_REQUIREMENT");
    }

    private static JobOpportunity opportunity(Long id, Long orgId, String status, Long postingId, String dedupeKey) {
        JobOpportunity opportunity = new JobOpportunity();
        opportunity.setId(id);
        opportunity.setOrgId(orgId);
        opportunity.setKind(postingId == null ? "CLIENT_REQUIREMENT" : "JOB_POSTING");
        opportunity.setPostingId(postingId);
        opportunity.setTitle("Canonical opportunity " + id);
        opportunity.setCompany("Acme");
        opportunity.setLocation("Remote (US)");
        opportunity.setUrl("https://jobs.example/opportunity/" + id);
        opportunity.setApplyUrl("https://jobs.example/apply/" + id);
        opportunity.setSourceLabel(postingId == null ? "REQUIREMENT" : "BOARD_API");
        opportunity.setDescriptionText("Canonical description");
        opportunity.setStatus(status);
        opportunity.setDedupeKey(dedupeKey);
        opportunity.setCreatedAt(Instant.parse("2026-11-21T09:00:00Z"));
        opportunity.setUpdatedAt(Instant.parse("2026-11-21T10:00:00Z"));
        return opportunity;
    }

    private static JobPosting posting(Long id, String dedupeKey, String title) {
        JobPosting posting = new JobPosting() {
            @Override
            public Long getId() {
                return id;
            }
        };
        posting.setTitle(title);
        posting.setCompany("Acme");
        posting.setLocation("Remote (US)");
        posting.setUrl("https://jobs.example/posting/" + id);
        posting.setApplyUrl("https://jobs.example/apply-posting/" + id);
        posting.setDescriptionText("Public description");
        posting.setPublishedAt(Instant.parse("2026-11-21T08:00:00Z"));
        posting.setDedupKey(dedupeKey);
        return posting;
    }
}
