package com.dossier.api.service.ent.mkt.opportunities;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
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
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
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
import org.springframework.data.domain.Pageable;

/** {@code POST mkt/opportunities/{id}/answer-info}: the marketer answers the consultant's question; the consultant's state never moves. */
class MktOpportunitiesAnswerInfoTest {

    static final Long ORG = 7L;
    static final Long ME = 70L;
    static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");

    MktScope scope = mock(MktScope.class);
    MktOpportunityRepository repo = mock(MktOpportunityRepository.class);
    MktOpportunityEventRepository events = mock(MktOpportunityEventRepository.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    MktOpportunitiesService service;
    OrgMembership me = new OrgMembership(ORG, ME, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    MktOpportunity opp;
    MktOpportunityRow row;
    List<MktOpportunityEvent> saved = new ArrayList<>();
    MktScope.View view = new MktScope.View(ORG, ME, true, Set.of());

    @BeforeEach
    void wire() {
        service = new MktOpportunitiesService(
            scope, mock(OpportunityAssignmentService.class), repo, events, mock(RequirementMatchRepository.class), mock(ConsultantProfileRepository.class),
            mock(ClientRequirementRepository.class), mock(ClientAccountRepository.class), mock(ConsultantSkillRepository.class), mock(RequirementSkillRepository.class),
            mock(OrgMemberRepository.class), mock(UserRepository.class), audit, Clock.fixed(NOW, ZoneOffset.UTC)
        );
        lenient().when(scope.resolve(any(), eq(MktOpportunitiesService.PERMISSION))).thenAnswer(i -> view);
        org.mockito.Mockito.doAnswer(i -> {
            MktScope.View v = i.getArgument(0);
            if (!v.sees(i.getArgument(1))) throw new OrgNotFoundException();
            return null;
        }).when(scope).require(any(), any());

        opp = new MktOpportunity();
        opp.setId(901L);
        opp.setOrgId(ORG);
        opp.setMatchId(5L);
        opp.setState("NEEDS_INFO");
        opp.setInfoRequest("Is the role remote?");
        row = new MktOpportunityRow(
            5L, 10L, "Alex Kim", 500L, "Java Engineer", "Austin, TX", "HYBRID", "OPEN", 3L, "Acme", 80, "fits", "ASSIGNED", NOW.minus(Duration.ofDays(1)), NOW.minus(Duration.ofDays(2)),
            901L, "NO_RESPONSE", 9L, NOW.plus(Duration.ofDays(1)), null, null, NOW, 9L
        );
        lenient().when(repo.findRow(eq(ORG), eq(5L))).thenAnswer(i -> Optional.ofNullable(row));
        lenient().when(repo.lockByOrgIdAndId(eq(ORG), eq(901L))).thenAnswer(i -> Optional.ofNullable(opp));
        lenient().when(repo.findResumeFacts(ORG)).thenReturn(List.of());
        lenient().when(repo.save(any(MktOpportunity.class))).thenAnswer(i -> i.getArgument(0));
        lenient().when(events.save(any(MktOpportunityEvent.class))).thenAnswer(i -> {
            saved.add(i.getArgument(0));
            return i.getArgument(0);
        });
        lenient().when(events.recent(eq(ORG), any(Pageable.class))).thenReturn(List.of());
    }

    @Test
    void theAnswerIsStoredAnEventIsRecordedAndTheStateIsNotChanged() {
        var result = service.answerInfo(me, 5L, "  Yes, fully remote within the US.  ");

        assertThat(opp.getInfoAnswer()).isEqualTo("Yes, fully remote within the US.");
        assertThat(opp.getState()).isEqualTo("NEEDS_INFO");
        assertThat(opp.getInfoRequest()).isEqualTo("Is the role remote?");
        assertThat(opp.getUpdatedAt()).isEqualTo(NOW);
        assertThat(saved).singleElement().satisfies(e -> {
            assertThat(e.getKind()).isEqualTo("INFO_PROVIDED");
            assertThat(e.getOpportunityId()).isEqualTo(901L);
            assertThat(e.getActorMemberId()).isEqualTo(ME);
            assertThat(e.getText()).doesNotContain("remote"); // the event says what happened, the answer is not copied into the feed
        });
        assertThat(result.changed()).isTrue();
        assertThat(result.item().id()).isEqualTo(5L);
        verify(audit).record(me, "MARKETER_OPPORTUNITY_INFO_ANSWER", "OPPORTUNITY", null, "5", "consultant 10");
    }

    @Test
    void anAnswerLengthOutsideOneToAThousandIs400() {
        for (String bad : new String[] { null, "", "   ", "a".repeat(1001) }) {
            assertThatThrownBy(() -> service.answerInfo(me, 5L, bad)).isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(400);
                assertThat(e.getCode()).isEqualTo("VALIDATION");
            });
        }
        assertThat(service.answerInfo(me, 5L, "a".repeat(1000)).changed()).isTrue();
    }

    @Test
    void sensitiveTextIs422AndNothingIsWritten() {
        assertThatThrownBy(() -> service.answerInfo(me, 5L, "Her SSN is 123-45-6789")).isInstanceOfSatisfying(SensitiveContentException.class, e -> assertThat(e.getStatus()).isEqualTo(422));
        assertThat(opp.getInfoAnswer()).isNull();
        assertThat(saved).isEmpty();
        verify(repo, never()).save(any(MktOpportunity.class));
    }

    @Test
    void withoutAnOpenQuestionItIs409() {
        for (String state : new String[] { "ASSIGNED", "VIEWED", "INTERESTED", "DECLINED", "APPLIED", "CLOSED" }) {
            opp.setState(state);
            assertThatThrownBy(() -> service.answerInfo(me, 5L, "answer")).isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(409);
                assertThat(e.getCode()).isEqualTo("NO_OPEN_INFO_REQUEST");
            });
        }
        opp.setState("NEEDS_INFO");
        opp.setInfoRequest(null);
        assertThatThrownBy(() -> service.answerInfo(me, 5L, "answer")).isInstanceOf(OrgException.class).extracting(e -> ((OrgException) e).getCode()).isEqualTo("NO_OPEN_INFO_REQUEST");
        assertThat(saved).isEmpty();
    }

    @Test
    void anOpportunityWithNoOverlayIs409() {
        row = new MktOpportunityRow(5L, 10L, "Alex Kim", 500L, "J", "L", "HYBRID", "OPEN", 3L, "Acme", 80, "fits", "SUGGESTED", null, NOW, null, null, null, null, null, null, null, null);
        assertThatThrownBy(() -> service.answerInfo(me, 5L, "answer")).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("NO_OPEN_INFO_REQUEST"));
    }

    @Test
    void aConsultantOutsideTheCallersScopeAndAnUnknownIdAreTheGeneric404() {
        view = new MktScope.View(ORG, ME, false, Set.of(11L));
        assertThatThrownBy(() -> service.answerInfo(me, 5L, "answer")).isInstanceOf(OrgNotFoundException.class);
        view = new MktScope.View(ORG, ME, true, Set.of());
        assertThatThrownBy(() -> service.answerInfo(me, 999L, "answer")).isInstanceOf(OrgNotFoundException.class);
        assertThat(opp.getInfoAnswer()).isNull();
        assertThat(saved).isEmpty();
    }

    @Test
    void theGateIsTheOpportunitiesManagePermission() {
        when(scope.resolve(any(), eq("opportunities.manage"))).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.answerInfo(me, 5L, "answer")).isInstanceOf(OrgNotFoundException.class);
        assertThat(MktOpportunitiesService.PERMISSION).isEqualTo("opportunities.manage");
    }

    @Test
    void anUnusedLockIsNotTakenWhenTheRowIsGone() {
        row = null;
        assertThatThrownBy(() -> service.answerInfo(me, 5L, "answer")).isInstanceOf(OrgNotFoundException.class);
        verify(repo, never()).lockByOrgIdAndId(eq(ORG), anyLong());
    }
}
