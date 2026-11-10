package com.dossier.api.service.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ent.consultant.ConProjectionRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * ent-inbox privacy wall, the part the organization CAN see: when a mail from the consultant's own Gmail moves their application, the organization's
 * mirror gets the new stage tagged with the source INBOX, and the event says only that. No subject, sender, snippet or address can reach it, because
 * the mirror is never handed any (it receives a stage and a source label).
 */
class LinkedApplicationProjectionInboxTest {

    private final ConProjectionRepository projections = mock(ConProjectionRepository.class);
    private final TalentApplicationEventRepository events = mock(TalentApplicationEventRepository.class);
    private final LinkedApplicationProjection projection = new LinkedApplicationProjection(
        projections,
        events,
        mock(ClientRequirementRepository.class),
        Clock.fixed(Instant.parse("2026-10-14T10:00:00Z"), ZoneOffset.UTC)
    );

    private TalentApplication row(String stage) {
        TalentApplication t = new TalentApplication();
        t.setId(900L);
        t.setOrgId(1L);
        t.setStage(stage);
        t.setPersonalApplicationId(55L);
        t.setStageSource(LinkedApplicationProjection.SOURCE_SYSTEM);
        return t;
    }

    @Test
    void aStageMovedByAMailIsTaggedInboxAndSaysNothingElse() {
        TalentApplication r = row("SUBMITTED");
        when(projections.findByOrgIdAndPersonalApplicationId(1L, 55L)).thenReturn(List.of(r));

        projection.mirror(1L, 55L, ApplicationStatus.INTERVIEW, "INBOX");

        assertThat(r.getStage()).isEqualTo("INTERVIEWING");
        assertThat(r.getStageSource()).isEqualTo("INBOX");
        ArgumentCaptor<TalentApplicationEvent> e = ArgumentCaptor.forClass(TalentApplicationEvent.class);
        verify(events).save(e.capture());
        assertThat(e.getValue().getDetail()).isEqualTo("Followed the consultant's own application (source: INBOX)");
        assertThat(e.getValue().getToStage()).isEqualTo("INTERVIEWING");
    }

    @Test
    void anyOtherSourceKeepsTheSystemLabelAndTheOldText() {
        TalentApplication r = row("SUBMITTED");
        when(projections.findByOrgIdAndPersonalApplicationId(1L, 55L)).thenReturn(List.of(r));

        projection.mirror(1L, 55L, ApplicationStatus.OFFER, "EXTENSION");
        projection.mirror(1L, 55L, ApplicationStatus.REJECTED);

        assertThat(r.getStageSource()).isEqualTo("SYSTEM");
        ArgumentCaptor<TalentApplicationEvent> e = ArgumentCaptor.forClass(TalentApplicationEvent.class);
        verify(events, org.mockito.Mockito.times(2)).save(e.capture());
        assertThat(e.getAllValues()).allSatisfy(ev -> assertThat(ev.getDetail()).isEqualTo("Followed the consultant's own application"));
    }

    @Test
    void theMirrorTakesNoMailContentAtAll() {
        // the only inputs are ids, a status and a source label: a structural guarantee that mail text cannot be written here
        for (var m : LinkedApplicationProjection.class.getMethods()) {
            if (!m.getName().equals("mirror")) continue;
            assertThat(m.getParameterTypes()).doesNotContain(com.dossier.api.domain.InboxMessage.class, com.dossier.api.domain.InboxConnection.class);
        }
    }
}
