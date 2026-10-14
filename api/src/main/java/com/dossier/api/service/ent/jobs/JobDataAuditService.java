package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.JobDataEvent;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.JobDataEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "What job data do you hold, where did it come from, who put it there and what happened to it" as an organization administrator reads it
 * (docs/enterprise-v2/60 section 11, 61 sections 2, 3 and 7): per job, the provenance columns plus the append-only ledger, paged.
 *
 * <p>Gate: {@code audit.view} at ORG scope, and not through a row filter (finance's and HR's audit grants are narrowed to their own rows, which
 * this is not); anything less is the generic 404. Read only. A job carries no text beyond the MINIMAL fields (title and employer); the ledger holds
 * field names, ids and the source link, never values.
 */
@Service
public class JobDataAuditService {

    public static final String PERMISSION = "audit.view";
    public static final int MAX_SIZE = 100;
    public static final int DEFAULT_SIZE = 25;
    /** A single job's timeline is shown whole up to this many rows. */
    static final int MAX_EVENTS_PER_JOB = 500;

    /** Who, when the ledger can name them: the member id always, the person's name when the seat still resolves to a user. */
    public record Person(Long memberId, String name) {}

    public record JobProvenance(
        Long id,
        String title,
        String employer,
        String captureSource,
        String captureMethod,
        Instant capturedAt,
        Person capturedBy,
        String extensionVersion,
        String capturePayloadHash,
        String detailLevel,
        String storedDetailLevel,
        Instant levelChangedAt
    ) {}

    public record Event(
        Long id,
        String type,
        Instant occurredAt,
        String actorKind,
        Person actor,
        String detailLevelBefore,
        String detailLevelAfter,
        String fields,
        String sourceRef,
        String termsRef,
        String requestId,
        String note
    ) {}

    public record Item(JobProvenance job, List<Event> events) {}

    public record Response(List<Item> items, long total, int page, int size) {}

    private final JobDataEventRepository events;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgRolePermissionRepository permissions;
    private final JobDetailCap cap;

    public JobDataAuditService(
        JobDataEventRepository events,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        OrgMemberRepository members,
        UserRepository users,
        OrgRolePermissionRepository permissions,
        JobDetailCap cap
    ) {
        this.events = events;
        this.requirements = requirements;
        this.clients = clients;
        this.members = members;
        this.users = users;
        this.permissions = permissions;
        this.cap = cap;
    }

    /**
     * One page of jobs that have ledger events in {@code [from, to)} (default: ever), newest activity first, each with its events oldest first. With
     * {@code jobId}, just that job (404 when it is not this organization's) with its events in the window.
     */
    @Transactional(readOnly = true)
    public Response jobData(OrgMembership me, Long jobId, Instant from, Instant to, Integer page, Integer size) {
        requireAuditor(me);
        Long orgId = me.orgId();
        int p = page == null ? 0 : page;
        int s = size == null ? DEFAULT_SIZE : size;
        if (p < 0) throw OrgException.coded(400, "VALIDATION", "page: from 0", Map.of("field", "page"));
        if (s < 1 || s > MAX_SIZE) throw OrgException.coded(400, "VALIDATION", "size: 1 to " + MAX_SIZE, Map.of("field", "size"));
        if (from != null && to != null && !from.isBefore(to)) throw OrgException.coded(400, "VALIDATION", "from: must be before to", Map.of("field", "from"));
        Instant lo = from == null ? Instant.EPOCH : from;
        Instant hi = to == null ? Instant.parse("9999-01-01T00:00:00Z") : to;
        String orgCap = cap.capFor(orgId);

        List<Long> jobIds;
        long total;
        if (jobId != null) {
            requirements.findByOrgIdAndId(orgId, jobId).orElseThrow(OrgNotFoundException::new);
            jobIds = List.of(jobId);
            total = 1;
        } else {
            Page<Long> ids = events.findJobIdsWithEvents(orgId, lo, hi, PageRequest.of(p, s));
            jobIds = ids.getContent();
            total = ids.getTotalElements();
        }
        if (jobIds.isEmpty()) return new Response(List.of(), total, p, s);

        Map<Long, ClientRequirement> jobs = new HashMap<>();
        for (ClientRequirement j : requirements.findByOrgIdAndIdIn(orgId, jobIds)) jobs.put(j.getId(), j);
        Map<Long, List<JobDataEvent>> byJob = new HashMap<>();
        for (JobDataEvent e : events.findByOrgIdAndRequirementIds(orgId, jobIds)) {
            if (e.getOccurredAt().isBefore(lo) || !e.getOccurredAt().isBefore(hi)) continue;
            List<JobDataEvent> list = byJob.computeIfAbsent(e.getRequirementId(), k -> new ArrayList<>());
            if (list.size() < MAX_EVENTS_PER_JOB) list.add(e);
        }

        Set<Long> memberIds = new HashSet<>();
        Set<Long> clientIds = new HashSet<>();
        for (ClientRequirement j : jobs.values()) {
            if (j.getCapturedByMemberId() != null) memberIds.add(j.getCapturedByMemberId());
            clientIds.add(j.getClientId());
        }
        for (List<JobDataEvent> list : byJob.values()) for (JobDataEvent e : list) if (e.getActorMemberId() != null) memberIds.add(e.getActorMemberId());
        Map<Long, String> names = memberNames(orgId, memberIds);
        Map<Long, String> employers = new HashMap<>();
        if (!clientIds.isEmpty()) for (ClientAccount a : clients.findByOrgIdAndIdIn(orgId, clientIds)) employers.put(a.getId(), a.getName());

        List<Item> items = new ArrayList<>();
        for (Long id : jobIds) {
            ClientRequirement j = jobs.get(id);
            if (j == null) continue;
            List<Event> list = new ArrayList<>();
            for (JobDataEvent e : byJob.getOrDefault(id, List.of())) list.add(event(e, names));
            items.add(new Item(provenance(j, employers.get(j.getClientId()), names, orgCap), List.copyOf(list)));
        }
        return new Response(List.copyOf(items), total, p, s);
    }

    private static JobProvenance provenance(ClientRequirement j, String employer, Map<Long, String> names, String orgCap) {
        Person by = j.getCapturedByMemberId() == null ? null : new Person(j.getCapturedByMemberId(), names.get(j.getCapturedByMemberId()));
        return new JobProvenance(
            j.getId(),
            j.getTitle(),
            employer,
            j.getCaptureSource(),
            j.getCaptureMethod(),
            j.getCapturedAt(),
            by,
            j.getExtensionVersion(),
            j.getCapturePayloadHash(),
            JobDetailMapper.effectiveLevel(j.getDetailLevel(), orgCap),
            j.getDetailLevel(),
            j.getDetailLevelChangedAt()
        );
    }

    private static Event event(JobDataEvent e, Map<Long, String> names) {
        Person actor = e.getActorMemberId() == null ? null : new Person(e.getActorMemberId(), names.get(e.getActorMemberId()));
        return new Event(
            e.getId(), e.getEventType(), e.getOccurredAt(), e.getActorKind(), actor, e.getDetailLevelBefore(), e.getDetailLevelAfter(), e.getFields(),
            e.getSourceRef(), e.getTermsRef(), e.getRequestId(), e.getNote()
        );
    }

    /** {@code audit.view} at ORG scope and not narrowed by a row filter, else the generic 404. */
    void requireAuditor(OrgMembership me) {
        if (me == null) throw new OrgNotFoundException();
        PermissionScope scope = me.scopeFor(PERMISSION).orElseThrow(OrgNotFoundException::new);
        if (scope != PermissionScope.ORG) throw new OrgNotFoundException();
        List<Long> roleIds = me.roles().stream().map(OrgMembership.RoleRef::roleId).filter(Objects::nonNull).toList();
        if (roleIds.isEmpty()) return; // the legacy grant (an enum role) is whole
        boolean granted = false;
        for (OrgRolePermission p : permissions.findForRoles(me.orgId(), roleIds)) {
            if (!PERMISSION.equals(p.getPermissionKey())) continue;
            if (p.getRowFilter() == null) return; // some role grants it unfiltered
            granted = true;
        }
        if (granted) throw new OrgNotFoundException(); // every role that grants it is narrowed to billing or HR rows
    }

    private Map<Long, String> memberNames(Long orgId, Collection<Long> memberIds) {
        if (memberIds.isEmpty()) return Map.of();
        Map<Long, Long> userOf = new HashMap<>();
        for (OrgMember m : members.findByOrgIdAndIdIn(orgId, memberIds)) if (m.getUserId() != null) userOf.put(m.getId(), m.getUserId());
        Map<Long, String> byUser = new HashMap<>();
        if (!userOf.isEmpty()) {
            for (User u : users.findAllById(userOf.values())) {
                String full = ((u.getFirstName() == null ? "" : u.getFirstName().trim()) + " " + (u.getLastName() == null ? "" : u.getLastName().trim())).trim();
                if (!full.isEmpty()) byUser.put(u.getId(), full);
            }
        }
        Map<Long, String> out = new HashMap<>();
        userOf.forEach((memberId, userId) -> {
            String n = byUser.get(userId);
            if (n != null) out.put(memberId, n);
        });
        return out;
    }
}
