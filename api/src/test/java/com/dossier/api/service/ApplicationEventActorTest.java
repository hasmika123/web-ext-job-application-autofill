package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.dto.TrackerDTOs.ChangeDTO;
import com.dossier.api.service.tracker.ChangeActor;
import com.dossier.api.service.tracker.ChangeActors;
import com.dossier.api.service.tracker.ChangeRecorder;
import com.dossier.api.service.tracker.Changes;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Change audit on the one writer: README section 2.3 (who is the actor), one event per request, and the head record's updated_by. */
class ApplicationEventActorTest {

    private static final Instant NOW = Instant.parse("2026-10-15T09:42:00Z");
    private static final ChangeActor.Actor OWNER = new ChangeActor.Actor("PERSON", 7L, "anika", null);
    private static final ChangeActor.Actor MARKETER_FOR_OWNER = new ChangeActor.Actor("PERSON", 99L, "ent#5#sarah", 7L);

    private final List<ApplicationEvent> saved = new ArrayList<>();
    private ApplicationEventService service;

    @BeforeEach
    void setUp() {
        ApplicationEventRepository events = mock(ApplicationEventRepository.class);
        when(events.save(any(ApplicationEvent.class))).thenAnswer(inv -> {
            saved.add(inv.getArgument(0));
            return inv.getArgument(0);
        });
        service = new ApplicationEventService(events, mock(ApplicationRepository.class), TrackerTestSupport.settings(), mock(TrackerUsers.class), mock(ChangeActors.class), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static Application app(ApplicationStatus status) {
        Application a = new Application();
        a.setId(42L);
        a.setStatus(status);
        a.setUpdatedAt(NOW.minusSeconds(86_400));
        return a;
    }

    @Test
    void aPersonsWriteStampsTheEventAndTheHead() {
        Application a = app(ApplicationStatus.APPLIED);
        service.recordStatus(a, ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, ApplicationEvent.SRC_WEB, null, null, OWNER);

        ApplicationEvent e = saved.get(0);
        assertThat(e.getActorKind()).isEqualTo("PERSON");
        assertThat(e.getActorUserId()).isEqualTo(7L);
        assertThat(e.getActorLogin()).isEqualTo("anika");
        assertThat(e.getOnBehalfOfUserId()).isNull();
        assertThat(e.getSource()).isEqualTo("WEB");
        assertThat(a.getUpdatedByUserId()).isEqualTo(7L);
        assertThat(a.getUpdatedByLogin()).isEqualTo("anika");
        assertThat(a.getUpdatedAt()).isEqualTo(NOW);
    }

    @Test
    void actingForSomeoneStampsTheMarketerAsActorAndTheOwnerAsOnBehalfOf() {
        Application a = app(ApplicationStatus.SAVED);
        service.recordCreated(a, ApplicationEvent.SRC_WEB, MARKETER_FOR_OWNER);

        ApplicationEvent e = saved.get(0);
        assertThat(e.getActorKind()).isEqualTo("PERSON");
        assertThat(e.getActorUserId()).isEqualTo(99L);
        assertThat(e.getOnBehalfOfUserId()).isEqualTo(7L);
        assertThat(a.getCreatedByUserId()).isEqualTo(99L);
        assertThat(a.getUpdatedByUserId()).isEqualTo(99L);
    }

    @Test
    void theNonPersonWritersLeaveNoPersonOnTheEventOrTheHead() {
        for (ChangeActor.Actor actor : List.of(ChangeActor.extension(), ChangeActor.mail(), ChangeActor.assistant(), ChangeActor.system())) {
            saved.clear();
            Application a = app(ApplicationStatus.APPLIED);
            a.setUpdatedByUserId(7L);
            a.setUpdatedByLogin("anika");
            service.recordStatus(a, ApplicationStatus.APPLIED, ApplicationStatus.REJECTED, ApplicationEvent.SRC_INBOX, 3L, null, actor);

            assertThat(saved.get(0).getActorKind()).isEqualTo(actor.kind());
            assertThat(saved.get(0).getActorUserId()).isNull();
            assertThat(saved.get(0).getActorLogin()).isNull();
            assertThat(a.getUpdatedByUserId()).as("the head no longer names the earlier person").isNull();
            assertThat(a.getUpdatedByLogin()).isNull();
        }
    }

    @Test
    void aBackDatedRowStampsTheEventButLeavesTheHeadAlone() {
        Application a = app(ApplicationStatus.APPLIED);
        Instant before = a.getUpdatedAt();
        service.recordAt(a, ApplicationEvent.NOTE, null, null, "SYSTEM", 1L, "Note added", NOW.minusSeconds(86_400 * 30L), ChangeActor.system(), null);
        assertThat(saved.get(0).getActorKind()).isEqualTo("SYSTEM");
        assertThat(a.getUpdatedAt()).isEqualTo(before);
        assertThat(a.getUpdatedByUserId()).isNull();
    }

    @Test
    void anEventWithoutAnActorIsSystemNeverAnonymousPerson() {
        service.recordAt(app(ApplicationStatus.APPLIED), ApplicationEvent.NOTE, null, null, "SYSTEM", 1L, "x", NOW, null, null);
        assertThat(saved.get(0).getActorKind()).isEqualTo("SYSTEM");
    }

    @Test
    void changesAreStoredAsTheJsonColumn() {
        service.record(app(ApplicationStatus.APPLIED), ApplicationEvent.FIELD, null, null, "WEB", null, "Starred", OWNER, new Changes().flag("starred", false, true));
        assertThat(saved.get(0).getChanges()).isEqualTo("[{\"f\":\"starred\",\"from\":\"false\",\"to\":\"true\"}]");
    }

    // ---- one event per request -----------------------------------------------------------------------------

    @Test
    void aPatchThatChangesStatusNextStepAndStarWritesExactlyOneStatusEvent() {
        Application a = app(ApplicationStatus.APPLIED);
        ChangeRecorder rec = new ChangeRecorder(service, a, ApplicationEvent.SRC_WEB, OWNER);
        rec.status(ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW, null);
        rec.text("nextAction", "Next step: Follow up with Sarah");
        rec.flag("starred", false, true, "Starred");
        assertThat(rec.flush()).isTrue();

        assertThat(saved).hasSize(1);
        ApplicationEvent e = saved.get(0);
        assertThat(e.getKind()).isEqualTo(ApplicationEvent.STATUS);
        assertThat(e.getFromStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(e.getToStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
        assertThat(e.getSummary()).as("the headline stays the status line").isEqualTo("Moved to Interview");
        List<ChangeDTO> changes = Changes.parse(e.getChanges());
        assertThat(changes).extracting(ChangeDTO::f).containsExactly("status", "nextAction", "starred");
        assertThat(changes.get(0)).isEqualTo(new ChangeDTO("status", "APPLIED", "INTERVIEW"));
        assertThat(changes.get(1)).as("free text: the name only").isEqualTo(new ChangeDTO("nextAction", null, null));
        assertThat(e.getChanges()).doesNotContain("Follow up with Sarah");
    }

    @Test
    void aChangeWithoutAStatusMoveIsAFieldEventAndALoneResumeChangeIsAResumeEvent() {
        ChangeRecorder star = new ChangeRecorder(service, app(ApplicationStatus.APPLIED), ApplicationEvent.SRC_WEB, OWNER);
        star.flag("starred", false, true, "Starred").flush();
        assertThat(saved.get(0).getKind()).isEqualTo(ApplicationEvent.FIELD);

        ChangeRecorder resume = new ChangeRecorder(service, app(ApplicationStatus.APPLIED), ApplicationEvent.SRC_WEB, OWNER);
        resume.resume(3L, 4L, "Resume: Backend").flush();
        assertThat(saved.get(1).getKind()).isEqualTo(ApplicationEvent.RESUME);
        assertThat(saved.get(1).getRefId()).isEqualTo(4L);
    }

    @Test
    void nothingChangedWritesNothingAndLeavesUpdatedAtAlone() {
        Application a = app(ApplicationStatus.APPLIED);
        Instant before = a.getUpdatedAt();
        ChangeRecorder rec = new ChangeRecorder(service, a, ApplicationEvent.SRC_WEB, OWNER);
        rec.status(ApplicationStatus.APPLIED, ApplicationStatus.APPLIED, null);
        assertThat(rec.flush()).isFalse();
        assertThat(saved).isEmpty();
        assertThat(a.getUpdatedAt()).isEqualTo(before);
        assertThat(a.getUpdatedByUserId()).isNull();
    }

    @Test
    void theChangesColumnKeepsTheHeadlineWhenAManyFieldEditWouldOverflowIt() {
        ChangeRecorder rec = new ChangeRecorder(service, app(ApplicationStatus.APPLIED), ApplicationEvent.SRC_WEB, OWNER);
        rec.status(ApplicationStatus.APPLIED, ApplicationStatus.OFFER, null);
        for (int i = 0; i < 120; i++) rec.text("detailField" + i, "Details updated");
        rec.flush();
        String json = saved.get(0).getChanges();
        assertThat(json.length()).isLessThanOrEqualTo(1000);
        assertThat(Changes.parse(json).get(0).f()).isEqualTo("status");
    }

    @Test
    void aRepeatedNoteEditByTheSamePersonInsideTheWindowIsRecognised() {
        ApplicationEventRepository events = mock(ApplicationEventRepository.class);
        ApplicationEvent last = new ApplicationEvent();
        last.setKind(ApplicationEvent.NOTE);
        last.setRefId(9L);
        last.setSummary(ApplicationEventService.NOTE_EDITED);
        last.setActorKind("PERSON");
        last.setActorUserId(7L);
        last.setCreatedAt(NOW.minusSeconds(60));
        when(events.findByApplicationIdOrderByCreatedAtDescIdDesc(any(), any())).thenReturn(List.of(last));
        ApplicationEventService s = new ApplicationEventService(events, mock(ApplicationRepository.class), TrackerTestSupport.settings(), mock(TrackerUsers.class), mock(ChangeActors.class), Clock.fixed(NOW, ZoneOffset.UTC));

        assertThat(s.isRepeatNoteEdit(app(ApplicationStatus.APPLIED), 9L, OWNER)).isTrue();
        assertThat(s.isRepeatNoteEdit(app(ApplicationStatus.APPLIED), 10L, OWNER)).as("another note").isFalse();
        assertThat(s.isRepeatNoteEdit(app(ApplicationStatus.APPLIED), 9L, MARKETER_FOR_OWNER)).as("another person").isFalse();

        last.setCreatedAt(NOW.minusSeconds(3600));
        assertThat(s.isRepeatNoteEdit(app(ApplicationStatus.APPLIED), 9L, OWNER)).as("outside the window").isFalse();
        verify(events, never()).save(any());
    }
}
