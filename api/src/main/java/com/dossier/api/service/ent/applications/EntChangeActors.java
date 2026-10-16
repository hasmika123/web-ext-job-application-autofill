package com.dossier.api.service.ent.applications;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.EntChangeActorRepository;
import com.dossier.api.service.dto.ChangeActorDTO;
import com.dossier.api.service.tracker.ChangeActors;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns the member ids stored on an organization record's history ({@code actor_member_id}, {@code updated_by_member_id}) into {@link ChangeActorDTO}s
 * (docs/change-audit/README.md section 2.5): the SAME words as the personal tracker ({@link ChangeActors#label}: name, seat label, "a member" for an
 * enterprise login, "a former member" for an erased seat) plus the RELATION to the consultant the record is about, computed in one batch per page:
 *
 * <ol>
 *   <li>the record's own consultant seat: {@code consultant};</li>
 *   <li>the consultant's marketer (the record's marketer, an active marketer assignment, an effective org assignment): {@code marketer};</li>
 *   <li>an OWNER or ADMIN seat: {@code admin};</li>
 *   <li>any other seat: {@code member}; SYSTEM (the linker, a seed): {@code system}.</li>
 * </ol>
 * The five words are fixed (D6): roles are data and rename, the tag must not. A member id that is not a seat of THIS organization yields "a member"
 * and never a name; its id is not echoed.
 */
@Component
public class EntChangeActors {

    /** The record a change is about: its consultant profile, and the marketer stored on the record itself (null when it has none). */
    public record Subject(Long consultantProfileId, Long recordMarketerMemberId) {}

    private final EntChangeActorRepository repo;
    private final UserRepository users;
    private final Clock clock;

    @Autowired
    public EntChangeActors(EntChangeActorRepository repo, UserRepository users) {
        this(repo, users, Clock.systemUTC());
    }

    EntChangeActors(EntChangeActorRepository repo, UserRepository users, Clock clock) {
        this.repo = repo;
        this.users = users;
        this.clock = clock;
    }

    /** What one page needs, loaded in four queries whatever its size. */
    public static final class Lookup {

        private final Map<Long, OrgMember> seats;
        private final Map<Long, User> accounts;
        private final Map<Long, Long> consultantSeat; // consultant profile id -> its seat (null value: no seat)
        private final Map<Long, Set<Long>> marketers; // consultant profile id -> marketer seat ids (assignments)

        Lookup(Map<Long, OrgMember> seats, Map<Long, User> accounts, Map<Long, Long> consultantSeat, Map<Long, Set<Long>> marketers) {
            this.seats = seats;
            this.accounts = accounts;
            this.consultantSeat = consultantSeat;
            this.marketers = marketers;
        }

        /** The actor of one change on a record about {@code subject}; {@code kind} PERSON | SYSTEM (null reads as PERSON when there is a member id). */
        public ChangeActorDTO of(Long actorMemberId, String kind, Subject subject) {
            if (actorMemberId == null || "SYSTEM".equals(kind)) return new ChangeActorDTO(null, null, ChangeActorDTO.KIWIPLY, ChangeActorDTO.REL_SYSTEM, "SYSTEM");
            OrgMember seat = seats.get(actorMemberId);
            if (seat == null) return new ChangeActorDTO(null, null, ChangeActors.A_MEMBER, ChangeActorDTO.REL_MEMBER, "PERSON");
            User account = seat.getUserId() == null ? null : accounts.get(seat.getUserId());
            String label = ChangeActors.label(account, seat, ChangeActors.Context.ORG);
            Long consultantMember = subject == null ? null : consultantSeat.get(subject.consultantProfileId());
            Set<Long> assigned = new HashSet<>();
            if (subject != null) {
                if (subject.recordMarketerMemberId() != null) assigned.add(subject.recordMarketerMemberId());
                assigned.addAll(marketers.getOrDefault(subject.consultantProfileId(), Set.of()));
            }
            String relation = relationOf(actorMemberId, seat.getRole(), consultantMember, assigned);
            return new ChangeActorDTO(null, actorMemberId, label, relation, "PERSON");
        }
    }

    /**
     * The relation word (D6: five fixed words), in the order the design states: the record's own consultant first, then its assigned marketer,
     * then OWNER / ADMIN, else member.
     */
    public static String relationOf(Long actorMemberId, OrgRole role, Long consultantMemberId, Set<Long> assignedMarketers) {
        if (actorMemberId != null && actorMemberId.equals(consultantMemberId)) return ChangeActorDTO.REL_CONSULTANT;
        if (actorMemberId != null && assignedMarketers != null && assignedMarketers.contains(actorMemberId)) return ChangeActorDTO.REL_MARKETER;
        if (role == OrgRole.OWNER || role == OrgRole.ADMIN) return ChangeActorDTO.REL_ADMIN;
        return ChangeActorDTO.REL_MEMBER;
    }

    /** Loads everything for {@code actorMemberIds} acting on records about {@code subjects}; ids of another organization are simply not found. */
    @Transactional(readOnly = true)
    public Lookup load(Long orgId, Collection<Long> actorMemberIds, Collection<Subject> subjects) {
        Set<Long> ids = new HashSet<>();
        for (Long id : actorMemberIds) if (id != null) ids.add(id);
        Set<Long> consultants = new HashSet<>();
        for (Subject s : subjects) if (s != null && s.consultantProfileId() != null) consultants.add(s.consultantProfileId());

        Map<Long, Long> consultantSeat = new HashMap<>();
        Set<Long> consultantSeatIds = new HashSet<>();
        if (!consultants.isEmpty()) {
            for (Object[] r : repo.consultantSeats(orgId, consultants)) {
                Long seat = (Long) r[1];
                consultantSeat.put((Long) r[0], seat);
                if (seat != null) consultantSeatIds.add(seat);
            }
        }
        Map<Long, Set<Long>> marketers = new HashMap<>();
        if (!consultants.isEmpty()) {
            for (Object[] r : repo.marketerAssignments(orgId, consultants)) {
                Set<Long> m = marketers.computeIfAbsent((Long) r[0], k -> new HashSet<>());
                if (r[1] != null) m.add((Long) r[1]);
                if (r[2] != null) m.add((Long) r[2]);
            }
        }
        if (!consultantSeatIds.isEmpty()) {
            Map<Long, Long> profileBySeat = new HashMap<>();
            consultantSeat.forEach((profile, seat) -> {
                if (seat != null) profileBySeat.put(seat, profile);
            });
            for (Object[] r : repo.effectiveAssignees(orgId, consultantSeatIds, AssignmentKind.ACTING, Instant.now(clock))) {
                Long profile = profileBySeat.get((Long) r[0]);
                if (profile != null && r[1] != null) marketers.computeIfAbsent(profile, k -> new HashSet<>()).add((Long) r[1]);
            }
        }

        Map<Long, OrgMember> seats = new HashMap<>();
        Set<Long> userIds = new HashSet<>();
        if (!ids.isEmpty()) {
            for (OrgMember m : repo.seats(orgId, ids)) {
                seats.put(m.getId(), m);
                if (m.getUserId() != null) userIds.add(m.getUserId());
            }
        }
        Map<Long, User> accounts = new HashMap<>();
        if (!userIds.isEmpty()) for (User u : users.findAllById(userIds)) accounts.put(u.getId(), u);
        return new Lookup(seats, accounts, consultantSeat, marketers);
    }
}
