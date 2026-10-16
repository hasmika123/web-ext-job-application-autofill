package com.dossier.api.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** U6.12: the actor constants and the default of a new event's actor_kind. */
class ApplicationEventTest {

    @Test
    void theFiveActorKindsAreNamedAsTheColumnStoresThem() {
        assertThat(ApplicationEvent.ACTOR_PERSON).isEqualTo("PERSON");
        assertThat(ApplicationEvent.ACTOR_EXTENSION).isEqualTo("EXTENSION");
        assertThat(ApplicationEvent.ACTOR_MAIL).isEqualTo("MAIL");
        assertThat(ApplicationEvent.ACTOR_ASSISTANT).isEqualTo("ASSISTANT");
        assertThat(ApplicationEvent.ACTOR_SYSTEM).isEqualTo("SYSTEM");
    }

    @Test
    void aNewEventHasNoPersonBehindItUntilAWriterSaysSo() {
        ApplicationEvent e = new ApplicationEvent();
        assertThat(e.getActorKind()).isEqualTo(ApplicationEvent.ACTOR_SYSTEM);
        assertThat(e.getActorUserId()).isNull();
        assertThat(e.getActorLogin()).isNull();
        assertThat(e.getOnBehalfOfUserId()).isNull();
        assertThat(e.getChanges()).isNull();
    }

    @Test
    void aNullActorKindFallsBackToSystemNeverToNull() {
        ApplicationEvent e = new ApplicationEvent();
        e.setActorKind(ApplicationEvent.ACTOR_PERSON);
        e.setActorKind(null);
        assertThat(e.getActorKind()).isEqualTo(ApplicationEvent.ACTOR_SYSTEM);
    }
}
