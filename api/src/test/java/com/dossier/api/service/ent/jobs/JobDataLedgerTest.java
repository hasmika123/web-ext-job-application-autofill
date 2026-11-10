package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.JobDataEvent;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.JobDataEventRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/** The ledger writer, the find-or-create that writes CAPTURED with the job, and the ASSIGNED row of the one assignment service. */
class JobDataLedgerTest {

    static final Long ORG = 7L;
    static final Long ME = 70L;
    static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");
    static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

    JobDataEventRepository repo = mock(JobDataEventRepository.class);
    JobDataLedger ledger = new JobDataLedger(repo, CLOCK);
    OrgMembership me = new OrgMembership(ORG, ME, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    MktScope.View all = new MktScope.View(ORG, ME, true, Set.of());

    // ---- the rows ----------------------------------------------------------------------------------------------------------------

    @Test
    void assignedEditedAndCapChangedAreSavedWithTheirFields() {
        when(repo.save(any(JobDataEvent.class))).thenAnswer(i -> i.getArgument(0));

        JobDataEvent a = ledger.assigned(ORG, 55L, ME, 10L, false);
        assertThat(a.getEventType()).isEqualTo("ASSIGNED");
        assertThat(a.getNote()).isEqualTo("assigned to consultant 10");
        assertThat(a.getActorKind()).isEqualTo("MEMBER");
        assertThat(a.getOccurredAt()).isEqualTo(NOW);
        assertThat(ledger.assigned(ORG, 55L, ME, 10L, true).getNote()).isEqualTo("reassigned to consultant 10");

        JobDataEvent e = ledger.edited(ORG, 55L, ME, List.of("title", "location"));
        assertThat(e.getEventType()).isEqualTo("EDITED");
        assertThat(e.getFields()).isEqualTo("title,location");

        JobDataEvent c = ledger.capChanged(ORG, 55L, ME, "MINIMAL", "FULL");
        assertThat(c.getEventType()).isEqualTo("CAP_CHANGED");
        assertThat(c.getDetailLevelBefore()).isEqualTo("MINIMAL");
        assertThat(c.getDetailLevelAfter()).isEqualTo("FULL");
        assertThat(c.getOrgId()).isEqualTo(ORG);
        assertThat(c.getRequirementId()).isEqualTo(55L);
    }

    @Test
    void longFieldListsAreCutToTheColumnAndNeverFailTheChange() {
        when(repo.save(any(JobDataEvent.class))).thenAnswer(i -> i.getArgument(0));
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 100; i++) many.add("someFieldName" + i);
        assertThat(ledger.edited(ORG, 1L, ME, many).getFields()).hasSize(300);
        assertThat(ledger.edited(ORG, 1L, ME, List.of()).getFields()).isNull();
    }

    @Test
    void theCapturedRowIsBuiltButSavedByTheJobsOwnTransaction() {
        ClientRequirement job = new ClientRequirement();
        job.setId(55L);
        job.setOrgId(ORG);
        job.setJobUrl("https://example.com/" + "p".repeat(400));
        JobDataEvent e = ledger.capturedEvent(job, ME, "r".repeat(100), List.of("title", "jobUrl"));
        assertThat(e.getEventType()).isEqualTo("CAPTURED");
        assertThat(e.getActorKind()).isEqualTo("EXTENSION");
        assertThat(e.getDetailLevelAfter()).isEqualTo("MINIMAL");
        assertThat(e.getSourceRef()).hasSize(200);
        assertThat(e.getRequestId()).hasSize(64);
        assertThat(e.getFields()).isEqualTo("title,jobUrl");
        verify(repo, never()).save(any(JobDataEvent.class));
    }

    // ---- CAPTURED is written with the job -----------------------------------------------------------------------------------------

    @Test
    void aCreatedJobGetsItsLedgerRowInTheInsertTransactionAndAnExistingOneGetsNone() {
        ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
        JobIdentityTx tx = mock(JobIdentityTx.class);
        JobIdentityService identity = new JobIdentityService(mock(ClientAccountRepository.class), requirements, tx);
        when(requirements.findByOrgIdAndUrlKeyHash(eq(ORG), eq("hash1"))).thenReturn(Optional.empty());
        when(tx.insertRequirement(any(ClientRequirement.class), any())).thenReturn(9L);

        ClientRequirement fresh = new ClientRequirement();
        Function<ClientRequirement, JobDataEvent> row = j -> new JobDataEvent();
        JobIdentityService.Found<ClientRequirement> created = identity.findOrCreateRequirement(all, "hash1", null, null, () -> fresh, row);
        assertThat(created.existing()).isFalse();
        assertThat(fresh.getOrgId()).isEqualTo(ORG);
        verify(tx).insertRequirement(fresh, row);
        verify(tx, never()).insertRequirement(any(ClientRequirement.class));

        ClientRequirement there = new ClientRequirement();
        when(requirements.findByOrgIdAndUrlKeyHash(eq(ORG), eq("hash2"))).thenReturn(Optional.of(there));
        JobIdentityService.Found<ClientRequirement> found = identity.findOrCreateRequirement(all, "hash2", null, null, ClientRequirement::new, row);
        assertThat(found.existing()).isTrue();
        verify(tx, never()).insertRequirement(eq(there), any());
    }

    @Test
    void aLostRaceReReadsTheWinnerAndWritesNoSecondCapturedRow() {
        ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
        JobIdentityTx tx = mock(JobIdentityTx.class);
        JobIdentityService identity = new JobIdentityService(mock(ClientAccountRepository.class), requirements, tx);
        ClientRequirement winner = new ClientRequirement();
        winner.setId(3L);
        when(requirements.findByOrgIdAndUrlKeyHash(eq(ORG), eq("hash1"))).thenReturn(Optional.empty());
        when(tx.insertRequirement(any(ClientRequirement.class), any())).thenThrow(new DataIntegrityViolationException("uk_req_url"));
        when(tx.readRequirementByUrlKey(ORG, "hash1")).thenReturn(Optional.of(winner));
        JobIdentityService.Found<ClientRequirement> f = identity.findOrCreateRequirement(all, "hash1", null, null, ClientRequirement::new, j -> new JobDataEvent());
        assertThat(f.existing()).isTrue();
        assertThat(f.value()).isSameAs(winner);
    }

    @Test
    void theJobInsertWritesTheLedgerRowThroughTheSameRepositoryCall() {
        ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
        JobDataEventRepository events = mock(JobDataEventRepository.class);
        JobIdentityTx tx = new JobIdentityTx(mock(ClientAccountRepository.class), requirements, mock(com.dossier.api.repository.ent.talent.RequirementMatchRepository.class), mock(com.dossier.api.repository.ent.mkt.MktOpportunityRepository.class), events);
        ClientRequirement job = new ClientRequirement();
        when(requirements.saveAndFlush(job)).thenAnswer(i -> {
            job.setId(42L);
            return job;
        });
        Long id = tx.insertRequirement(job, saved -> {
            JobDataEvent e = new JobDataEvent();
            e.setRequirementId(saved.getId());
            return e;
        });
        assertThat(id).isEqualTo(42L);
        org.mockito.ArgumentCaptor<JobDataEvent> captor = org.mockito.ArgumentCaptor.forClass(JobDataEvent.class);
        verify(events).save(captor.capture());
        assertThat(captor.getValue().getRequirementId()).isEqualTo(42L); // built from the SAVED job, so it has the id
        org.mockito.InOrder order = org.mockito.Mockito.inOrder(requirements, events);
        order.verify(requirements).saveAndFlush(job);
        order.verify(events).save(any(JobDataEvent.class));
    }

    @Test
    void theInsertTransactionIsItsOwnSoTheCapturedRowCommitsWithTheJob() throws Exception {
        var m = JobIdentityTx.class.getMethod("insertRequirement", ClientRequirement.class, Function.class);
        var tx = m.getAnnotation(org.springframework.transaction.annotation.Transactional.class);
        assertThat(tx).isNotNull();
        assertThat(tx.propagation()).isEqualTo(org.springframework.transaction.annotation.Propagation.REQUIRES_NEW);
    }

    // ---- ASSIGNED comes from the one assignment service ----------------------------------------------------------------------------

    @Test
    void everyAssignPathWritesAssignedThroughTheSharedServiceExactlyWhenSomethingChanged() {
        AssignmentWorld world = new AssignmentWorld(ORG, CLOCK);
        List<JobDataEvent> rows = new ArrayList<>();
        JobDataEventRepository events = mock(JobDataEventRepository.class);
        when(events.save(any(JobDataEvent.class))).thenAnswer(i -> {
            rows.add(i.getArgument(0));
            return i.getArgument(0);
        });
        OpportunityAssignmentService service = new OpportunityAssignmentService(
            world.matches, world.opportunities, world.events, world.requirements, world.consultants, world.resumes, world.tx, world.audit, CLOCK, new JobDataLedger(events, CLOCK)
        );
        world.job(100, "OPEN", "MANUAL");
        world.consultant(10, "ACTIVE", "ACTIVE");
        world.approve(10);

        var first = service.assign(all, me, 100L, 10L, OpportunityAssignmentService.Options.none());
        assertThat(first.created()).isTrue();
        assertThat(rows).singleElement().satisfies(e -> {
            assertThat(e.getEventType()).isEqualTo("ASSIGNED");
            assertThat(e.getRequirementId()).isEqualTo(100L);
            assertThat(e.getOrgId()).isEqualTo(ORG);
            assertThat(e.getActorMemberId()).isEqualTo(ME);
            assertThat(e.getNote()).isEqualTo("assigned to consultant 10");
        });

        var again = service.assign(all, me, 100L, 10L, OpportunityAssignmentService.Options.none());
        assertThat(again.existing()).isTrue();
        assertThat(rows).hasSize(1); // nothing changed, so the ledger says nothing

        world.oppStore.values().iterator().next().setState("DECLINED");
        service.assign(all, me, 100L, 10L, OpportunityAssignmentService.Options.none());
        assertThat(rows).hasSize(2);
        assertThat(rows.get(1).getNote()).isEqualTo("reassigned to consultant 10");
    }

    @Test
    void aRefusedOrFailedAssignmentWritesNoLedgerRow() {
        AssignmentWorld world = new AssignmentWorld(ORG, CLOCK);
        JobDataEventRepository events = mock(JobDataEventRepository.class);
        OpportunityAssignmentService service = new OpportunityAssignmentService(
            world.matches, world.opportunities, world.events, world.requirements, world.consultants, world.resumes, world.tx, world.audit, CLOCK, new JobDataLedger(events, CLOCK)
        );
        world.job(100, "CLOSED", "MANUAL");
        world.job(101, "OPEN", "MANUAL");
        world.consultant(10, "ACTIVE", "PAUSED");
        try {
            service.assign(all, me, 100L, 10L, OpportunityAssignmentService.Options.none());
        } catch (RuntimeException expected) {
            // JOB_NOT_OPEN
        }
        assertThat(service.assign(all, me, 101L, 10L, OpportunityAssignmentService.Options.none()).refused()).isTrue();
        verify(events, never()).save(any(JobDataEvent.class));
    }
}
