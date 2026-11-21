package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.repository.ent.pipeline.OpportunityMatchRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ai.AiCallContext;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.jobs.JobBoardProperties;
import com.dossier.api.service.jobs.JobScoreParser;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.ent.authz.AuthzDecision;
import com.dossier.api.service.ent.authz.AuthzReason;
import com.dossier.api.service.ent.billing.MatchingUsageLedger;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OrgMatchServiceTest {

    private static final Long ORG = 7L;
    private static final Long MARKETER = 70L;
    private static final Long CONSULTANT = 10L;
    private static final Long PROFILE = 101L;
    private static final Long USER = 1001L;
    private static final Instant NOW = Instant.parse("2026-11-21T10:15:00Z");

    @Mock OpportunityCandidateProjector projector;
    @Mock OpportunityRuleScorer rules;
    @Mock OpportunityAiScorer ai;
    @Mock OpportunityMatchingEntitlementService entitlement;
    @Mock MatchingBatchSettings batchSettings;
    @Mock OpportunityMatchRepository matches;
    @Mock JobOpportunityRepository opportunities;
    @Mock JobPostingRepository postings;
    @Mock ConsultantProfileRepository consultants;
    @Mock ConsultantSkillRepository skills;
    @Mock OrgResumeRepository orgResumes;
    @Mock OrgMemberRepository members;
    @Mock ResumeRepository personalResumes;
    @Mock BioRepository bios;
    @Mock JobBoardProperties jobProperties;

    private final OrgMembership actor = new OrgMembership(ORG, MARKETER, 700L, "sarah", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private final AiCallContext context = AiCallContext.organization("sarah", "anika", ORG, OpportunityMatchingEntitlementService.FEATURE, 900L);
    private OrgMatchService service;

    @BeforeEach
    void setUp() {
        service = new OrgMatchService(
            projector,
            rules,
            ai,
            entitlement,
            batchSettings,
            matches,
            opportunities,
            postings,
            consultants,
            skills,
            orgResumes,
            members,
            personalResumes,
            bios,
            jobProperties,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        when(batchSettings.maxFor(ORG)).thenReturn(20);
        when(jobProperties.getFreshHours()).thenReturn(48);
        when(postings.findByPublishedAtAfter(any(Instant.class))).thenReturn(List.of());
    }

    @Test
    void licensedRunUsesFullProfileOnceAndWritesAnAiSuggestion() {
        ConsultantProfile profile = profile();
        when(consultants.findByOrgIdAndMemberId(ORG, CONSULTANT)).thenReturn(Optional.of(profile));
        when(members.findByOrgIdAndId(ORG, CONSULTANT)).thenReturn(Optional.of(seat()));
        when(personalResumes.findByUserId(USER)).thenReturn(List.of(resume()));
        when(bios.findByUserId(USER)).thenReturn(List.of(bio()));
        when(orgResumes.findByOrgIdAndConsultantId(ORG, PROFILE)).thenReturn(List.of());
        when(matches.findByOrgIdAndOpportunityIdAndConsultantMemberId(eq(ORG), any(Long.class), eq(CONSULTANT))).thenReturn(Optional.empty());

        OpportunityMatchingEntitlementService.Decision decision = allowedDecision();
        when(entitlement.reserve(actor, CONSULTANT, "run-1", NOW)).thenReturn(decision);
        OpportunityCandidateProjector.Candidate candidate = candidate(501L);
        when(projector.projectOpen(ORG, List.of())).thenReturn(List.of(candidate));
        when(ai.score(isNull(), anyString(), eq(Set.of("j1")), eq(context))).thenReturn(
            new OpportunityAiScorer.Result(new AiResult("{\"scores\":[{\"id\":\"j1\",\"score\":92,\"why\":\"Strong skills\"}]}", "gpt-test", 10, 0, 4), Map.of("j1", new JobScoreParser.Score(92, "Strong skills")))
        );

        OrgMatchService.Result result = service.matchOne(actor, CONSULTANT, "run-1", NOW);

        assertThat(result.status()).isEqualTo(OrgMatchService.Status.AI);
        assertThat(result.candidates()).isEqualTo(1);
        assertThat(result.scored()).isEqualTo(1);
        assertThat(result.written()).isEqualTo(1);
        ArgumentCaptor<OpportunityMatch> saved = ArgumentCaptor.forClass(OpportunityMatch.class);
        verify(matches).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getOpportunityId()).isEqualTo(501L);
        assertThat(saved.getValue().getConsultantMemberId()).isEqualTo(CONSULTANT);
        assertThat(saved.getValue().getSource()).isEqualTo(OrgMatchService.SOURCE_AI);
        assertThat(saved.getValue().getScore()).isEqualTo(92);
        assertThat(saved.getValue().getModel()).isEqualTo("gpt-test");
        verify(entitlement).commit(decision, 1, NOW);
        verify(entitlement, never()).release(any(), anyString(), any(Instant.class));
    }

    @Test
    void unlicensedRunUsesOnlyOrganizationSkillsAndNeverCallsAi() {
        ConsultantProfile profile = profile();
        when(consultants.findByOrgIdAndMemberId(ORG, CONSULTANT)).thenReturn(Optional.of(profile));
        when(skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(ORG, PROFILE)).thenReturn(List.of(skill("Java"), skill("Kafka"), skill("PostgreSQL"), skill("AWS")));
        when(matches.findByOrgIdAndOpportunityIdAndConsultantMemberId(eq(ORG), any(Long.class), eq(CONSULTANT))).thenReturn(Optional.empty());
        OpportunityMatchingEntitlementService.Decision denied = new OpportunityMatchingEntitlementService.Decision(
            false,
            AuthzDecision.deny(ORG, AuthzReason.FEATURE_NOT_LICENSED, List.of(OpportunityMatchingEntitlementService.PERMISSION)),
            AuthzReason.FEATURE_NOT_LICENSED,
            Map.of(),
            null,
            null
        );
        when(entitlement.reserve(actor, CONSULTANT, "run-rule", NOW)).thenReturn(denied);
        OpportunityCandidateProjector.Candidate candidate = candidate(601L);
        when(projector.projectOpen(ORG, List.of())).thenReturn(List.of(candidate));
        when(rules.score(any(), eq(candidate))).thenReturn(new OpportunityRuleScorer.Result(true, 84, null, List.of("Skills: Java"), "Skills: Java"));

        OrgMatchService.Result result = service.matchOne(actor, CONSULTANT, "run-rule", NOW);

        assertThat(result.status()).isEqualTo(OrgMatchService.Status.RULE);
        assertThat(result.scored()).isEqualTo(1);
        ArgumentCaptor<OpportunityMatch> saved = ArgumentCaptor.forClass(OpportunityMatch.class);
        verify(matches).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getSource()).isEqualTo(OrgMatchService.SOURCE_RULE);
        assertThat(saved.getValue().getModel()).isEqualTo(OpportunityRuleScorer.ALGORITHM_VERSION);
        verifyNoInteractions(ai, personalResumes, bios, members, orgResumes);
        verify(entitlement, never()).commit(any(), any(Long.class), any(Instant.class));
        verify(entitlement, never()).release(any(), anyString(), any(Instant.class));
    }

    @Test
    void publicCandidateIsMaterializedBeforeItsMatchIsWritten() {
        ConsultantProfile profile = profile();
        when(consultants.findByOrgIdAndMemberId(ORG, CONSULTANT)).thenReturn(Optional.of(profile));
        when(skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(ORG, PROFILE)).thenReturn(List.of(skill("Java"), skill("Kafka"), skill("PostgreSQL"), skill("AWS")));
        when(matches.findByOrgIdAndOpportunityIdAndConsultantMemberId(eq(ORG), any(Long.class), eq(CONSULTANT))).thenReturn(Optional.empty());
        OpportunityMatchingEntitlementService.Decision denied = new OpportunityMatchingEntitlementService.Decision(
            false,
            AuthzDecision.deny(ORG, AuthzReason.FEATURE_NOT_LICENSED, List.of(OpportunityMatchingEntitlementService.PERMISSION)),
            AuthzReason.FEATURE_NOT_LICENSED,
            Map.of(),
            null,
            null
        );
        when(entitlement.reserve(actor, CONSULTANT, "public-rule", NOW)).thenReturn(denied);
        OpportunityCandidateProjector.Candidate publicCandidate = new OpportunityCandidateProjector.Candidate(
            ORG,
            OpportunityCandidateProjector.Source.PUBLIC_POSTING,
            null,
            777L,
            "JOB_POSTING",
            "Backend Engineer",
            "Acme",
            "Remote (India)",
            "REMOTE",
            true,
            "https://jobs.example/777",
            "https://jobs.example/apply/777",
            "Requirements: Java and Kafka",
            null,
            "BOARD_API",
            "public-777",
            NOW,
            null,
            10
        );
        when(projector.projectOpen(ORG, List.of())).thenReturn(List.of(publicCandidate));
        when(opportunities.findByOrgIdAndPostingId(ORG, 777L)).thenReturn(Optional.empty());
        when(opportunities.findByOrgIdAndDedupeKey(ORG, "public-777")).thenReturn(Optional.empty());
        when(opportunities.saveAndFlush(any(JobOpportunity.class))).thenAnswer(invocation -> {
            JobOpportunity row = invocation.getArgument(0);
            row.setId(1001L);
            return row;
        });
        when(rules.score(any(), eq(publicCandidate))).thenReturn(new OpportunityRuleScorer.Result(true, 80, null, List.of("Skills: Java"), "Skills: Java"));

        OrgMatchService.Result result = service.matchOne(actor, CONSULTANT, "public-rule", NOW);

        assertThat(result.written()).isEqualTo(1);
        ArgumentCaptor<JobOpportunity> opportunity = ArgumentCaptor.forClass(JobOpportunity.class);
        verify(opportunities).saveAndFlush(opportunity.capture());
        assertThat(opportunity.getValue().getKind()).isEqualTo("JOB_POSTING");
        assertThat(opportunity.getValue().getPostingId()).isEqualTo(777L);
        assertThat(opportunity.getValue().getCreatedByMemberId()).isEqualTo(MARKETER);
        ArgumentCaptor<OpportunityMatch> match = ArgumentCaptor.forClass(OpportunityMatch.class);
        verify(matches).saveAndFlush(match.capture());
        assertThat(match.getValue().getOpportunityId()).isEqualTo(1001L);
    }

    @Test
    void rerunUpdatesAnExistingPairWithoutReopeningItsLifecycleStatus() {
        ConsultantProfile profile = profile();
        when(consultants.findByOrgIdAndMemberId(ORG, CONSULTANT)).thenReturn(Optional.of(profile));
        when(members.findByOrgIdAndId(ORG, CONSULTANT)).thenReturn(Optional.of(seat()));
        when(personalResumes.findByUserId(USER)).thenReturn(List.of(resume()));
        when(bios.findByUserId(USER)).thenReturn(List.of(bio()));
        when(orgResumes.findByOrgIdAndConsultantId(ORG, PROFILE)).thenReturn(List.of());
        OpportunityMatchingEntitlementService.Decision decision = allowedDecision();
        when(entitlement.reserve(actor, CONSULTANT, "rerun", NOW)).thenReturn(decision);
        OpportunityCandidateProjector.Candidate candidate = candidate(701L);
        when(projector.projectOpen(ORG, List.of())).thenReturn(List.of(candidate));
        when(ai.score(isNull(), anyString(), eq(Set.of("j1")), eq(context))).thenReturn(
            new OpportunityAiScorer.Result(new AiResult("{}", "gpt-test", 1, 0, 1), Map.of("j1", new JobScoreParser.Score(73, "Updated")))
        );
        OpportunityMatch existing = new OpportunityMatch();
        existing.setId(801L);
        existing.setOrgId(ORG);
        existing.setOpportunityId(701L);
        existing.setConsultantMemberId(CONSULTANT);
        existing.setStatus("DISMISSED");
        when(matches.findByOrgIdAndOpportunityIdAndConsultantMemberId(ORG, 701L, CONSULTANT)).thenReturn(Optional.of(existing));

        OrgMatchService.Result result = service.matchOne(actor, CONSULTANT, "rerun", NOW);

        assertThat(result.written()).isEqualTo(1);
        assertThat(existing.getId()).isEqualTo(801L);
        assertThat(existing.getStatus()).isEqualTo("DISMISSED");
        assertThat(existing.getScore()).isEqualTo(73);
        verify(matches).saveAndFlush(existing);
    }

    @Test
    void providerFailureReleasesTheReservationAndDoesNotWriteMatches() {
        ConsultantProfile profile = profile();
        when(consultants.findByOrgIdAndMemberId(ORG, CONSULTANT)).thenReturn(Optional.of(profile));
        when(members.findByOrgIdAndId(ORG, CONSULTANT)).thenReturn(Optional.of(seat()));
        when(personalResumes.findByUserId(USER)).thenReturn(List.of(resume()));
        when(bios.findByUserId(USER)).thenReturn(List.of(bio()));
        when(orgResumes.findByOrgIdAndConsultantId(ORG, PROFILE)).thenReturn(List.of());
        OpportunityMatchingEntitlementService.Decision decision = allowedDecision();
        when(entitlement.reserve(actor, CONSULTANT, "failure", NOW)).thenReturn(decision);
        when(projector.projectOpen(ORG, List.of())).thenReturn(List.of(candidate(901L)));
        when(ai.score(isNull(), anyString(), eq(Set.of("j1")), eq(context))).thenThrow(new AiProviderException("provider down"));

        assertThatThrownBy(() -> service.matchOne(actor, CONSULTANT, "failure", NOW)).isInstanceOf(AiProviderException.class);

        verify(entitlement).release(decision, "FAILED", NOW);
        verify(matches, never()).saveAndFlush(any(OpportunityMatch.class));
        verify(entitlement, never()).commit(any(), any(Long.class), any(Instant.class));
    }

    private OpportunityMatchingEntitlementService.Decision allowedDecision() {
        AuthzDecision auth = AuthzDecision.allow(ORG, actor, CONSULTANT, List.of(OpportunityMatchingEntitlementService.PERMISSION), Map.of());
        MatchingUsageLedger.Reservation reservation = new MatchingUsageLedger.Reservation(900L, MatchingUsageLedger.ReserveStatus.RESERVED, 20, "RESERVED");
        return new OpportunityMatchingEntitlementService.Decision(true, auth, null, Map.of(), reservation, context);
    }

    private static ConsultantProfile profile() {
        ConsultantProfile profile = new ConsultantProfile();
        profile.setId(PROFILE);
        profile.setOrgId(ORG);
        profile.setMemberId(CONSULTANT);
        profile.setDisplayName("Anika Consultant");
        profile.setEmail("anika@example.com");
        return profile;
    }

    private static ConsultantSkill skill(String value) {
        ConsultantSkill skill = new ConsultantSkill();
        skill.setOrgId(ORG);
        skill.setConsultantId(PROFILE);
        skill.setSkill(value);
        return skill;
    }

    private static OrgMember seat() {
        OrgMember seat = new OrgMember();
        seat.setId(CONSULTANT);
        seat.setOrgId(ORG);
        seat.setUserId(USER);
        return seat;
    }

    private static Resume resume() {
        Resume resume = new Resume();
        resume.setId(600L);
        resume.setDefaultResume(true);
        resume.setArchived(false);
        resume.setCreatedAt(NOW.minusSeconds(60));
        resume.setParsedJson("{\"experience\":[{\"title\":\"Senior Backend Engineer\",\"startDate\":\"2018\",\"endDate\":\"present\"}],\"skills\":[\"Java\",\"Kafka\",\"PostgreSQL\"]}");
        return resume;
    }

    private static Bio bio() {
        Bio bio = new Bio();
        bio.setPayload("{\"city\":\"Bengaluru\",\"country\":\"India\",\"workPreference\":\"Remote\"}");
        return bio;
    }

    private static OpportunityCandidateProjector.Candidate candidate(Long opportunityId) {
        return new OpportunityCandidateProjector.Candidate(
            ORG,
            OpportunityCandidateProjector.Source.CANONICAL_OPPORTUNITY,
            opportunityId,
            null,
            "CLIENT_REQUIREMENT",
            "Senior Backend Engineer",
            "Acme",
            "Remote (India)",
            "REMOTE",
            true,
            "https://jobs.example/" + opportunityId,
            "https://jobs.example/apply/" + opportunityId,
            "Requirements: Java, Kafka, PostgreSQL",
            null,
            "REQUIREMENT",
            "opp-" + opportunityId,
            NOW,
            null,
            0
        );
    }
}
