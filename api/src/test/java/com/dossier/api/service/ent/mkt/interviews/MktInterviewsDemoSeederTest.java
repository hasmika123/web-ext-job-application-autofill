package com.dossier.api.service.ent.mkt.interviews;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktInterviewMeta;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.mkt.MktInterviewEventRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewFeedbackRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewMetaRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The demo seeder is gated, idempotent and writes one meta row per interview. */
class MktInterviewsDemoSeederTest {

    private static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");

    private final EnterpriseDemoSeeder gate = mock(EnterpriseDemoSeeder.class);
    private final OrganizationRepository orgs = mock(OrganizationRepository.class);
    private final MktInterviewRepository interviews = mock(MktInterviewRepository.class);
    private final MktInterviewMetaRepository metas = mock(MktInterviewMetaRepository.class);
    private final MktInterviewFeedbackRepository feedback = mock(MktInterviewFeedbackRepository.class);
    private final MktInterviewEventRepository events = mock(MktInterviewEventRepository.class);
    private final MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    private final MktInterviewsDemoSeeder seeder = new MktInterviewsDemoSeeder(gate, orgs, interviews, metas, feedback, events, assignments);

    private List<TalentInterview> rows() {
        List<TalentInterview> out = new ArrayList<>();
        for (long id = 1; id <= 40; id++) {
            TalentInterview i = new TalentInterview();
            i.setId(id);
            i.setOrgId(5L);
            i.setConsultantId(id % 4 + 1);
            i.setClientId(1L);
            boolean upcoming = id % 2 == 0;
            i.setScheduledAt(upcoming ? NOW.plus(Duration.ofHours(id * 5)) : NOW.minus(Duration.ofHours(id * 20)));
            i.setStatus(upcoming ? "SCHEDULED" : "COMPLETED");
            i.setRoundLabel(id % 3 == 0 ? "Technical Interview" : "Final Round");
            out.add(i);
        }
        return out;
    }

    @Test
    void refusedWhenTheDemoSwitchesAreOff() {
        when(gate.refusal()).thenReturn("the demo is off (DEMO_ENABLED)");
        assertThat(seeder.seed()).isZero();
        verify(metas, never()).saveAll(any());
    }

    @Test
    void skipsAnOrganizationThatAlreadyHasMeta() {
        when(metas.countByOrgId(5L)).thenReturn(3L);
        assertThat(seeder.seedOrg(5L, NOW)).isZero();
        verify(metas, never()).saveAll(any());
    }

    @Test
    void writesOneValidMetaPerInterviewAndSomeFeedbackAndEvents() {
        when(interviews.findLiveFrom(5L, Instant.EPOCH)).thenReturn(rows());
        MarketerAssignment a = new MarketerAssignment();
        a.setConsultantId(1L);
        a.setMarketerMemberId(71L);
        MarketerAssignment b = new MarketerAssignment();
        b.setConsultantId(2L);
        b.setMarketerMemberId(72L);
        when(assignments.findByOrgId(5L)).thenReturn(List.of(a, b));
        assertThat(seeder.seedOrg(5L, NOW)).isEqualTo(40);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<MktInterviewMeta>> captor = ArgumentCaptor.forClass(List.class);
        verify(metas).saveAll(captor.capture());
        List<MktInterviewMeta> m = captor.getValue();
        assertThat(m).hasSize(40).allSatisfy(x -> {
            assertThat(x.getOrgId()).isEqualTo(5L);
            assertThat(x.getInterviewType()).isIn("VIDEO", "ONSITE", "TECHNICAL", "PANEL", "CLIENT");
            assertThat(x.getCoordinationStatus()).isIn("CONFIRMED", "SCHEDULED", "AWAITING_CONFIRMATION", "RESCHEDULED");
            assertThat(x.getRecruiterName()).isNotBlank();
            assertThat(x.getFeedbackDueAt()).isNotNull();
        });
        assertThat(m).extracting(MktInterviewMeta::getCoordinationStatus).contains("CONFIRMED");
        verify(feedback).saveAll(any());
        verify(events).saveAll(any());
        // the same run twice gives the same rows (deterministic per interview)
        when(metas.countByOrgId(anyLong())).thenReturn(0L);
        seeder.seedOrg(5L, NOW);
        ArgumentCaptor<List<MktInterviewMeta>> second = ArgumentCaptor.forClass(List.class);
        verify(metas, org.mockito.Mockito.times(2)).saveAll(second.capture());
        assertThat(second.getAllValues().get(1)).extracting(MktInterviewMeta::getCoordinationStatus).containsExactlyElementsOf(m.stream().map(MktInterviewMeta::getCoordinationStatus).toList());
    }

    @Test
    void anOrganizationWithoutInterviewsWritesNothing() {
        when(interviews.findLiveFrom(5L, Instant.EPOCH)).thenReturn(List.of());
        assertThat(seeder.seedOrg(5L, NOW)).isZero();
        verify(metas, never()).saveAll(any());
    }
}
