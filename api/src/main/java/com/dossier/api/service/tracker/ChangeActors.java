package com.dossier.api.service.tracker;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.service.dto.ChangeActorDTO;
import com.dossier.api.service.dto.TrackerDTOs.EventDTO;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns the ids and logins stored on history rows and head records into {@link ChangeActorDTO}s (docs/change-audit/README.md section 2.5): the
 * tracker twin of {@code ResumeActors}, with the privacy rules built in. No name is ever stored, so a name cannot outlive its account. One call
 * resolves a whole page: a single user query by id (and one by login only for rows that carry no id), plus one seat query per organization only
 * for enterprise accounts that have no name.
 *
 * <p>The words, in order: the account's first and last name; else the organization seat's {@code display_label}; else, for a personal login, the
 * login; an ENTERPRISE login ({@code ent#...}) is never shown - it is "a member". No user row, or an erased seat, is "a former member" in an
 * organization context and "a deleted account" in the personal one (a deleted enterprise account is "a former member" in both: that is what it was).
 * The viewer's own "you" is the web's call (it compares {@code userId} with the session).
 */
@Component
public class ChangeActors {

    public static final String A_MEMBER = "a member";
    public static final String FORMER_MEMBER = "a former member";
    public static final String DELETED_ACCOUNT = "a deleted account";

    /** Whose record this is read for: the person's own tracker, or an organization's pipeline. */
    public enum Context {
        PERSONAL,
        ORG,
    }

    /** One actor as stored on a row: its kind and, for a person, the user id and/or login. */
    public record Ref(String kind, Long userId, String login) {
        public static Ref person(Long userId, String login) {
            return new Ref(ApplicationEvent.ACTOR_PERSON, userId, login);
        }

        boolean resolvable() {
            return ApplicationEvent.ACTOR_PERSON.equals(kind) && (userId != null || (login != null && !login.isBlank()));
        }
    }

    private final UserRepository users;
    private final OrgMemberDirectoryRepository directory;
    private final ApplicationEventRepository events;

    public ChangeActors(UserRepository users, OrgMemberDirectoryRepository directory, ApplicationEventRepository events) {
        this.users = users;
        this.directory = directory;
        this.events = events;
    }

    // ---- the words (shared with the organization side) -----------------------------------------------------

    /** The label of a person; {@code user} / {@code seat} may be null (no row). The one place these words are decided. */
    public static String label(User user, OrgMember seat, Context ctx) {
        if (seat != null && seat.getStatus() == OrgMemberStatus.ERASED) return FORMER_MEMBER;
        if (user == null) return ctx == Context.ORG ? FORMER_MEMBER : DELETED_ACCOUNT;
        String name = fullName(user);
        if (!name.isEmpty()) return name;
        if (seat != null && seat.getDisplayLabel() != null && !seat.getDisplayLabel().isBlank()) return seat.getDisplayLabel().strip();
        return isEnterprise(user) ? A_MEMBER : user.getLogin();
    }

    /** True for an enterprise account: a seat's own login, which is never shown to anyone. */
    public static boolean isEnterprise(User u) {
        return u != null && (!u.isPersonal() || isEnterpriseLogin(u.getLogin()));
    }

    public static boolean isEnterpriseLogin(String login) {
        return login != null && login.strip().toLowerCase(Locale.ROOT).startsWith(Constants.ENTERPRISE_LOGIN_PREFIX);
    }

    private static String fullName(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().strip();
        String last = u.getLastName() == null ? "" : u.getLastName().strip();
        return (first + " " + last).strip();
    }

    // ---- resolving ------------------------------------------------------------------------------------------

    /** Every ref resolved in one pass; non-person kinds resolve without a lookup. */
    @Transactional(readOnly = true)
    public Map<Ref, ChangeActorDTO> resolve(Collection<Ref> refs, Context ctx) {
        Map<Ref, ChangeActorDTO> out = new HashMap<>();
        Set<Long> ids = new HashSet<>();
        Set<String> logins = new HashSet<>();
        for (Ref r : refs) {
            if (r == null) continue;
            if (!r.resolvable()) {
                out.put(r, ChangeActorDTO.nonPerson(r.kind() == null ? ApplicationEvent.ACTOR_SYSTEM : r.kind()));
            } else if (r.userId() != null) {
                ids.add(r.userId());
            } else {
                logins.add(r.login());
            }
        }
        Map<Long, User> byId = new HashMap<>();
        Map<String, User> byLogin = new HashMap<>();
        if (!ids.isEmpty()) for (User u : users.findAllById(ids)) byId.put(u.getId(), u);
        if (!logins.isEmpty()) for (User u : users.findAllByLoginIn(logins)) byLogin.put(u.getLogin(), u);

        // Enterprise accounts without a name fall back to the seat's display_label: one query per organization.
        Map<Long, Set<Long>> needSeat = new HashMap<>();
        for (User u : new ArrayList<>(byId.values()) {{ addAll(byLogin.values()); }}) {
            if (isEnterprise(u) && fullName(u).isEmpty() && u.getOrgId() != null) needSeat.computeIfAbsent(u.getOrgId(), k -> new HashSet<>()).add(u.getId());
        }
        Map<Long, OrgMember> seatByUser = new HashMap<>();
        for (Map.Entry<Long, Set<Long>> e : needSeat.entrySet()) {
            for (OrgMember m : directory.findByOrgIdAndUserIdIn(e.getKey(), e.getValue())) if (m.getUserId() != null) seatByUser.put(m.getUserId(), m);
        }

        for (Ref r : refs) {
            if (r == null || !r.resolvable()) continue;
            User u = r.userId() != null ? byId.get(r.userId()) : byLogin.get(r.login());
            String label = label(u, u == null ? null : seatByUser.get(u.getId()), ctx);
            if (u == null && isEnterpriseLogin(r.login())) label = FORMER_MEMBER; // a deleted marketer is a former member, not a deleted account
            // An enterprise account's internal id is not for a personal viewer; only equality with the session matters, and it can never be theirs.
            Long shownId = u != null && isEnterprise(u) && ctx == Context.PERSONAL ? null : u != null ? u.getId() : r.userId();
            out.put(r, new ChangeActorDTO(shownId, null, label, null, ApplicationEvent.ACTOR_PERSON));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public ChangeActorDTO of(Ref ref, Context ctx) {
        if (ref == null) return null;
        return resolve(List.of(ref), ctx).get(ref);
    }

    // ---- the tracker's reads --------------------------------------------------------------------------------

    /**
     * Who last changed each application. A person is stamped on the head record; when the last writer was not a person (the extension, the inbox, the
     * assistant, the platform) the head carries no person, and the kind comes from the newest history row. Keyed by application id.
     */
    @Transactional(readOnly = true)
    public Map<Long, ChangeActorDTO> updatedBy(Collection<Application> apps) {
        Map<Long, Ref> refs = new HashMap<>();
        List<Long> needKind = new ArrayList<>();
        for (Application a : apps) {
            if (a.getUpdatedByUserId() != null || (a.getUpdatedByLogin() != null && !a.getUpdatedByLogin().isBlank())) {
                refs.put(a.getId(), Ref.person(a.getUpdatedByUserId(), a.getUpdatedByLogin()));
            } else {
                needKind.add(a.getId());
            }
        }
        if (!needKind.isEmpty()) {
            Map<Long, String> kinds = new HashMap<>();
            for (ApplicationEvent e : events.newestFor(needKind)) kinds.put(e.getApplicationId(), e.getActorKind());
            for (Long id : needKind) {
                String kind = kinds.getOrDefault(id, ApplicationEvent.ACTOR_SYSTEM);
                // A PERSON event whose head lost its person (cannot happen through the service) reads as the platform.
                refs.put(id, new Ref(ApplicationEvent.ACTOR_PERSON.equals(kind) ? ApplicationEvent.ACTOR_SYSTEM : kind, null, null));
            }
        }
        Map<Ref, ChangeActorDTO> resolved = resolve(new LinkedHashSet<>(refs.values()), Context.PERSONAL);
        Map<Long, ChangeActorDTO> out = new HashMap<>();
        refs.forEach((id, ref) -> out.put(id, resolved.get(ref)));
        return out;
    }

    /** Who added each application; a head without a person reads as the platform. */
    @Transactional(readOnly = true)
    public Map<Long, ChangeActorDTO> createdBy(Collection<Application> apps) {
        Map<Long, Ref> refs = new HashMap<>();
        for (Application a : apps) {
            boolean person = a.getCreatedByUserId() != null || (a.getCreatedByLogin() != null && !a.getCreatedByLogin().isBlank());
            refs.put(a.getId(), person ? Ref.person(a.getCreatedByUserId(), a.getCreatedByLogin()) : new Ref(ApplicationEvent.ACTOR_SYSTEM, null, null));
        }
        Map<Ref, ChangeActorDTO> resolved = resolve(new LinkedHashSet<>(refs.values()), Context.PERSONAL);
        Map<Long, ChangeActorDTO> out = new HashMap<>();
        refs.forEach((id, ref) -> out.put(id, resolved.get(ref)));
        return out;
    }

    /** History rows as DTOs, in the given order, every actor and on-behalf-of resolved in one pass. */
    @Transactional(readOnly = true)
    public List<EventDTO> events(List<ApplicationEvent> rows) {
        Set<Ref> refs = new LinkedHashSet<>();
        for (ApplicationEvent e : rows) {
            refs.add(actorRef(e));
            if (e.getOnBehalfOfUserId() != null) refs.add(Ref.person(e.getOnBehalfOfUserId(), null));
        }
        Map<Ref, ChangeActorDTO> resolved = resolve(refs, Context.PERSONAL);
        List<EventDTO> out = new ArrayList<>(rows.size());
        for (ApplicationEvent e : rows) {
            ChangeActorDTO behalf = e.getOnBehalfOfUserId() == null ? null : resolved.get(Ref.person(e.getOnBehalfOfUserId(), null));
            out.add(EventDTO.of(e, resolved.get(actorRef(e)), behalf, Changes.parse(e.getChanges())));
        }
        return out;
    }

    private static Ref actorRef(ApplicationEvent e) {
        return new Ref(e.getActorKind(), e.getActorUserId(), e.getActorLogin());
    }
}
