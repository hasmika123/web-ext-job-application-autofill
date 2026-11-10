package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.enumeration.InviteStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgInvitationQueryRepository;
import com.dossier.api.repository.ent.OrgInvitationQueryRepository.EventKind;
import com.dossier.api.repository.ent.OrgInvitationQueryRepository.Filter;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.org.InvitationDTO;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Everything the Invitations page reads and its bulk actions (X1.15; design/enterprise-admin/invitations.png): the filtered, paged list,
 * the Pending / Accepted / Expired / Revoked counters with their last-month change, the recent-activity feed, and bulk resend and revoke
 * with one result per row. Creating, re-sending and revoking one invitation is {@link OrgInviteService}.
 *
 * <p>Reads are for the whole organization except for a caller whose {@code members.invite} right is narrowed to members (staff): they
 * see only the invitations they sent. The token, its hash and the invite link are never in any of it. Every query names the organization.
 */
@Service
public class OrgInvitationService {

    static final int MAX_PAGE_SIZE = 100;
    static final int MAX_BULK = 100;

    private final OrgInvitationQueryRepository queries;
    private final OrgMemberRepository members;
    private final OrgMemberRoleRepository memberRoles;
    private final OrgRoleRepository roles;
    private final OrgGroupRepository groups;
    private final UserRepository users;
    private final OrgInviteService inviteService;

    public OrgInvitationService(
        OrgInvitationQueryRepository queries,
        OrgMemberRepository members,
        OrgMemberRoleRepository memberRoles,
        OrgRoleRepository roles,
        OrgGroupRepository groups,
        UserRepository users,
        OrgInviteService inviteService
    ) {
        this.queries = queries;
        this.members = members;
        this.memberRoles = memberRoles;
        this.roles = roles;
        this.groups = groups;
        this.users = users;
        this.inviteService = inviteService;
    }

    // ---- list -------------------------------------------------------------------------------------------------------

    /** One page of invitations, newest first unless {@code newestFirst} is false. {@code to} is exclusive. */
    @Transactional(readOnly = true)
    public InvitationDTO.InvitationPage list(
        OrgMembership me,
        InviteStatus status,
        Long roleId,
        Long departmentGroupId,
        Instant from,
        Instant to,
        String search,
        int page,
        int size,
        boolean newestFirst
    ) {
        int safeSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
        int safePage = Math.max(0, page);
        Instant now = Instant.now();
        String q = search == null ? null : search.length() > 100 ? search.substring(0, 100) : search;
        Filter f = new Filter(status, roleId, departmentGroupId, from, to, q, narrowedTo(me));
        List<OrgMember> rows = queries.findPage(me.orgId(), f, now, safePage, safeSize, newestFirst);
        return new InvitationDTO.InvitationPage(toDtos(me.orgId(), rows, now), safePage, safeSize, queries.count(me.orgId(), f, now));
    }

    // ---- counts -----------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public InvitationDTO.InvitationCounts counts(OrgMembership me) {
        Instant now = Instant.now();
        Instant monthAgo = now.minus(Duration.ofDays(30));
        Instant twoMonthsAgo = now.minus(Duration.ofDays(60));
        Instant future = now.plusSeconds(1); // "to" is exclusive and an invite sent this very second counts
        Long narrowed = narrowedTo(me);
        List<InvitationDTO.InvitationStatusCount> out = new ArrayList<>();
        long total = 0;
        for (InviteStatus s : InviteStatus.values()) {
            Filter all = new Filter(s, null, null, null, null, null, narrowed);
            long count = queries.count(me.orgId(), all, now);
            long recent = queries.count(me.orgId(), all.withRange(monthAgo, future), now);
            long before = queries.count(me.orgId(), all.withRange(twoMonthsAgo, monthAgo), now);
            out.add(new InvitationDTO.InvitationStatusCount(s, count, recent - before));
            total += count;
        }
        return new InvitationDTO.InvitationCounts(out, total);
    }

    // ---- activity ---------------------------------------------------------------------------------------------------

    /** The latest events across all four kinds, newest first: invited, accepted, revoked, expired. */
    @Transactional(readOnly = true)
    public List<InvitationDTO.InvitationActivity> activity(OrgMembership me, int limit) {
        int n = Math.max(1, Math.min(limit, 50));
        Long narrowed = narrowedTo(me);
        record Event(String kind, Instant at, OrgMember seat) {}
        List<Event> events = new ArrayList<>();
        for (EventKind kind : EventKind.values()) {
            for (OrgMember m : queries.recentBy(me.orgId(), kind, n)) {
                if (narrowed != null && !Objects.equals(narrowed, m.getInvitedByMemberId())) continue;
                Instant at = switch (kind) {
                    case INVITED -> m.getInviteSentAt();
                    case ACCEPTED -> m.getJoinedAt();
                    default -> m.getInviteEndedAt();
                };
                if (at != null) events.add(new Event(kind.name(), at, m));
            }
        }
        events.sort(Comparator.comparing(Event::at).reversed());
        List<Event> top = events.stream().limit(n).toList();
        Map<Long, String> names = namesOf(me.orgId(), top.stream().map(e -> e.seat().getInvitedByMemberId()).filter(Objects::nonNull).collect(Collectors.toSet()));
        List<InvitationDTO.InvitationActivity> out = new ArrayList<>();
        for (Event e : top) {
            Long by = e.seat().getInvitedByMemberId();
            out.add(new InvitationDTO.InvitationActivity(e.kind(), e.at(), e.seat().getId(), e.seat().getInviteEmail(), e.seat().getInviteName(), by == null ? null : new InvitationDTO.InvitationPersonRef(by, names.get(by))));
        }
        return out;
    }

    // ---- bulk -------------------------------------------------------------------------------------------------------

    /** Re-sends each invitation; one that cannot be (not pending, over the weekly limit, not yours) fails alone and the rest go on. */
    @Transactional
    public InvitationDTO.InvitationBulkResult bulkResend(OrgMembership me, List<Long> ids) {
        List<Long> distinct = distinctIds(ids);
        List<InvitationDTO.InvitationBulkItem> results = new ArrayList<>();
        List<Runnable> sends = new ArrayList<>();
        for (Long id : distinct) {
            try {
                OrgInviteService.Resent r = inviteService.resendOne(me, id);
                sends.add(r.send());
                results.add(new InvitationDTO.InvitationBulkItem(id, "OK", null));
            } catch (OrgNotFoundException e) {
                results.add(new InvitationDTO.InvitationBulkItem(id, "FAILED", "NOT_FOUND"));
            } catch (OrgException e) {
                results.add(new InvitationDTO.InvitationBulkItem(id, "FAILED", e.getCode()));
            }
        }
        OrgInviteService.afterCommit(() -> sends.forEach(Runnable::run));
        return new InvitationDTO.InvitationBulkResult(results);
    }

    @Transactional
    public InvitationDTO.InvitationBulkResult bulkRevoke(OrgMembership me, List<Long> ids) {
        List<InvitationDTO.InvitationBulkItem> results = new ArrayList<>();
        for (Long id : distinctIds(ids)) {
            try {
                inviteService.revokeOne(me, id);
                results.add(new InvitationDTO.InvitationBulkItem(id, "OK", null));
            } catch (OrgNotFoundException e) {
                results.add(new InvitationDTO.InvitationBulkItem(id, "FAILED", "NOT_FOUND"));
            } catch (OrgException e) {
                results.add(new InvitationDTO.InvitationBulkItem(id, "FAILED", e.getCode()));
            }
        }
        return new InvitationDTO.InvitationBulkResult(results);
    }

    private static List<Long> distinctIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw OrgException.invalid("ids", "must name at least one invitation");
        List<Long> distinct = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (distinct.size() > MAX_BULK) throw OrgException.limitReached("inviteBulk", MAX_BULK);
        return distinct;
    }

    // ---- mapping ----------------------------------------------------------------------------------------------------

    /** A caller whose invite right is narrowed to members (staff) sees their own invitations only; everyone else sees the organization's. */
    private static Long narrowedTo(OrgMembership me) {
        return me.scopeOf(OrgPermission.MEMBERS_INVITE).filter(s -> s == OrgScope.MEMBER_ROLE_ONLY).isPresent() ? me.memberId() : null;
    }

    private List<InvitationDTO> toDtos(Long orgId, List<OrgMember> rows, Instant now) {
        if (rows.isEmpty()) return List.of();
        List<Long> seatIds = rows.stream().map(OrgMember::getId).toList();
        Map<Long, List<OrgMemberRole>> rolesBySeat = new LinkedHashMap<>();
        for (OrgMemberRole r : memberRoles.findLiveByOrgIdAndMemberIds(orgId, seatIds)) rolesBySeat.computeIfAbsent(r.getMemberId(), k -> new ArrayList<>()).add(r);
        Set<Long> roleIds = rolesBySeat.values().stream().flatMap(List::stream).map(OrgMemberRole::getRoleId).collect(Collectors.toSet());
        Map<Long, OrgRoleDefinition> defs = roleIds.isEmpty() ? Map.of() : roles.findVisibleByOrgIdAndIdIn(orgId, roleIds).stream().collect(Collectors.toMap(OrgRoleDefinition::getId, d -> d));
        Map<Long, String> groupNames = groups.findByOrgIdOrderBySortOrderAscNameAsc(orgId).stream().collect(Collectors.toMap(OrgGroup::getId, OrgGroup::getName));
        Set<Long> people = new HashSet<>();
        for (OrgMember m : rows) {
            if (m.getInvitedByMemberId() != null) people.add(m.getInvitedByMemberId());
            if (m.getManagerMemberId() != null) people.add(m.getManagerMemberId());
        }
        Map<Long, String> names = namesOf(orgId, people);

        List<InvitationDTO> out = new ArrayList<>();
        for (OrgMember m : rows) {
            List<InvitationDTO.InvitationRoleRef> refs = new ArrayList<>();
            for (OrgMemberRole r : rolesBySeat.getOrDefault(m.getId(), List.of())) {
                OrgRoleDefinition d = defs.get(r.getRoleId());
                if (d != null) refs.add(new InvitationDTO.InvitationRoleRef(d.getId(), d.getRoleKey(), d.getName(), r.isPrimary()));
            }
            if (refs.isEmpty()) refs.add(new InvitationDTO.InvitationRoleRef(null, m.getRole().name(), m.getRole().name(), true)); // an invitation with no role rows: the legacy role
            out.add(new InvitationDTO(
                m.getId(),
                m.getInviteEmail(),
                m.getInviteName(),
                InviteStatus.of(m, now),
                refs,
                groupRef(groupNames, m.getDepartmentGroupId()),
                groupRef(groupNames, m.getTeamGroupId()),
                m.getManagerMemberId() == null ? null : new InvitationDTO.InvitationPersonRef(m.getManagerMemberId(), names.get(m.getManagerMemberId())),
                m.getInvitedByMemberId() == null ? null : new InvitationDTO.InvitationPersonRef(m.getInvitedByMemberId(), names.get(m.getInvitedByMemberId())),
                m.getInviteSentAt(),
                m.getInviteExpiresAt(),
                m.getJoinedAt(),
                m.getInviteEndedAt(),
                m.getInviteResendCount(),
                m.getInviteMessage()
            ));
        }
        return out;
    }

    private static InvitationDTO.InvitationGroupRef groupRef(Map<Long, String> names, Long id) {
        return id == null || !names.containsKey(id) ? null : new InvitationDTO.InvitationGroupRef(id, names.get(id));
    }

    /** Display names of members (first and last name of their account; null when they have none). */
    private Map<Long, String> namesOf(Long orgId, Set<Long> memberIds) {
        Map<Long, String> out = new LinkedHashMap<>();
        if (memberIds.isEmpty()) return out;
        List<OrgMember> seats = members.findByOrgIdAndIdIn(orgId, memberIds);
        Set<Long> userIds = seats.stream().map(OrgMember::getUserId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, User> byId = userIds.isEmpty() ? Map.of() : users.findAllById(userIds).stream().collect(Collectors.toMap(User::getId, u -> u));
        for (OrgMember s : seats) {
            User u = s.getUserId() == null ? null : byId.get(s.getUserId());
            String name = u == null ? null : OrgInviteService.nameOf(u);
            out.put(s.getId(), name == null || name.isBlank() ? null : name);
        }
        return out;
    }
}
