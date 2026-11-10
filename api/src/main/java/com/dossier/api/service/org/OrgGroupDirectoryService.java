package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.org.OrgGroupDTO;
import com.dossier.api.service.dto.org.OrgGroupViews;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of the Departments and Teams pages (X4.5): the directory with its KPI numbers, the organization structure, and a
 * group with its people. Only for organizations inside the Enterprise flag (anything else is the generic 404, like an organization
 * that does not exist). What the caller sees is what {@link OrgGroupAccess} lets them see, and the people in a group are filtered
 * through {@link ScopeEvaluator} for callers whose scope is narrower than the organization.
 *
 * <p>Every number is counted from the seats and groups: there is no open-roles figure and no workload or performance series
 * because no recruiting or workload data exists yet, so they are not here at all rather than made up.
 */
@Service
public class OrgGroupDirectoryService {

    static final int PAGE_MAX = 100;
    static final int MEMBERS_CAP = 200;

    private final OrgGroupSnapshot snapshot;
    private final OrgGroupAccess access;
    private final ScopeEvaluator scopes;
    private final OrganizationRepository orgs;

    public OrgGroupDirectoryService(OrgGroupSnapshot snapshot, OrgGroupAccess access, ScopeEvaluator scopes, OrganizationRepository orgs) {
        this.snapshot = snapshot;
        this.access = access;
        this.scopes = scopes;
        this.orgs = orgs;
    }

    /** Filters of the directory; every one optional. */
    public record Query(OrgGroupKind kind, Long departmentId, String status, String q, String sort, boolean desc, int page, int size) {}

    @Transactional(readOnly = true)
    public OrgGroupViews.DirectoryPage directory(OrgMembership me, Query query) {
        OrgGroupSnapshot.View view = gate(me);
        Set<Long> vis = access.visible(me, view);
        List<OrgGroup> visible = view.groups().stream().filter(g -> vis == null || vis.contains(g.getId())).toList();
        OrgGroupViews.Summary summary = summarise(me, view, visible, vis == null);

        List<OrgGroupDTO> cards = view.cards(visible);
        String q = query.q() == null ? "" : query.q().strip().toLowerCase(Locale.ROOT);
        List<OrgGroupDTO> rows = new ArrayList<>();
        for (OrgGroupDTO c : cards) {
            if (query.kind() != null && c.kind() != query.kind()) continue;
            if (query.departmentId() != null && !query.departmentId().equals(c.parentGroupId())) continue;
            if (query.status() != null && !query.status().isBlank() && !query.status().equalsIgnoreCase(c.status())) continue;
            if (!q.isEmpty() && !c.name().toLowerCase(Locale.ROOT).contains(q) && !(c.lead() != null && c.lead().name().toLowerCase(Locale.ROOT).contains(q))) continue;
            rows.add(c);
        }
        rows.sort(comparator(query.sort(), query.desc()));
        int size = Math.max(1, Math.min(PAGE_MAX, query.size() <= 0 ? 10 : query.size()));
        int page = Math.max(0, query.page());
        int from = Math.min(rows.size(), page * size);
        int to = Math.min(rows.size(), from + size);
        return new OrgGroupViews.DirectoryPage(List.copyOf(rows.subList(from, to)), page, size, rows.size(), summary);
    }

    @Transactional(readOnly = true)
    public OrgGroupViews.Structure structure(OrgMembership me) {
        OrgGroupSnapshot.View view = gate(me);
        Set<Long> vis = access.visible(me, view);
        List<OrgGroup> visible = view.groups().stream().filter(g -> vis == null || vis.contains(g.getId())).toList();
        List<OrgGroupDTO> cards = view.cards(visible);
        List<OrgGroupViews.Node> departments = new ArrayList<>();
        List<OrgGroupDTO> unassigned = new ArrayList<>();
        List<OrgGroupDTO> cohorts = new ArrayList<>();
        for (OrgGroupDTO c : cards) {
            if (c.kind() == OrgGroupKind.DEPARTMENT) {
                departments.add(new OrgGroupViews.Node(c, cards.stream().filter(t -> t.kind() == OrgGroupKind.TEAM && c.id().equals(t.parentGroupId())).toList()));
            } else if (c.kind() == OrgGroupKind.TEAM && c.parentGroupId() == null) {
                unassigned.add(c);
            } else if (c.kind() == OrgGroupKind.COHORT) {
                cohorts.add(c);
            }
        }
        // a team under a department the viewer cannot see still belongs in the tree of what they can see
        for (OrgGroupDTO c : cards) {
            if (c.kind() == OrgGroupKind.TEAM && c.parentGroupId() != null && departments.stream().noneMatch(n -> n.group().id().equals(c.parentGroupId()))) unassigned.add(c);
        }
        String orgName = orgs.findByOrgId(me.orgId()).map(o -> o.getDisplayName() != null && !o.getDisplayName().isBlank() ? o.getDisplayName() : o.getName()).orElse("Organization");
        long employees = vis == null
            ? view.seats().stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).count()
            : visiblePeople(view, visible).size();
        return new OrgGroupViews.Structure(orgName, employees, departments, unassigned, cohorts);
    }

    @Transactional(readOnly = true)
    public OrgGroupViews.Detail detail(OrgMembership me, Long groupId) {
        OrgGroupSnapshot.View view = gate(me);
        OrgGroup g = groupId == null ? null : view.group(groupId);
        if (g == null || !access.canSee(me, view, g)) throw new OrgNotFoundException();
        List<OrgGroupSnapshot.Seat> seats = view.seatsIn(g);
        PermissionScope scope = access.readScope(me).orElse(PermissionScope.OWN);
        if (scope != PermissionScope.ORG) {
            seats = seats.stream().filter(s -> scopes.inScope(me, scope, s.id())).toList();
        }
        List<OrgGroupSnapshot.Seat> sorted = new ArrayList<>(seats);
        sorted.sort(Comparator.comparing((OrgGroupSnapshot.Seat s) -> !s.id().equals(g.getLeadMemberId())).thenComparing(OrgGroupSnapshot.Seat::id));
        seats = sorted;
        List<OrgGroupSnapshot.Seat> shown = seats.size() > MEMBERS_CAP ? seats.subList(0, MEMBERS_CAP) : seats;
        view.preload(shown.stream().map(OrgGroupSnapshot.Seat::id).toList());
        List<OrgGroupViews.MemberRow> rows = new ArrayList<>();
        for (OrgGroupSnapshot.Seat s : shown) {
            OrgGroupDTO.Person p = view.person(s.id());
            OrgGroup dept = view.group(s.departmentId());
            OrgGroup team = view.group(s.teamId());
            rows.add(
                new OrgGroupViews.MemberRow(
                    s.id(), p == null ? "Member" : p.name(), p == null ? "?" : p.initials(), s.status().name(), p == null ? null : p.roleName(),
                    s.id().equals(g.getLeadMemberId()), dept == null ? null : dept.getName(), team == null ? null : team.getName()
                )
            );
        }
        List<OrgGroup> teamGroups = g.getKind() == OrgGroupKind.DEPARTMENT ? view.teamsUnder(g.getId()) : List.of();
        Set<Long> vis = access.visible(me, view);
        teamGroups = teamGroups.stream().filter(t -> vis == null || vis.contains(t.getId())).toList();
        return new OrgGroupViews.Detail(view.card(g), view.cards(teamGroups), rows, seats.size());
    }

    /** The people a picker can offer (ACTIVE seats, narrowed by the caller's scope, searched by name, at most 50). */
    @Transactional(readOnly = true)
    public List<OrgGroupViews.PersonOption> people(OrgMembership me, String q, int limit) {
        OrgGroupSnapshot.View view = gate(me);
        PermissionScope scope = access.readScope(me).orElse(PermissionScope.OWN);
        List<OrgGroupSnapshot.Seat> seats = view.seats().stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).filter(s -> scope == PermissionScope.ORG || scopes.inScope(me, scope, s.id())).toList();
        view.preload(seats.stream().map(OrgGroupSnapshot.Seat::id).toList());
        String needle = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        List<OrgGroupViews.PersonOption> out = new ArrayList<>();
        for (OrgGroupSnapshot.Seat s : seats) {
            OrgGroupDTO.Person p = view.person(s.id());
            if (p == null || (!needle.isEmpty() && !p.name().toLowerCase(Locale.ROOT).contains(needle))) continue;
            OrgGroup dept = view.group(s.departmentId());
            OrgGroup team = view.group(s.teamId());
            out.add(new OrgGroupViews.PersonOption(s.id(), p.name(), p.initials(), p.roleName(), dept == null ? null : dept.getName(), team == null ? null : team.getName()));
        }
        out.sort(Comparator.comparing((OrgGroupViews.PersonOption o) -> o.name().toLowerCase(Locale.ROOT)).thenComparing(OrgGroupViews.PersonOption::memberId));
        int max = Math.max(1, Math.min(50, limit <= 0 ? 20 : limit));
        return out.size() > max ? List.copyOf(out.subList(0, max)) : out;
    }

    // ---- helpers ------------------------------------------------------------------------------------------------

    private OrgGroupSnapshot.View gate(OrgMembership me) {
        if (!access.enterprise(me.orgId()) || access.readScope(me).isEmpty()) throw new OrgNotFoundException();
        return snapshot.load(me.orgId());
    }

    private Set<Long> visiblePeople(OrgGroupSnapshot.View view, List<OrgGroup> visible) {
        Set<Long> out = new HashSet<>();
        for (OrgGroup g : visible) {
            if (g.getKind() == OrgGroupKind.COHORT) continue;
            for (OrgGroupSnapshot.Seat s : view.seatsIn(g)) if (s.status() == OrgMemberStatus.ACTIVE) out.add(s.id());
        }
        return out;
    }

    private OrgGroupViews.Summary summarise(OrgMembership me, OrgGroupSnapshot.View view, List<OrgGroup> visible, boolean everything) {
        long departments = 0;
        long teams = 0;
        long inactive = 0;
        long teamActiveSum = 0;
        Set<Long> deptLeads = new HashSet<>();
        Set<Long> teamLeads = new HashSet<>();
        Set<Long> inTeams = new HashSet<>();
        for (OrgGroup g : visible) {
            boolean active = "ACTIVE".equals(g.getStatus());
            if (g.getKind() == OrgGroupKind.DEPARTMENT) {
                if (active) {
                    departments++;
                    if (g.getLeadMemberId() != null) deptLeads.add(g.getLeadMemberId());
                } else inactive++;
            } else if (g.getKind() == OrgGroupKind.TEAM) {
                if (active) {
                    teams++;
                    if (g.getLeadMemberId() != null) teamLeads.add(g.getLeadMemberId());
                    long a = view.seatsIn(g).stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).count();
                    teamActiveSum += a;
                    view.seatsIn(g).stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).forEach(s -> inTeams.add(s.id()));
                } else inactive++;
            }
        }
        Set<Long> people = everything
            ? new HashSet<>(view.seats().stream().filter(s -> s.status() == OrgMemberStatus.ACTIVE).map(OrgGroupSnapshot.Seat::id).toList())
            : visiblePeople(view, visible);
        long unplaced = people.stream().filter(id -> view.seat(id) != null && view.seat(id).departmentId() == null).count();
        Double avg = teams == 0 ? null : Math.round(teamActiveSum * 10.0 / teams) / 10.0;
        return new OrgGroupViews.Summary(departments, teams, people.size(), inTeams.size(), unplaced, deptLeads.size(), teamLeads.size(), avg, inactive);
    }

    private static Comparator<OrgGroupDTO> comparator(String sort, boolean desc) {
        String key = sort == null ? "name" : sort.toLowerCase(Locale.ROOT);
        Comparator<OrgGroupDTO> byName = Comparator.comparing((OrgGroupDTO g) -> g.name().toLowerCase(Locale.ROOT)).thenComparing(OrgGroupDTO::id);
        Comparator<OrgGroupDTO> c = switch (key) {
            case "members", "employees" -> Comparator.comparingLong(OrgGroupDTO::activeCount).thenComparing(byName);
            case "created" -> Comparator.comparing(OrgGroupDTO::createdAt).thenComparing(byName);
            case "lead" -> Comparator.comparing((OrgGroupDTO g) -> g.lead() == null ? "￿" : g.lead().name().toLowerCase(Locale.ROOT)).thenComparing(byName);
            case "department" -> Comparator.comparing((OrgGroupDTO g) -> g.parentName() == null ? "￿" : g.parentName().toLowerCase(Locale.ROOT)).thenComparing(byName);
            default -> byName;
        };
        return desc ? c.reversed() : c;
    }
}
