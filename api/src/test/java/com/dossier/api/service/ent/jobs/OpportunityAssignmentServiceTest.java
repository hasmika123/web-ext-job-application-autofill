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
        assertThat(assign(null).reason()).as("marketing_status counts too").isEqualTo("CONSULTANT_INACTIVE");

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
}
