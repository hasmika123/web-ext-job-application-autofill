package com.dossier.api.service.ent.mkt.opportunities;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** {@code PUT mkt/opportunities/{id}/resume} (PINNED-RESUME-BUILD.md P1): which of the consultant's resumes goes with an assigned job. */
class MktOpportunitiesPinResumeTest {

    static final Long ORG = 7L;
    static final Long ME = 70L;
    static final Long CONSULTANT = 10L;
    static final Instant NOW = Instant.parse("2026-11-10T12:00:00Z");

    MktScope scope = mock(MktScope.class);
    MktOpportunityRepository repo = mock(MktOpportunityRepository.class);
    MktOpportunityEventRepository events = mock(MktOpportunityEventRepository.class);
    OrgResumeRepository orgResumes = mock(OrgResumeRepository.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    MktOpportunitiesService service;
    OrgMembership me = new OrgMembership(ORG, ME, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    MktOpportunity opp;
    MktOpportunityRow row;
    List<MktOpportunityEvent> saved = new ArrayList<>();
    MktScope.View view = new MktScope.View(ORG, ME, true, Set.of());

    @BeforeEach
    void wire() {
        MktOpportunitiesService real = new MktOpportunitiesService(
            scope, mock(OpportunityAssignmentService.class), repo, events, mock(RequirementMatchRepository.class), mock(ConsultantProfileRepository.class),
            mock(ClientRequirementRepository.class), mock(ClientAccountRepository.class), mock(ConsultantSkillRepository.class), mock(RequirementSkillRepository.class),
            mock(OrgMemberRepository.class), mock(UserRepository.class), audit, Clock.fixed(NOW, ZoneOffset.UTC)
        );
        real.setOrgResumes(orgResumes);
        service = spy(real);
        doReturn(null).when(service).detail(any(), any()); // the detail is the page's read; this test is about the write
        lenient().when(scope.resolve(any(), eq(MktOpportunitiesService.PERMISSION))).thenAnswer(i -> view);
        opp = new MktOpportunity();
        opp.setId(901L);
        opp.setOrgId(ORG);
        opp.setMatchId(5L);
        opp.setState("NO_RESPONSE");
        row = row("ASSIGNED");
        lenient().when(repo.findRow(eq(ORG), eq(5L))).thenAnswer(i -> Optional.ofNullable(row));
        lenient().when(repo.lockByOrgIdAndId(eq(ORG), eq(901L))).thenAnswer(i -> Optional.ofNullable(opp));
        lenient().when(repo.save(any(MktOpportunity.class))).thenAnswer(i -> i.getArgument(0));
        lenient().when(events.save(any(MktOpportunityEvent.class))).thenAnswer(i -> {
            saved.add(i.getArgument(0));
            return i.getArgument(0);
        });
        lenient().when(orgResumes.findByOrgIdAndId(ORG, 31L)).thenReturn(Optional.of(resume(31L, CONSULTANT, "APPROVED", "ORG_MANAGED")));
        lenient().when(orgResumes.findByOrgIdAndId(ORG, 32L)).thenReturn(Optional.of(resume(32L, CONSULTANT, "PENDING", "ORG_MANAGED")));
        lenient().when(orgResumes.findByOrgIdAndId(ORG, 33L)).thenReturn(Optional.of(resume(33L, CONSULTANT, "REJECTED", "ORG_MANAGED")));
        lenient().when(orgResumes.findByOrgIdAndId(ORG, 34L)).thenReturn(Optional.of(resume(34L, 99L, "APPROVED", "ORG_MANAGED")));
    }

    MktOpportunityRow row(String matchStatus) {
        return new MktOpportunityRow(
            5L, CONSULTANT, "Alex Kim", 500L, "Java Engineer", "Austin, TX", "HYBRID", "OPEN", 3L, "Acme", 80, "fits", matchStatus, NOW.minus(Duration.ofDays(1)), NOW.minus(Duration.ofDays(2)),
            901L, "NO_RESPONSE", 9L, NOW.plus(Duration.ofDays(1)), null, null, NOW, 9L
        );
    }

    static OrgResume resume(Long id, Long consultantId, String status, String kind) {
        OrgResume r = new OrgResume();
        r.setId(id);
        r.setOrgId(ORG);
        r.setConsultantId(consultantId);
        r.setResumeId(id + 1000);
        r.setKind(kind);
        r.setName("Resume " + id);
        r.setApprovalStatus(status);
        return r;
    }

    @Test
    void anApprovedResumeIsChosenWithOneTimelineLineAndOneAuditRow() {
        service.pinResume(me, 5L, 31L);
        assertThat(opp.getPinnedOrgResumeId()).isEqualTo(31L);
        assertThat(opp.getPinnedByMemberId()).isEqualTo(ME);
        assertThat(opp.getPinnedAt()).isEqualTo(NOW);
        assertThat(saved).singleElement().satisfies(e -> assertThat(e.getKind()).isEqualTo("RESUME_CHOSEN"));
        verify(audit).record(eq(me), eq("MARKETER_OPPORTUNITY_RESUME"), eq("OPPORTUNITY"), any(), eq("5"), anyString());
    }

    @Test
    void aResumeWaitingForTheConsultantCanBeChosen() {
        service.pinResume(me, 5L, 32L);
        assertThat(opp.getPinnedOrgResumeId()).isEqualTo(32L);
    }

    @Test
    void aResumeTheConsultantSentBackCannotBeChosen() {
        assertThatThrownBy(() -> service.pinResume(me, 5L, 33L)).hasMessageContaining("can't be used");
        assertThat(opp.getPinnedOrgResumeId()).isNull();
    }

    @Test
    void anotherConsultantsResumeOrAnUnknownIdIsTheGeneric404() {
        assertThatThrownBy(() -> service.pinResume(me, 5L, 34L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.pinResume(me, 5L, 999L)).isInstanceOf(OrgNotFoundException.class);
        assertThat(opp.getPinnedOrgResumeId()).isNull();
    }

    @Test
    void onlyAnAssignedJobTakesAResume() {
        row = row("SUGGESTED");
        assertThatThrownBy(() -> service.pinResume(me, 5L, 31L)).hasMessageContaining("once the job is assigned");
    }

    @Test
    void clearingGoesBackToTheUsualPickAndAChoiceThatChangesNothingWritesNothing() {
        service.pinResume(me, 5L, 31L);
        saved.clear();
        service.pinResume(me, 5L, 31L);
        assertThat(saved).isEmpty();
        service.pinResume(me, 5L, null);
        assertThat(opp.getPinnedOrgResumeId()).isNull();
        assertThat(opp.getPinnedByMemberId()).isNull();
        assertThat(saved).singleElement().satisfies(e -> assertThat(e.getKind()).isEqualTo("RESUME_CLEARED"));
    }

    @Test
    void theStatesSayWhatPrepareMayUse() {
        assertThat(PinnedResumes.state(resume(1L, CONSULTANT, "APPROVED", "ORG_MANAGED"))).isEqualTo(PinnedResumes.State.READY);
        assertThat(PinnedResumes.state(resume(1L, CONSULTANT, "PENDING", "ORG_MANAGED"))).isEqualTo(PinnedResumes.State.NEEDS_APPROVAL);
        assertThat(PinnedResumes.state(resume(1L, CONSULTANT, "PENDING", "PERSONAL_SHARED"))).as("the consultant's own needs no approval").isEqualTo(PinnedResumes.State.READY);
        assertThat(PinnedResumes.state(resume(1L, CONSULTANT, "REJECTED", "ORG_MANAGED"))).isEqualTo(PinnedResumes.State.UNUSABLE);
        OrgResume noFile = resume(1L, CONSULTANT, "APPROVED", "ORG_MANAGED");
        noFile.setResumeId(null);
        assertThat(PinnedResumes.state(noFile)).isEqualTo(PinnedResumes.State.UNUSABLE);
        verify(audit, never()).record(any(OrgMembership.class), anyString(), any(), any(), any(), any());
    }
}
