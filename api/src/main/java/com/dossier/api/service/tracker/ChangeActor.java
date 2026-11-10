package com.dossier.api.service.tracker;

import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import java.util.Optional;

/**
 * Who is doing this write (docs/change-audit/README.md section 2.3), as the small value {@link ApplicationEvent}s are stamped with. Resolved once by
 * the service that handles the request and handed to {@code ApplicationEventService}, which never reads a thread-local itself, so its unit tests stay
 * plain. There is nothing to inject: the owner is already loaded by the caller and the only ambient fact is {@link TrackerActAs}.
 *
 * <p>A person is {@link #forOwner}: the owner of the record, or - inside a {@link TrackerActAs} window - the person acting for them, with the owner
 * recorded as {@code on_behalf_of}. The four non-person writers say so explicitly: {@link #extension} (submit-detect), {@link #mail} (the inbox),
 * {@link #assistant}, {@link #system} (migrations, the demo seed, projections). Nothing is ever inferred from {@code source} at read time.
 */
public final class ChangeActor {

    private ChangeActor() {}

    /**
     * One actor. {@code kind} is an {@link ApplicationEvent} {@code ACTOR_*} constant; {@code userId} / {@code login} name the signed-in person (null
     * for the four non-person kinds); {@code onBehalfOfUserId} is the record's owner when the actor is somebody else.
     */
    public record Actor(String kind, Long userId, String login, Long onBehalfOfUserId) {
        public boolean isPerson() {
            return ApplicationEvent.ACTOR_PERSON.equals(kind);
        }
    }

    /** The person writing a record owned by {@code owner}: the owner, or whoever {@link TrackerActAs} says is acting for them. */
    public static Actor forOwner(User owner) {
        Optional<TrackerActAs.Scope> acting = TrackerActAs.current();
        if (acting.isPresent() && !sameAccount(owner, acting.get())) {
            return new Actor(ApplicationEvent.ACTOR_PERSON, acting.get().actorUserId(), acting.get().actorLogin(), owner.getId());
        }
        return new Actor(ApplicationEvent.ACTOR_PERSON, owner.getId(), owner.getLogin(), null);
    }

    public static Actor extension() {
        return new Actor(ApplicationEvent.ACTOR_EXTENSION, null, null, null);
    }

    public static Actor mail() {
        return new Actor(ApplicationEvent.ACTOR_MAIL, null, null, null);
    }

    public static Actor assistant() {
        return new Actor(ApplicationEvent.ACTOR_ASSISTANT, null, null, null);
    }

    public static Actor system() {
        return new Actor(ApplicationEvent.ACTOR_SYSTEM, null, null, null);
    }

    /** The non-person kind a channel stands for ({@code source}), for the writers that only know the channel (the demo seed, an imported event). */
    public static Actor forSource(String source, User owner) {
        if (source == null) return forOwner(owner);
        return switch (source) {
            case ApplicationEvent.SRC_INBOX -> mail();
            case ApplicationEvent.SRC_ASSISTANT -> assistant();
            case ApplicationEvent.SRC_SYSTEM -> system();
            default -> forOwner(owner);
        };
    }

    private static boolean sameAccount(User owner, TrackerActAs.Scope scope) {
        return owner != null && ((owner.getId() != null && owner.getId().equals(scope.actorUserId())) || (owner.getLogin() != null && owner.getLogin().equals(scope.actorLogin())));
    }
}
