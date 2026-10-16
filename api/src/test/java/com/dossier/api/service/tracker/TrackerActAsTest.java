package com.dossier.api.service.tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** The tracker's act-for window: it swaps the caller for the owner, names the actor, nests never, and always restores. */
class TrackerActAsTest {

    private static final TrackerActAs.Scope MARKETER = new TrackerActAs.Scope(5L, "ent#5#sarah", 99L);

    @AfterEach
    void clean() {
        SecurityContextHolder.clearContext();
    }

    private static User user(long id, String login) {
        User u = new User();
        u.setId(id);
        u.setLogin(login);
        return u;
    }

    private static void signInAs(String login) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login, "x"));
    }

    @Test
    void outsideAWindowNobodyIsActingAndTheOwnerIsTheAuthor() {
        assertThat(TrackerActAs.current()).isEmpty();
        assertThat(TrackerActAs.authorOr("anika")).isEqualTo("anika");
        ChangeActor.Actor a = ChangeActor.forOwner(user(7, "anika"));
        assertThat(a).isEqualTo(new ChangeActor.Actor(ApplicationEvent.ACTOR_PERSON, 7L, "anika", null));
    }

    @Test
    void insideAWindowTheThreadRunsAsTheOwnerAndTheActorIsTheMarketerOnBehalfOfTheOwner() {
        signInAs("ent#5#sarah");
        User owner = user(7, "anika");

        TrackerActAs.run(owner, MARKETER, () -> {
            assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).isEqualTo("anika");
            assertThat(TrackerActAs.authorOr("anika")).isEqualTo("ent#5#sarah");
            assertThat(ChangeActor.forOwner(owner)).isEqualTo(new ChangeActor.Actor(ApplicationEvent.ACTOR_PERSON, 99L, "ent#5#sarah", 7L));
            return null;
        });

        assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).isEqualTo("ent#5#sarah");
        assertThat(TrackerActAs.current()).isEmpty();
    }

    @Test
    void nestingIsRefused() {
        User owner = user(7, "anika");
        TrackerActAs.run(owner, MARKETER, () -> {
            assertThatThrownBy(() -> TrackerActAs.open(owner, MARKETER)).isInstanceOf(IllegalStateException.class);
            return null;
        });
    }

    @Test
    void theWindowIsClosedAndTheCallerRestoredEvenWhenTheBodyThrows() {
        signInAs("ent#5#sarah");
        assertThatThrownBy(() ->
            TrackerActAs.run(user(7, "anika"), MARKETER, () -> {
                throw new IllegalArgumentException("create failed");
            })
        ).isInstanceOf(IllegalArgumentException.class);

        assertThat(TrackerActAs.current()).isEmpty();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).isEqualTo("ent#5#sarah");
        // and a second window can open: nothing leaked
        assertThat(TrackerActAs.run(user(8, "dev"), MARKETER, () -> "ok")).isEqualTo("ok");
    }

    @Test
    void anOwnerActingForThemselvesIsJustTheOwner() {
        User self = user(99, "ent#5#sarah");
        TrackerActAs.run(self, MARKETER, () -> {
            assertThat(ChangeActor.forOwner(self).onBehalfOfUserId()).isNull();
            return null;
        });
    }

    @Test
    void aWindowNeedsAnOwnerAndAnActor() {
        assertThatThrownBy(() -> TrackerActAs.open(null, MARKETER)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TrackerActAs.open(user(7, "anika"), new TrackerActAs.Scope(5L, null, 99L))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theNonPersonWritersHaveNoPersonBehindThem() {
        for (ChangeActor.Actor a : new ChangeActor.Actor[] { ChangeActor.extension(), ChangeActor.mail(), ChangeActor.assistant(), ChangeActor.system() }) {
            assertThat(a.isPerson()).isFalse();
            assertThat(a.userId()).isNull();
            assertThat(a.login()).isNull();
            assertThat(a.onBehalfOfUserId()).isNull();
        }
        assertThat(ChangeActor.extension().kind()).isEqualTo("EXTENSION");
        assertThat(ChangeActor.mail().kind()).isEqualTo("MAIL");
        assertThat(ChangeActor.assistant().kind()).isEqualTo("ASSISTANT");
        assertThat(ChangeActor.system().kind()).isEqualTo("SYSTEM");
    }

    @Test
    void aChannelOnlyWriterIsMappedByItsSource() {
        User owner = user(7, "anika");
        assertThat(ChangeActor.forSource("INBOX", owner).kind()).isEqualTo("MAIL");
        assertThat(ChangeActor.forSource("ASSISTANT", owner).kind()).isEqualTo("ASSISTANT");
        assertThat(ChangeActor.forSource("SYSTEM", owner).kind()).isEqualTo("SYSTEM");
        assertThat(ChangeActor.forSource("WEB", owner).userId()).isEqualTo(7L);
        assertThat(ChangeActor.forSource("EXTENSION", owner).userId()).isEqualTo(7L);
        assertThat(ChangeActor.forSource(null, owner).userId()).isEqualTo(7L);
    }
}
