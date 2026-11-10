package com.dossier.api.service.org;

import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgGroupPlacementRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.org.OrgGroupDTO;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * One consistent picture of an organization's groups and who sits in them (X4.5), read once per request. A member's TEAM is
 * {@code team_group_id} (or a legacy {@code group_id} that is a TEAM), their DEPARTMENT is {@code department_group_id}, else the
 * department their team sits under, else a legacy {@code group_id} that is a DEPARTMENT, and their COHORT is a legacy
 * {@code group_id} that is a COHORT. The counts below are those placements, nothing else: a lead is not counted as a member.
 *
 * <p>Everything is organization-scoped: the factory names the organization and every query it runs does too.
 */
@Component
public class OrgGroupSnapshot {

    /** One live seat as the pages need it. */
    public record Seat(Long id, OrgMemberStatus status, Long userId, Long primaryRoleId, String inviteName, Long teamId, Long departmentId, Long cohortId) {}

    private final OrgGroupRepository groups;
    private final OrgGroupPlacementRepository placements;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgRoleRepository roles;

    public OrgGroupSnapshot(OrgGroupRepository groups, OrgGroupPlacementRepository placements, OrgMemberRepository members, UserRepository users, OrgRoleRepository roles) {
        this.groups = groups;
        this.placements = placements;
        this.members = members;
        this.users = users;
        this.roles = roles;
    }

    /** Reads the organization's groups and live seats. */
    public View load(Long orgId) {
        Map<Long, OrgGroup> byId = new LinkedHashMap<>();
        for (OrgGroup g : groups.findByOrgIdOrderBySortOrderAscNameAsc(orgId)) byId.put(g.getId(), g);
        Map<Long, Seat> seats = new LinkedHashMap<>();
        for (Object[] r : placements.placements(orgId, OrgMemberStatus.LIVE)) {
            Long groupId = (Long) r[2];
            Long dept = (Long) r[3];
            Long team = (Long) r[4];
            Long cohort = null;
            OrgGroup legacy = groupId == null ? null : byId.get(groupId);
            if (team == null && legacy != null && legacy.getKind() == OrgGroupKind.TEAM) team = groupId;
            if (dept == null && team != null && byId.containsKey(team)) dept = byId.get(team).getParentGroupId();
            if (dept == null && legacy != null && legacy.getKind() == OrgGroupKind.DEPARTMENT) dept = groupId;
            if (legacy != null && legacy.getKind() == OrgGroupKind.COHORT) cohort = groupId;
            Long id = (Long) r[0];
            seats.put(id, new Seat(id, (OrgMemberStatus) r[1], (Long) r[5], (Long) r[6], (String) r[7], team, dept, cohort));
        }
        return new View(orgId, byId, seats);
    }

    /** The loaded picture plus lazily resolved people. */
    public final class View {

        private final Long orgId;
        private final Map<Long, OrgGroup> groupsById;
        private final Map<Long, Seat> seats;
        private final Map<Long, OrgGroupDTO.Person> people = new HashMap<>();
        private final Map<Long, Seat> extraSeats = new HashMap<>();

        View(Long orgId, Map<Long, OrgGroup> groupsById, Map<Long, Seat> seats) {
            this.orgId = orgId;
            this.groupsById = groupsById;
            this.seats = seats;
        }

        public Long orgId() {
            return orgId;
        }

        public Collection<OrgGroup> groups() {
            return groupsById.values();
        }

        public OrgGroup group(Long id) {
            return id == null ? null : groupsById.get(id);
        }

        public Collection<Seat> seats() {
            return seats.values();
        }

        public Seat seat(Long memberId) {
            return seats.get(memberId);
        }

        /** The seats placed in this group (TEAM by team, DEPARTMENT by department, COHORT by cohort). */
        public List<Seat> seatsIn(OrgGroup g) {
            List<Seat> out = new ArrayList<>();
            for (Seat s : seats.values()) if (placedIn(s, g)) out.add(s);
            return out;
        }

        public boolean placedIn(Seat s, OrgGroup g) {
            return switch (g.getKind()) {
                case TEAM -> g.getId().equals(s.teamId());
                case DEPARTMENT -> g.getId().equals(s.departmentId());
                case COHORT -> g.getId().equals(s.cohortId());
            };
        }

        public List<OrgGroup> teamsUnder(Long departmentId) {
            List<OrgGroup> out = new ArrayList<>();
            for (OrgGroup g : groupsById.values()) if (g.getKind() == OrgGroupKind.TEAM && departmentId != null && departmentId.equals(g.getParentGroupId())) out.add(g);
            return out;
        }

        /** The groups of which {@code memberId} is a lead. */
        public List<OrgGroup> ledBy(Long memberId) {
            List<OrgGroup> out = new ArrayList<>();
            for (OrgGroup g : groupsById.values()) if (memberId != null && memberId.equals(g.getLeadMemberId())) out.add(g);
            return out;
        }

        // ---- people ---------------------------------------------------------------------------------------------

        /** Names the people with these seat ids in one batch (any status); unknown ids are simply absent from later lookups. */
        public void preload(Collection<Long> memberIds) {
            Set<Long> need = new LinkedHashSet<>();
            for (Long id : memberIds) if (id != null && !people.containsKey(id)) need.add(id);
            if (need.isEmpty()) return;
            Map<Long, Seat> seatOf = new HashMap<>();
            List<Long> missing = new ArrayList<>();
            for (Long id : need) {
                Seat s = seats.get(id);
                if (s != null) seatOf.put(id, s);
                else missing.add(id);
            }
            if (!missing.isEmpty()) {
                for (OrgMember m : members.findByOrgIdAndIdIn(orgId, missing)) {
                    Seat s = new Seat(m.getId(), m.getStatus(), m.getUserId(), m.getPrimaryRoleId(), m.getInviteName(), null, null, null);
                    extraSeats.put(m.getId(), s);
                    seatOf.put(m.getId(), s);
                }
            }
            Set<Long> userIds = new HashSet<>();
            Set<Long> roleIds = new HashSet<>();
            for (Seat s : seatOf.values()) {
                if (s.userId() != null) userIds.add(s.userId());
                if (s.primaryRoleId() != null) roleIds.add(s.primaryRoleId());
            }
            Map<Long, String> names = new HashMap<>();
            if (!userIds.isEmpty()) {
                users.findAllById(userIds).forEach(u -> names.put(u.getId(), displayName(u.getFirstName(), u.getLastName(), u.getLogin())));
            }
            Map<Long, String> roleNames = new HashMap<>();
            if (!roleIds.isEmpty()) {
                for (OrgRoleDefinition d : roles.findVisibleByOrgIdAndIdIn(orgId, roleIds)) roleNames.put(d.getId(), d.getName());
            }
            for (Seat s : seatOf.values()) {
                String name = s.userId() != null ? names.getOrDefault(s.userId(), "Member") : (s.inviteName() != null && !s.inviteName().isBlank() ? s.inviteName() : "Invited person");
                people.put(s.id(), new OrgGroupDTO.Person(s.id(), name, initials(name), s.primaryRoleId() == null ? null : roleNames.get(s.primaryRoleId())));
            }
        }

        public OrgGroupDTO.Person person(Long memberId) {
            if (memberId == null) return null;
            preload(List.of(memberId));
            return people.get(memberId);
        }

        // ---- cards ----------------------------------------------------------------------------------------------

        /** The card of one group (one batch of name lookups per call; use {@link #cards} for many). */
        public OrgGroupDTO card(OrgGroup g) {
            return cards(List.of(g)).get(0);
        }

        /** Cards for these groups, in order, with leads and the four-person avatar preview. */
        public List<OrgGroupDTO> cards(Collection<OrgGroup> gs) {
            Map<Long, List<Seat>> placed = new HashMap<>();
            Set<Long> toName = new LinkedHashSet<>();
            for (OrgGroup g : gs) {
                List<Seat> in = seatsIn(g);
                placed.put(g.getId(), in);
                if (g.getLeadMemberId() != null) toName.add(g.getLeadMemberId());
                in.stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).limit(4).forEach(s -> toName.add(s.id()));
            }
            preload(toName);
            List<OrgGroupDTO> out = new ArrayList<>();
            for (OrgGroup g : gs) {
                List<Seat> in = placed.get(g.getId());
                long active = in.stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).count();
                List<OrgGroupDTO.Person> preview = in.stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).limit(4).map(s -> people.get(s.id())).filter(p -> p != null).toList();
                OrgGroup parent = group(g.getParentGroupId());
                Integer teamCount = g.getKind() == OrgGroupKind.DEPARTMENT ? teamsUnder(g.getId()).size() : null;
                out.add(
                    new OrgGroupDTO(
                        g.getId(), g.getName(), g.getKind(), g.getSortOrder(), in.size(), g.getParentGroupId(), parent == null ? null : parent.getName(),
                        g.getLeadMemberId(), g.getLeadMemberId() == null ? null : people.get(g.getLeadMemberId()), g.getStatus(), g.getIcon(), g.getColor(),
                        etag(g), g.getCreatedAt(), active, teamCount, preview
                    )
                );
            }
            return out;
        }
    }

    public static String etag(OrgGroup g) {
        return "W/\"" + g.getVersion() + "\"";
    }

    static String displayName(String first, String last, String login) {
        String name = ((first == null ? "" : first.strip()) + " " + (last == null ? "" : last.strip())).strip();
        return name.isEmpty() ? (login == null ? "Member" : login) : name;
    }

    static String initials(String name) {
        String[] parts = name == null ? new String[0] : name.strip().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p.isEmpty()) continue;
            sb.append(p.substring(0, p.offsetByCodePoints(0, 1)).toUpperCase(Locale.ROOT));
            if (sb.length() >= 2) break;
        }
        return sb.length() == 0 ? "?" : sb.toString();
    }

    /** Sort helper shared by the directory: by created, name, etc. is done in the service; this is the stable name order. */
    static final Comparator<OrgGroupDTO> BY_NAME = Comparator.comparing(g -> g.name().toLowerCase(Locale.ROOT));
}
