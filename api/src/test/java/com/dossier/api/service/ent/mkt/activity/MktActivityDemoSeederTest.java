package com.dossier.api.service.ent.mkt.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktActivity;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.mkt.MktActivityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The demo seeder is gated, idempotent, writes manual rows only and keeps every row inside the marketer's own consultants. */
class MktActivityDemoSeederTest {

    private final TalentDemoSeeder talent = mock(TalentDemoSeeder.class);
    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    private final ClientAccountRepository clients = mock(ClientAccountRepository.class);
    private final MktActivityRepository activities = mock(MktActivityRepository.class);
    private final MktActivityDemoSeeder seeder = new MktActivityDemoSeeder(talent, orgs, assignments, clients, activities);

    private static MarketerAssignment assignment(long consultant, long marketer) {
        MarketerAssignment a = new MarketerAssignment();
        a.setOrgId(5L);
        a.setConsultantId(consultant);
        a.setMarketerMemberId(marketer);
        return a;
    }

    private static Organization org(long id) {
        Organization o = new Organization();
        try {
            Field f = Organization.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(o, id);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
        return o;
    }

    @Test
    void refusedWhenTheDemoSwitchesAreOff() {
        when(talent.refusal()).thenReturn("demo off");
        assertThat(seeder.seed()).isEmpty();
        verify(activities, never()).save(any());
    }

    @Test
    void anOrgThatAlreadyHasRowsIsLeftAlone() {
        when(talent.refusal()).thenReturn(null);
        when(orgs.findBySlug(any())).thenReturn(Optional.of(org(5L)));
        when(activities.countByOrgId(5L)).thenReturn(3L);
        assertThat(seeder.seed()).isEmpty();
        verify(activities, never()).save(any());
    }

    @Test
    void everyMarketerGetsTenCompletedAndThreePlannedRowsOfTheirOwnConsultants() {
        when(talent.refusal()).thenReturn(null);
        when(orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG)).thenReturn(Optional.of(org(5L)));
        when(orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG)).thenReturn(Optional.empty());
        when(activities.countByOrgId(5L)).thenReturn(0L);
        List<MarketerAssignment> as = new ArrayList<>(List.of(assignment(1, 70), assignment(2, 70), assignment(3, 71)));
        when(assignments.findByOrgId(5L)).thenReturn(as);
        when(clients.findByOrgIdOrderByNameAsc(5L)).thenReturn(List.of());
        when(activities.save(any(MktActivity.class))).thenAnswer(inv -> inv.getArgument(0));

        assertThat(seeder.seed()).containsEntry(EnterpriseDemoSeeder.ACME_SLUG, 26);
        ArgumentCaptor<MktActivity> saved = ArgumentCaptor.forClass(MktActivity.class);
        verify(activities, times(26)).save(saved.capture());
        for (MktActivity a : saved.getAllValues()) {
            assertThat(a.getOrgId()).isEqualTo(5L);
            boolean mine = a.getActorMemberId() == 70L ? List.of(1L, 2L).contains(a.getConsultantId()) : a.getConsultantId() == 3L;
            assertThat(mine).as("consultant %s of marketer %s", a.getConsultantId(), a.getActorMemberId()).isTrue();
            assertThat(MktActivityTypes.Type.parse(a.getActivityType())).isPresent();
            assertThat(MktActivityTypes.Type.parse(a.getActivityType()).orElseThrow().manual).isTrue();
        }
        assertThat(saved.getAllValues().stream().filter(a -> "SCHEDULED".equals(a.getStatus()))).hasSize(6);
        verify(activities, never()).findByOrgIdAndId(anyLong(), anyLong());
    }
}
