package com.dossier.api.service.ent.mkt.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktTask;
import com.dossier.api.domain.ent.mkt.MktTaskEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktTaskEventRepository;
import com.dossier.api.repository.ent.mkt.MktTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The demo seed's shape (the board's 24 open + 16 completed per marketer), ownership, idempotency and the refusal switch, with mocked repositories. */
class MktTasksDemoSeederTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private final TalentDemoSeeder talent = mock(TalentDemoSeeder.class);
    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    private final ClientAccountRepository clients = mock(ClientAccountRepository.class);
    private final MktTaskRepository tasks = mock(MktTaskRepository.class);
    private final MktTaskEventRepository events = mock(MktTaskEventRepository.class);
    private final MktTasksDemoSeeder seeder = new MktTasksDemoSeeder(talent, orgs, assignments, clients, tasks, events);

    private static MarketerAssignment assignment(Long consultant, Long marketer) {
        MarketerAssignment a = new MarketerAssignment();
        a.setConsultantId(consultant);
        a.setMarketerMemberId(marketer);
        return a;
    }

    private List<MktTask> seedTwoMarketers() {
        when(assignments.findByOrgId(1L)).thenReturn(List.of(assignment(11L, 7L), assignment(12L, 7L), assignment(21L, 8L)));
        ClientAccount tech = new ClientAccount();
        tech.setId(5L);
        tech.setName("TechCorp");
        when(clients.findByOrgId(1L)).thenReturn(List.of(tech));
        long[] next = { 100 };
        when(tasks.save(any(MktTask.class))).thenAnswer(inv -> {
            MktTask t = inv.getArgument(0);
            t.setId(next[0]++);
            return t;
        });
        int made = seeder.seedOrg(1L, 42L, NOW);
        ArgumentCaptor<MktTask> saved = ArgumentCaptor.forClass(MktTask.class);
        verify(tasks, atLeastOnce()).save(saved.capture());
        assertThat(made).isEqualTo(saved.getAllValues().size());
        return new ArrayList<>(saved.getAllValues());
    }

    @Test
    void everyMarketerGetsTheBoardsTwentyFourOpenAndSixteenCompletedTasks() {
        List<MktTask> all = seedTwoMarketers();
        assertThat(all).hasSize(2 * 40);
        for (Long owner : List.of(7L, 8L)) {
            List<MktTask> mine = all.stream().filter(t -> owner.equals(t.getOwnerMemberId())).toList();
            List<MktTask> open = mine.stream().filter(MktTask::isOpen).toList();
            assertThat(mine).hasSize(40);
            assertThat(open).hasSize(24);
            assertThat(open.stream().filter(t -> t.isOverdueAt(NOW))).hasSize(5);
            assertThat(open.stream().filter(t -> !t.getDueAt().isBefore(NOW) && t.getDueAt().isBefore(NOW.plus(7, ChronoUnit.DAYS)))).hasSize(8);
            assertThat(open.stream().filter(t -> !t.getDueAt().isBefore(NOW.plus(7, ChronoUnit.DAYS)))).hasSize(11);
            List<MktTask> done = mine.stream().filter(t -> !t.isOpen()).toList();
            assertThat(done).hasSize(16);
            assertThat(done).allSatisfy(t -> {
                assertThat(t.getCompletedAt()).isBefore(NOW);
                assertThat(t.getCompletedAt()).isAfterOrEqualTo(NOW.minus(7, ChronoUnit.DAYS));
            });
        }
    }

    @Test
    void aConsultantTaskIsAboutOneOfTheOwnersOwnConsultants() {
        List<MktTask> all = seedTwoMarketers();
        assertThat(all.stream().filter(t -> t.getConsultantId() != null)).isNotEmpty().allSatisfy(t -> {
            if (t.getOwnerMemberId().equals(7L)) assertThat(t.getConsultantId()).isIn(11L, 12L);
            else assertThat(t.getConsultantId()).isEqualTo(21L);
        });
    }

    @Test
    void everyTaskHasTheBoardsShapeAndNoSensitiveData() {
        List<MktTask> all = seedTwoMarketers();
        assertThat(all).allSatisfy(t -> {
            assertThat(MktTask.CATEGORIES).contains(t.getCategory());
            assertThat(MktTask.PRIORITIES).contains(t.getPriority());
            assertThat(MktTask.STATUSES).contains(t.getStatus());
            assertThat(t.getTitle()).isNotBlank();
            assertThat(t.getCreatedAt()).isBeforeOrEqualTo(NOW);
            assertThat(t.getCreatedByMemberId()).isEqualTo(t.getOwnerMemberId());
        });
        assertThat(all.stream().map(MktTask::getCategory).distinct()).as("all ten categories appear").hasSize(10);
        assertThat(all.stream().filter(t -> t.getClientAccountId() != null).map(MktTask::getClientAccountId)).containsOnly(5L);
        verify(events, atLeastOnce()).save(any(MktTaskEvent.class));
    }

    @Test
    void anOrgWithoutAssignmentsGetsNothingAndSeededOrgsAreSkipped() {
        assertThat(seeder.seedOrg(1L, 1L, NOW)).isZero();
        Organization acme = new Organization();
        acme.setId(1L);
        when(talent.refusal()).thenReturn(null);
        when(orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG)).thenReturn(Optional.of(acme));
        when(tasks.countByOrgId(1L)).thenReturn(5L);
        assertThat(seeder.seed()).isEmpty();
        verify(tasks, never()).save(any());
    }

    @Test
    void aRefusingEnvironmentSeedsNothing() {
        when(talent.refusal()).thenReturn("prod");
        assertThat(seeder.seed()).isEmpty();
        verify(orgs, never()).findBySlug(any());
    }
}
