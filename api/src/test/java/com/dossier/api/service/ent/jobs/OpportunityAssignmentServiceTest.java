package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService.Audit;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService.Options;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService.Result;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.lang.reflect.Method;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

/** Every gate and every pair rule of the one place that assigns a job to a consultant (doc 60 section 2), without a database. */
class OpportunityAssignmentServiceTest {

    static final Long ORG = 7L;
    static final Long ME = 70L;
    static final Long JOB = 100L;
    static final Long CON = 10L;
    static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");

    AssignmentWorld world;
    OpportunityAssignmentService service;
    MktScope.View all = new MktScope.View(ORG, ME, true, Set.of());
    OrgMembership me = new OrgMembership(ORG, ME, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void wire() {
        world = new AssignmentWorld(ORG, Clock.fixed(NOW, ZoneOffset.UTC));
        service = world.service();
        world.job(JOB, "OPEN", "MANUAL");
        world.consultant(CON, "ACTIVE", "ACTIVE");
        world.approve(CON);
    }

    Result assign(Options o) {
        return service.assign(all, me, JOB, CON, o);
    }

    // ---- the gates ----------------------------------------------------------------------------------------------------------

    @Test
    void aJobThatIsNotOpenIsA409AndNothingIsWritten() {
        for (String status : new String[] { "CLOSED", "FILLED", "ON_HOLD" }) {
            world.jobs.get(JOB).setStatus(status);
            assertThatThrownBy(() -> assign(null)).isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(409);
                assertThat(e.getCode()).isEqualTo("JOB_NOT_OPEN");
            });
        }
        assertThat(world.matchStore).isEmpty();
        assertThat(world.oppStore).isEmpty();
        verify(world.audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void anOpenOrInReviewJobIsAssignable() {
        assertThat(assign(null).created()).isTrue();
        world.matchStore.clear();
        world.oppStore.clear();
        world.jobs.get(JOB).setStatus("IN_REVIEW");
        assertThat(assign(null).created()).isTrue();
    }

    @Test
    void aMissingJobOrConsultantIsTheGenericNotFound() {
        assertThatThrownBy(() -> service.assign(all, me, 999L, CON, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.assign(all, me, JOB, 999L, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.assign(all, me, (Long) null, CON, null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("VALIDATION"));
        assertThatThrownBy(() -> service.assign(all, me, JOB, null, null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("VALIDATION"));
    }

    @Test
    void aConsultantOutsideTheScopeIsTheGenericNotFoundAndNothingIsRead() {
        MktScope.View narrow = new MktScope.View(ORG, ME, false, Set.of(11L));
        assertThatThrownBy(() -> service.assign(narrow, me, JOB, CON, null)).isInstanceOf(OrgNotFoundException.class);
        assertThat(world.matchStore).isEmpty();
        // the scope is the caller's, the membership must be of the same organization
        MktScope.View other = new MktScope.View(8L, ME, true, Set.of());
        assertThatThrownBy(() -> service.assign(other, me, JOB, CON, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.assign(null, me, JOB, CON, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.assign(all, null, JOB, CON, null)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void anInactiveConsultantIsRefusedSoftlyAndNothingIsWritten() {
        world.people.get(CON).setStatus("INACTIVE");
        Result r = assign(null);
        assertThat(r.refused()).isTrue();
        assertThat(r.reason()).isEqualTo("CONSULTANT_INACTIVE");
        assertThat(r.matchId()).isNull();

        world.people.get(CON).setStatus("ACTIVE");
        world.people.get(CON).setMarketingStatus("PAUSED");
        assertThat(assign(null).reason()).as("a paused marketing status is its own, clearer reason").isEqualTo("CONSULTANT_PAUSED");

        world.people.get(CON).setMarketingStatus("ACTIVE");
        assertThat(assign(null).refused()).isFalse();
        verify(world.audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void theResumeGateAppliesUnlessTheExtensionCapturedTheJob() {
        world.approved.clear();
        assertThatThrownBy(() -> assign(null)).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("RESUME_NOT_APPROVED");
        });
        assertThat(world.matchStore).isEmpty();

        world.jobs.get(JOB).setCaptureSource("CLIENT");
        assertThatThrownBy(() -> assign(null)).as("only EXTENSION waives it").isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("RESUME_NOT_APPROVED"));

        world.jobs.get(JOB).setCaptureSource("EXTENSION");
        Result r = assign(null);
        assertThat(r.created()).isTrue();
        assertThat(world.matchStore.get(r.matchId()).getStatus()).isEqualTo("ASSIGNED");
    }

    // ---- the pair rules -----------------------------------------------------------------------------------------------------

    @Test
    void aNewPairGetsAnAssignedMatchAndAnAssignedOpportunity() {
        Result r = assign(Options.none().withNewMatch(() -> 77, "Because", "AI").withOpportunity("Look at this one", "HIGH", java.time.LocalDate.of(2026, 10, 20)));
        assertThat(r.created()).isTrue();
        assertThat(r.existing()).isFalse();
        assertThat(r.reopened()).isFalse();
        assertThat(r.refused()).isFalse();
        RequirementMatch m = world.matchStore.get(r.matchId());
        assertThat(m.getStatus()).isEqualTo("ASSIGNED");
        assertThat(m.getScore()).isEqualTo(77);
        assertThat(m.getReason()).isEqualTo("Because");
        assertThat(m.getSource()).isEqualTo("AI");
        assertThat(m.getAssignedByMemberId()).isEqualTo(ME);
        assertThat(m.getAssignedAt()).isEqualTo(NOW);
        MktOpportunity o = world.oppStore.get(r.opportunityId());
        assertThat(o.getMatchId()).isEqualTo(r.matchId());
        assertThat(o.getState()).isEqualTo("ASSIGNED");
        assertThat(o.getOwnerMemberId()).isEqualTo(ME);
        assertThat(o.getMarketerNote()).isEqualTo("Look at this one");
        assertThat(o.getPriority()).isEqualTo("HIGH");
        assertThat(o.getDueOn()).isEqualTo(java.time.LocalDate.of(2026, 10, 20));
        assertThat(world.eventKinds()).containsExactly("ASSIGNED");
        assertThat(world.eventLog.get(0).getActorMemberId()).isEqualTo(ME);
    }

    @Test
    void askingForInterestStampsTheRequestAndAFollowUp() {
        Result r = assign(Options.none().askingInterest().withOwner(55L));
        MktOpportunity o = world.oppStore.get(r.opportunityId());
        assertThat(o.getOwnerMemberId()).isEqualTo(55L);
        assertThat(o.getInterestRequestedAt()).isEqualTo(NOW);
        assertThat(o.getNextActionAt()).isEqualTo(NOW.plus(java.time.Duration.ofDays(3)));
        assertThat(o.getInterest()).as("a marketer never answers for the consultant").isEqualTo("NO_RESPONSE");
        assertThat(world.eventKinds()).containsExactly("ASSIGNED", "INTEREST_REQUESTED");
    }

    @Test
    void auditIsWrittenOnlyWhenSomethingChangedWithTheCallersSpec() {
        Audit spec = new Audit("MKT_X_ASSIGN", "REQUIREMENT", "100", r -> "created=" + r.created());
        Result first = assign(Options.none().withAudit(spec));
        verify(world.audit).record(me, "MKT_X_ASSIGN", "REQUIREMENT", null, "100", "created=true");
        assertThat(first.created()).isTrue();

        assign(Options.none().withAudit(spec)); // existing: no second row
        verify(world.audit).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());

        Audit defaults = new Audit("MKT_Y", "MATCH", null, null);
        world.matchStore.clear();
        world.oppStore.clear();
        Result again = assign(Options.none().withAudit(defaults));
        verify(world.audit).record(me, "MKT_Y", "MATCH", null, String.valueOf(again.matchId()), "consultant " + CON + ", job " + JOB);
    }

    @Test
    void aSuggestedMatchIsAssignedInPlaceAndTheOverlayKeepsItsRow() {
        RequirementMatch m = world.match(1L, JOB, CON, "SUGGESTED");
        MktOpportunity o = world.opportunity(1L, "ASSIGNED");
        Result r = assign(Options.none());
        assertThat(r.created()).isFalse();
        assertThat(r.existing()).isFalse();
        assertThat(r.matchId()).isEqualTo(1L);
        assertThat(r.opportunityId()).isEqualTo(o.getId());
        assertThat(m.getStatus()).isEqualTo("ASSIGNED");
        assertThat(m.getAssignedByMemberId()).isEqualTo(ME);
        assertThat(world.matchStore).hasSize(1);
        assertThat(world.oppStore).hasSize(1);
        assertThat(world.eventKinds()).containsExactly("ASSIGNED");
        verify(world.tx, never()).insertMatch(any());
        verify(world.tx, never()).insertMatch(any(), any());
        verify(world.tx, never()).insertOpportunity(any());
        verify(world.tx, never()).insertOpportunity(any(), any());
    }

    @Test
    void anAlreadyAssignedPairIsExistingNotAnErrorAndChangesNothing() {
        RequirementMatch m = world.match(1L, JOB, CON, "ASSIGNED");
        m.setAssignedAt(Instant.parse("2026-09-01T00:00:00Z"));
        m.setAssignedByMemberId(99L);
        MktOpportunity o = world.opportunity(1L, "INTERESTED");
        Result r = assign(Options.none().askingInterest().withAudit(new Audit("A", "B", null, null)));
        assertThat(r.existing()).isTrue();
        assertThat(r.created()).isFalse();
        assertThat(r.reopened()).isFalse();
        assertThat(r.matchId()).isEqualTo(1L);
        assertThat(r.opportunityId()).isEqualTo(o.getId());
        assertThat(m.getAssignedByMemberId()).as("the first assignment stays the record").isEqualTo(99L);
        assertThat(m.getAssignedAt()).isEqualTo(Instant.parse("2026-09-01T00:00:00Z"));
        assertThat(o.getState()).isEqualTo("INTERESTED");
        assertThat(o.getInterestRequestedAt()).isNull();
        assertThat(world.eventLog).isEmpty();
        verify(world.audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void anAppliedOpportunityIsNeverReopened() {
        world.match(1L, JOB, CON, "ASSIGNED");
        MktOpportunity o = world.opportunity(1L, "APPLIED");
        assertThat(assign(Options.none()).existing()).isTrue();
        assertThat(o.getState()).isEqualTo("APPLIED");
    }

    @Test
    void anAssignedPairWhoseOverlayIsMissingGetsTheOverlayQuietly() {
        world.match(1L, JOB, CON, "ASSIGNED");
        Result r = assign(Options.none());
        assertThat(r.existing()).isTrue();
        assertThat(r.opportunityId()).isNotNull();
        assertThat(world.oppStore.get(r.opportunityId()).getState()).isEqualTo("ASSIGNED");
        assertThat(world.eventLog).isEmpty();
    }

    @Test
    void aDeclinedOrClosedOpportunityIsReopenedOnTheSameRowsWithAReassignedEvent() {
        for (String state : new String[] { "DECLINED", "CLOSED" }) {
            world.matchStore.clear();
            world.oppStore.clear();
            world.eventLog.clear();
            RequirementMatch m = world.match(1L, JOB, CON, "ASSIGNED");
            MktOpportunity o = world.opportunity(1L, state);
            o.setInterest("NOT_INTERESTED");
            o.setDeclineReason("RATE");
            o.setClosedReason("WITHDRAWN");
            o.setClosedAt(NOW.minusSeconds(3600));
            o.setInfoRequest("what is the rate?");
            o.setInfoAnswer("90/h");
            o.setOwnerMemberId(42L);
            Result r = assign(Options.none().withOpportunity("Try again", null, null));
            assertThat(r.existing()).as(state).isFalse();
            assertThat(r.reopened()).as(state).isTrue();
            assertThat(r.created()).isFalse();
            assertThat(r.matchId()).isEqualTo(m.getId());
            assertThat(r.opportunityId()).isEqualTo(o.getId());
            assertThat(o.getState()).isEqualTo("ASSIGNED");
            assertThat(o.getDeclineReason()).isNull();
            assertThat(o.getClosedReason()).isNull();
            assertThat(o.getClosedAt()).isNull();
            assertThat(o.getInfoRequest()).isNull();
            assertThat(o.getInfoAnswer()).isNull();
            assertThat(o.getInterest()).as("the legacy column follows the state").isEqualTo("NO_RESPONSE");
            assertThat(o.getOwnerMemberId()).as("the owner is kept").isEqualTo(42L);
            assertThat(o.getMarketerNote()).isEqualTo("Try again");
            assertThat(world.eventKinds()).as(state).containsExactly("REASSIGNED");
            assertThat(world.matchStore).hasSize(1);
            assertThat(world.oppStore).hasSize(1);
        }
    }

    @Test
    void aDismissedMatchIsReopenedToAssignedWithAReassignedEvent() {
        RequirementMatch m = world.match(1L, JOB, CON, "DISMISSED");
        world.opportunity(1L, "ASSIGNED");
        Result r = assign(Options.none());
        assertThat(r.reopened()).isTrue();
        assertThat(r.existing()).isFalse();
        assertThat(m.getStatus()).isEqualTo("ASSIGNED");
        assertThat(m.getAssignedByMemberId()).isEqualTo(ME);
        assertThat(world.eventKinds()).containsExactly("REASSIGNED");
    }

    @Test
    void aSuggestedPairWhoseOverlayWasDeclinedIsAssignedAndReopened() {
        world.match(1L, JOB, CON, "SUGGESTED");
        MktOpportunity o = world.opportunity(1L, "DECLINED");
        Result r = assign(Options.none());
        assertThat(r.reopened()).isTrue();
        assertThat(o.getState()).isEqualTo("ASSIGNED");
        assertThat(world.eventKinds()).containsExactly("REASSIGNED");
    }

    // ---- concurrency ----------------------------------------------------------------------------------------------------------

    @Test
    void whenTwoRequestsRaceOnTheMatchTheLoserFindsTheWinnersRowAndAnswersExisting() {
        world.raceOnMatch("ASSIGNED");
        Result r = assign(Options.none());
        assertThat(r.created()).as("the other request created it").isFalse();
        assertThat(r.existing()).isTrue();
        assertThat(world.matchStore).hasSize(1);
        assertThat(world.matchStore.get(r.matchId()).getAssignedByMemberId()).as("the winner's row, untouched").isNull();
        assertThat(world.eventLog).isEmpty();
        assertThat(world.oppStore).hasSize(1);
    }

    @Test
    void whenTheWinnerOnlySuggestedItTheLoserAssignsThatRow() {
        world.raceOnMatch("SUGGESTED");
        Result r = assign(Options.none());
        assertThat(r.created()).isFalse();
        assertThat(r.existing()).isFalse();
        assertThat(world.matchStore).hasSize(1);
        assertThat(world.matchStore.get(r.matchId()).getStatus()).isEqualTo("ASSIGNED");
        assertThat(world.eventKinds()).containsExactly("ASSIGNED");
    }

    @Test
    void whenTwoRequestsRaceOnTheOverlayTheLoserUsesTheWinnersRow() {
        world.match(1L, JOB, CON, "ASSIGNED");
        world.raceOnOpportunity("ASSIGNED");
        Result r = assign(Options.none());
        assertThat(r.existing()).isTrue();
        assertThat(world.oppStore).hasSize(1);
        assertThat(r.opportunityId()).isEqualTo(world.oppStore.keySet().iterator().next());
    }

    @Test
    void aConflictThatLeavesNoWinnerIsNotSwallowed() {
        org.mockito.Mockito.doThrow(new org.springframework.dao.DataIntegrityViolationException("something else")).when(world.tx).insertMatch(any(), any());
        assertThatThrownBy(() -> assign(null)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void theGateRefusalsDoNotMarkTheCallersTransactionRollbackOnly() throws Exception {
        // the batch assign catches OrgException and carries on: Spring must not poison the shared transaction when the exception leaves the proxy
        Method assign = OpportunityAssignmentService.class.getMethod("assign", AssignmentScope.class, OrgMembership.class, Long.class, Long.class, Options.class);
        assertThat(assign.getAnnotation(Transactional.class).noRollbackFor()).contains(OrgException.class);
        Method suggest = OpportunityAssignmentService.class.getMethod("suggest", AssignmentScope.class, OrgMembership.class, Long.class, Long.class, Options.class);
        assertThat(suggest.getAnnotation(Transactional.class).noRollbackFor()).contains(OrgException.class);
    }

    // ---- suggest (the Opportunities board's "Add opportunity") -------------------------------------------------------------------

    @Test
    void suggestCreatesASuggestedMatchAndItsOverlayWithoutAskingAnyone() {
        Result r = service.suggest(all, me, JOB, CON, Options.none().withNewMatch(() -> 61, "Added by a marketer", "MANUAL").withAudit(new Audit("MARKETER_OPPORTUNITY_CREATE", "OPPORTUNITY", null, null)));
        assertThat(r.created()).isTrue();
        assertThat(r.existing()).isFalse();
        RequirementMatch m = world.matchStore.get(r.matchId());
        assertThat(m.getStatus()).isEqualTo("SUGGESTED");
        assertThat(m.getScore()).isEqualTo(61);
        assertThat(m.getAssignedAt()).isNull();
        assertThat(world.oppStore.get(r.opportunityId()).getMatchId()).isEqualTo(r.matchId());
        assertThat(world.eventKinds()).containsExactly("CREATED");
        verify(world.audit).record(eq(me), eq("MARKETER_OPPORTUNITY_CREATE"), eq("OPPORTUNITY"), isNull(), eq(String.valueOf(r.matchId())), anyString());
    }

    @Test
    void suggestOnALivePairIsExistingAndOnADismissedOneBringsItBack() {
        RequirementMatch m = world.match(1L, JOB, CON, "ASSIGNED");
        Result existing = service.suggest(all, me, JOB, CON, null);
        assertThat(existing.existing()).isTrue();
        assertThat(existing.matchId()).isEqualTo(1L);
        assertThat(m.getStatus()).isEqualTo("ASSIGNED");

        m.setStatus("DISMISSED");
        m.setAssignedAt(NOW);
        m.setAssignedByMemberId(5L);
        Result back = service.suggest(all, me, JOB, CON, null);
        assertThat(back.existing()).isFalse();
        assertThat(back.created()).isFalse();
        assertThat(m.getStatus()).isEqualTo("SUGGESTED");
        assertThat(m.getAssignedAt()).isNull();
        assertThat(m.getAssignedByMemberId()).isNull();
        assertThat(world.eventKinds()).containsExactly("CREATED");
    }

    @Test
    void suggestKeepsTheScopeAndJobGates() {
        MktScope.View narrow = new MktScope.View(ORG, ME, false, Set.of());
        assertThatThrownBy(() -> service.suggest(narrow, me, JOB, CON, null)).isInstanceOf(OrgNotFoundException.class);
        world.jobs.get(JOB).setStatus("CLOSED");
        assertThatThrownBy(() -> service.suggest(all, me, JOB, CON, null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("JOB_NOT_OPEN"));
        assertThat(world.matchStore).isEmpty();
    }

    @Test
    void suggestWhenTheOtherRequestWonJustAnswersExisting() {
        world.raceOnMatch("SUGGESTED");
        Result r = service.suggest(all, me, JOB, CON, null);
        assertThat(r.existing()).isTrue();
        assertThat(world.matchStore).hasSize(1);
        assertThat(world.eventLog).isEmpty();
    }

    // ---- ensureOpportunity ------------------------------------------------------------------------------------------------------

    @Test
    void ensureOpportunityCreatesTheOverlayOnceAndHonoursTheScope() {
        world.match(1L, JOB, CON, "SUGGESTED");
        MktOpportunity first = service.ensureOpportunity(all, 1L, ME);
        assertThat(first.getOwnerMemberId()).isEqualTo(ME);
        assertThat(first.getState()).isEqualTo("ASSIGNED");
        MktOpportunity second = service.ensureOpportunity(all, 1L, 5L);
        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(world.oppStore).hasSize(1);

        MktScope.View narrow = new MktScope.View(ORG, ME, false, Set.of(11L));
        assertThatThrownBy(() -> service.ensureOpportunity(narrow, 1L, ME)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.ensureOpportunity(all, 404L, ME)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void ensureOpportunityRacesGracefully() {
        world.match(1L, JOB, CON, "ASSIGNED");
        world.raceOnOpportunity("INTERESTED");
        MktOpportunity o = service.ensureOpportunity(all, 1L, ME);
        assertThat(o.getState()).isEqualTo("INTERESTED");
        assertThat(world.oppStore).hasSize(1);
    }

    // ---- closing ------------------------------------------------------------------------------------------------------------

    @Test
    void closingAJobClosesOnlyTheOpportunitiesStillOpenForTheConsultantWithAnEventAndAnAuditRowEach() {
        world.consultant(11, "ACTIVE", "ACTIVE");
        world.consultant(12, "ACTIVE", "ACTIVE");
        world.consultant(13, "ACTIVE", "ACTIVE");
        world.job(101, "OPEN", "MANUAL");
        world.match(1, JOB, CON, "ASSIGNED");
        world.match(2, JOB, 11, "ASSIGNED");
        world.match(3, JOB, 12, "ASSIGNED");
        world.match(4, JOB, 13, "ASSIGNED");
        world.match(5, 101, CON, "ASSIGNED");
        var assigned = world.opportunity(1, "ASSIGNED");
        var interested = world.opportunity(2, "INTERESTED");
        var declined = world.opportunity(3, "DECLINED");
        var applied = world.opportunity(4, "APPLIED");
        var otherJob = world.opportunity(5, "ASSIGNED");

        world.jobs.get(JOB).setStatus("CLOSED");
        int closed = service.closeForJob(all, me, JOB);

        assertThat(closed).isEqualTo(2);
        for (var o : new MktOpportunity[] { assigned, interested }) {
            assertThat(o.getState()).isEqualTo("CLOSED");
            assertThat(o.getClosedReason()).isEqualTo("JOB_CLOSED");
            assertThat(o.getClosedAt()).isEqualTo(NOW);
        }
        assertThat(declined.getState()).as("the consultant's no stays theirs").isEqualTo("DECLINED");
        assertThat(applied.getState()).as("an application is a fact").isEqualTo("APPLIED");
        assertThat(otherJob.getState()).isEqualTo("ASSIGNED");
        assertThat(world.eventKinds()).containsExactly("CLOSED", "CLOSED");
        verify(world.audit, org.mockito.Mockito.times(2)).record(eq(me), eq("OPPORTUNITY_CLOSED"), eq("OPPORTUNITY"), isNull(), anyString(), eq("JOB_CLOSED"));
        assertThat(service.closeForJob(all, me, JOB)).as("a second call has nothing left to close").isZero();
    }

    @Test
    void aClosedOpportunityIsReopenedByANewAssignmentOfThePair() {
        world.match(1, JOB, CON, "ASSIGNED");
        var opp = world.opportunity(1, "ASSIGNED");
        service.closeForJob(all, me, JOB);
        assertThat(opp.getState()).isEqualTo("CLOSED");
        Result r = assign(null);
        assertThat(r.reopened()).isTrue();
        assertThat(opp.getState()).isEqualTo("ASSIGNED");
        assertThat(opp.getClosedReason()).isNull();
    }

    @Test
    void withdrawingTakesTheAssignmentBackWithinTheCallersScopeOnly() {
        world.match(1, JOB, CON, "ASSIGNED");
        var opp = world.opportunity(1, "VIEWED");
        MktScope.View narrow = new MktScope.View(ORG, ME, false, Set.of(11L));
        assertThatThrownBy(() -> service.withdraw(narrow, me, opp.getId())).isInstanceOf(OrgNotFoundException.class);
        assertThat(opp.getState()).isEqualTo("VIEWED");
        assertThatThrownBy(() -> service.withdraw(all, me, 999L)).isInstanceOf(OrgNotFoundException.class);

        service.withdraw(all, me, opp.getId());
        assertThat(opp.getState()).isEqualTo("CLOSED");
        assertThat(opp.getClosedReason()).isEqualTo("WITHDRAWN");
        assertThat(world.eventKinds()).containsExactly("CLOSED");
        verify(world.audit).record(eq(me), eq("MARKETER_OPPORTUNITY_WITHDRAW"), eq("OPPORTUNITY"), isNull(), eq(String.valueOf(opp.getId())), eq("WITHDRAWN"));
        // nothing left to withdraw
        assertThatThrownBy(() -> service.withdraw(all, me, opp.getId())).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(409));
        opp.setState("DECLINED");
        assertThatThrownBy(() -> service.withdraw(all, me, opp.getId())).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("ILLEGAL_TRANSITION"));
    }

    // ---- a job created in the caller's own request ----------------------------------------------------------------------------

    @Test
    void aJobPassedAsAnEntityIsNeverReReadThroughAPlainRead() {
        // the job was inserted by a REQUIRES_NEW transaction after the caller's snapshot: a plain findByOrgIdAndId would not see it
        world.invisibleToSnapshot.add(JOB);
        Result r = service.assign(all, me, world.jobs.get(JOB), CON, null);
        assertThat(r.created()).isTrue();
        verify(world.requirements, never()).findByOrgIdAndId(any(), any());
        verify(world.tx, never()).readRequirement(any(), any());
    }

    @Test
    void anIdLookupFallsBackToAFreshSnapshotWhenThePlainReadMisses() {
        world.invisibleToSnapshot.add(JOB);
        Result r = service.assign(all, me, JOB, CON, null);
        assertThat(r.created()).isTrue();
        verify(world.tx).readRequirement(ORG, JOB);
        // and a job that is really missing is still the generic 404
        assertThatThrownBy(() -> service.assign(all, me, 999L, CON, null)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aJobEntityOfAnotherOrganizationOrNullIsRefused() {
        var foreign = world.jobs.get(JOB);
        foreign.setOrgId(ORG + 1);
        assertThatThrownBy(() -> service.assign(all, me, foreign, CON, null)).isInstanceOf(OrgNotFoundException.class);
        foreign.setOrgId(ORG);
        assertThatThrownBy(() -> service.assign(all, me, (com.dossier.api.domain.ent.talent.ClientRequirement) null, CON, null))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("VALIDATION"));
    }

    // ---- the duplicate and cap guards (Sprint 2 / B1) ------------------------------------------------------------------------------

    private com.dossier.api.service.ent.pipeline.DuplicateGuard guarded() {
        com.dossier.api.service.ent.pipeline.DuplicateGuard guard = org.mockito.Mockito.mock(com.dossier.api.service.ent.pipeline.DuplicateGuard.class);
        service.setGuard(guard);
        return guard;
    }

    @Test
    void aNewAssignmentAsksTheGuardsBeforeAnythingIsWritten() {
        var guard = guarded();
        org.mockito.Mockito.doThrow(OrgException.coded(409, "DUPLICATE_WARNING", "Same role through another vendor.", java.util.Map.of()))
            .when(guard).enforce(any(OrgMembership.class), eq(CON), any(), any());
        assertThatThrownBy(() -> assign(null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("DUPLICATE_WARNING"));
        verify(guard).assertOpenCap(ORG, CON);
        assertThat(world.matchStore).isEmpty();
        assertThat(world.oppStore).isEmpty();
        verify(world.audit, never()).record(any(OrgMembership.class), anyString(), anyString(), any(), any(), any());
    }

    @Test
    void theCapIsAskedFirstAndStopsTheAssignment() {
        var guard = guarded();
        org.mockito.Mockito.doThrow(OrgException.coded(409, "ASSIGNMENT_CAP", "Too many open.", java.util.Map.of())).when(guard).assertOpenCap(ORG, CON);
        assertThatThrownBy(() -> assign(null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("ASSIGNMENT_CAP"));
        verify(guard, never()).enforce(any(OrgMembership.class), any(), any(), any());
        assertThat(world.matchStore).isEmpty();
    }

    @Test
    void theAnswerToAWarningReachesTheGuardAndTheAssignmentGoesAhead() {
        var guard = guarded();
        var confirm = new com.dossier.api.service.ent.pipeline.DuplicateGuard.Confirm(true, "The client asked for both");
        assertThat(assign(Options.none().confirmingDuplicate(confirm)).created()).isTrue();
        verify(guard).enforce(eq(me), eq(CON), any(), eq(confirm));
        assertThat(world.matchStore).hasSize(1);
    }

    @Test
    void aPairThatIsAlreadyLiveIsNeverAskedAgain() {
        var guard = guarded();
        assertThat(assign(null).created()).isTrue();
        assertThat(assign(null).existing()).isTrue();
        verify(guard, org.mockito.Mockito.times(1)).enforce(any(OrgMembership.class), any(), any(), any());
        verify(guard, org.mockito.Mockito.times(1)).assertOpenCap(any(), any());
    }

    @Test
    void reopeningADeclinedPairIsAnAssignmentAgainSoTheGuardsAskAgain() {
        var guard = guarded();
        assign(null);
        world.oppStore.values().iterator().next().setState("DECLINED");
        assertThat(assign(null).reopened()).isTrue();
        verify(guard, org.mockito.Mockito.times(2)).enforce(any(OrgMembership.class), any(), any(), any());
    }

    @Test
    void withoutGuardsWiredNothingIsAsked() {
        assertThat(assign(null).created()).isTrue(); // the unit-test construction: no guard bean, no question
    }

    // ---- the manager holds (MM-02): every default changes nothing ---------------------------------------------------------------------

    private com.dossier.api.service.ent.mkt.approvals.ApprovalHolds held() {
        var holds = org.mockito.Mockito.mock(com.dossier.api.service.ent.mkt.approvals.ApprovalHolds.class);
        service.setHolds(holds);
        return holds;
    }

    @Test
    void withTheSettingsAtTheirDefaultsAHoldWiredInChangesNothing() {
        var guard = guarded();
        var holds = held(); // holdsAssignment answers false: org.pipeline.manager_approval is NEVER
        assertThat(assign(null).created()).isTrue();
        assertThat(world.matchStore.values()).extracting(RequirementMatch::getStatus).containsExactly("ASSIGNED");
        verify(holds, never()).holdAssignment(any(), any(), any(), any(), any());
    }

    @Test
    void aManagerApprovalSettingParksTheAssignmentAfterTheGuardsAndWritesNothingInThisTransaction() {
        var guard = guarded();
        var holds = held();
        org.mockito.Mockito.when(holds.holdsAssignment(ORG, CON)).thenReturn(true);
        OrgException parked = OrgException.coded(409, "APPROVAL_PENDING", "Sent to a manager.", java.util.Map.of("requestId", 5L));
        org.mockito.Mockito.when(holds.holdAssignment(eq(me), any(), eq(CON), any(), any())).thenReturn(parked);
        assertThatThrownBy(() -> assign(Options.none().withOwner(ME).askingInterest().withOpportunity("Lead with Java", "HIGH", null))).isSameAs(parked);
        verify(guard).assertOpenCap(ORG, CON);
        verify(guard).enforce(eq(me), eq(CON), any(), any(), any()); // the duplicate guard ran first, with somewhere to send a confirmed override
        assertThat(world.matchStore).isEmpty(); // the parked pair is written by the hold in a transaction of its own
        assertThat(world.oppStore).isEmpty();
        var spec = org.mockito.ArgumentCaptor.forClass(com.dossier.api.service.ent.mkt.approvals.ApprovalHolds.Spec.class);
        verify(holds).holdAssignment(eq(me), any(), eq(CON), spec.capture(), any());
        assertThat(spec.getValue().ownerMemberId()).isEqualTo(ME);
        assertThat(spec.getValue().askInterest()).isTrue();
        assertThat(spec.getValue().marketerNote()).isEqualTo("Lead with Java");
        assertThat(spec.getValue().priority()).isEqualTo("HIGH");
    }

    @Test
    void aConfirmedDuplicateUnderRequireApprovalIsSentToAManager() {
        var guard = guarded();
        var holds = held();
        OrgException parked = OrgException.coded(409, "DUPLICATE_APPROVAL_REQUIRED", "Sent to a manager.", java.util.Map.of("requestId", 6L));
        org.mockito.Mockito.when(holds.holdDuplicate(eq(me), any(), eq(CON), any(), any(), eq("The client asked for both"))).thenReturn(parked);
        org.mockito.Mockito.doAnswer(call -> {
            com.dossier.api.service.ent.pipeline.DuplicateGuard.Hold hold = call.getArgument(4);
            throw hold.hold(java.util.List.of(), "The client asked for both"); // what the real guard does under REQUIRE_APPROVAL
        }).when(guard).enforce(any(OrgMembership.class), eq(CON), any(), any(), any());
        assertThatThrownBy(() -> assign(Options.none().confirmingDuplicate(new com.dossier.api.service.ent.pipeline.DuplicateGuard.Confirm(true, "The client asked for both")))).isSameAs(parked);
        assertThat(world.matchStore).isEmpty();
        verify(holds, never()).holdAssignment(any(), any(), any(), any(), any()); // the duplicate request comes first; the approval of it lifts both holds
    }

    @Test
    void aManagersApprovalLiftsTheHoldAndTheAssignmentGoesThroughTheSameChecks() {
        var guard = guarded();
        var holds = held();
        org.mockito.Mockito.when(holds.holdsAssignment(ORG, CON)).thenReturn(true);
        var approved = com.dossier.api.service.ent.pipeline.DuplicateGuard.Confirm.approved("The client asked for both", 90L, ME);
        assertThat(assign(Options.none().confirmingDuplicate(approved)).created()).isTrue();
        verify(guard).assertOpenCap(ORG, CON); // the cap and the duplicate guard are kept
        verify(guard).enforce(eq(me), eq(CON), any(), eq(approved), any());
        verify(holds, never()).holdsAssignment(any(), any());
        verify(holds, never()).holdAssignment(any(), any(), any(), any(), any());
        assertThat(world.matchStore.values()).extracting(RequirementMatch::getStatus).containsExactly("ASSIGNED");
    }

    @Test
    void aPairThatIsAlreadyLiveIsNeverHeld() {
        var guard = guarded();
        var holds = held();
        assign(null);
        org.mockito.Mockito.when(holds.holdsAssignment(ORG, CON)).thenReturn(true);
        assertThat(assign(null).existing()).isTrue();
        verify(holds, never()).holdAssignment(any(), any(), any(), any(), any());
    }
}
