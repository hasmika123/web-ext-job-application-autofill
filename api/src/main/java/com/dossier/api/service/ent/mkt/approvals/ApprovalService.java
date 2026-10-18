package com.dossier.api.service.ent.mkt.approvals;

import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.ent.mgmt.MgmtLookupRepository;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.jobs.AssignmentScope;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mgmt.TeamScope;
import com.dossier.api.service.ent.mkt.resumes.MktResumesService;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
import com.dossier.api.service.ent.pipeline.PipelineGuardSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Manager approvals (docs/enterprise-v2/deferred/marketing-manager.md section 4.1, decision DD-1): a marketer's request that a Marketing Manager release
 * a held PREPARATION step. {@code approvals.decide} at TEAM scope decides; the manager must have the requester in their {@link TeamScope} (an ORG-scope
 * holder may decide any), may not decide their own request unless they hold the key at ORG scope ({@code 409 SELF_APPROVAL}), and a request that is no
 * longer PENDING is {@code 409 APPROVAL_NOT_PENDING}. One open request per subject and kind ({@code 409 APPROVAL_PENDING}).
 *
 * <p>Approving re-runs the held action in the same transaction under the manager's authority: an assignment goes through the same checks as before (the
 * duplicate guard and the cap are kept; the hold is lifted for this call), a duplicate override is audited at HIGH naming both people, a held resume is
 * released to the consultant's own approval, which is never replaced. If the action no longer works (the consultant is paused, the job closed) the decision
 * fails with that reason and the request stays PENDING. Rejecting changes nothing but the request and tells the marketer. Nothing here submits an application (E1).
 *
 * <p>Every decision writes one audit row (LOW; HIGH for an approved duplicate override) and, for an opportunity, one timeline line ("Approved by ...") so the
 * change audit shows who and when. The marketer gets an in-app notice (no e-mail).
 */
@Service
public class ApprovalService {

    private static final Logger LOG = LoggerFactory.getLogger(ApprovalService.class);

    /** What a page may show of the held action's arguments: ids, flags and the stated reason. Never resume content, never a rate. */
    static final Set<String> SAFE_PAYLOAD_KEYS = Set.of(
        "jobId", "consultantId", "matchId", "ownerMemberId", "askInterest", "priority", "dueOn", "confirmDuplicate", "duplicateReason", "resumeId", "versionNo", "rules"
    );

    /** A request to record. {@code payload} is the held action's arguments (scanned for sensitive content). */
    public record Request(String kind, String subjectType, Long subjectId, Long consultantId, String title, String note, JsonNode payload) {}

    /** The manager's filters: {@code status} PENDING (default), DECIDED, ALL or one status; an optional kind and marketer. */
    public record Filter(String status, String kind, Long marketerMemberId) {}

    private final MktApprovalRequestRepository requests;
    private final MktOpportunityRepository opportunities;
    private final MktOpportunityEventRepository opportunityEvents;
    private final ConsultantProfileRepository consultants;
    private final MgmtLookupRepository lookup;
    private final OrgMemberRepository members;
    private final ApplicationNames names;
    private final PipelineGuardSettings settings;
    private final OrgAuditService audit;
    private final TeamScope teamScope;
    private final ObjectMapper json;
    private final ObjectProvider<OpportunityAssignmentService> assignment;
    private final ObjectProvider<MktResumesService> resumes;
    private final Clock clock;
    private NotificationService feed;

    @Autowired
    public ApprovalService(
        MktApprovalRequestRepository requests,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository opportunityEvents,
        ConsultantProfileRepository consultants,
        MgmtLookupRepository lookup,
        OrgMemberRepository members,
        ApplicationNames names,
        PipelineGuardSettings settings,
        OrgAuditService audit,
        TeamScope teamScope,
        ObjectMapper json,
        ObjectProvider<OpportunityAssignmentService> assignment,
        ObjectProvider<MktResumesService> resumes
    ) {
        this(requests, opportunities, opportunityEvents, consultants, lookup, members, names, settings, audit, teamScope, json, assignment, resumes, Clock.systemUTC());
    }

    ApprovalService(
        MktApprovalRequestRepository requests,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository opportunityEvents,
        ConsultantProfileRepository consultants,
        MgmtLookupRepository lookup,
        OrgMemberRepository members,
        ApplicationNames names,
        PipelineGuardSettings settings,
        OrgAuditService audit,
        TeamScope teamScope,
        ObjectMapper json,
        ObjectProvider<OpportunityAssignmentService> assignment,
        ObjectProvider<MktResumesService> resumes,
        Clock clock
    ) {
        this.requests = requests;
        this.opportunities = opportunities;
        this.opportunityEvents = opportunityEvents;
        this.consultants = consultants;
        this.lookup = lookup;
        this.members = members;
        this.names = names;
        this.settings = settings;
        this.audit = audit;
        this.teamScope = teamScope;
        this.json = json;
        this.assignment = assignment;
        this.resumes = resumes;
        this.clock = clock;
    }

    @Autowired(required = false)
    void setFeed(NotificationService feed) {
        this.feed = feed;
    }

    // ---- open ------------------------------------------------------------------------------------------------------------------------

    /**
     * Records a request for the requester. 409 {@code APPROVAL_PENDING} (with the id of the open one) when the subject already has a PENDING request of the same
     * kind. The consultant must be a consultant of the requester's organization (else the generic 404); the caller has already proved the requester may see them.
     */
    @Transactional
    public ApprovalRequestDTO open(OrgMembership requester, Request r) {
        if (requester == null || requester.orgId() == null || requester.memberId() == null || r == null) throw new OrgNotFoundException();
        Long orgId = requester.orgId();
        String kind = oneOf("kind", r.kind(), ApprovalKinds.KINDS);
        String subjectType = r.subjectType() == null ? "" : r.subjectType().strip().toUpperCase(Locale.ROOT);
        if (!ApprovalKinds.SUBJECTS_OF_KIND.get(kind).contains(subjectType)) throw OrgException.invalid("subjectType", "is not valid for " + kind);
        if (r.subjectId() == null || r.subjectId() <= 0) throw OrgException.invalid("subjectId", "is required");
        if (r.consultantId() == null || r.consultantId() <= 0) throw OrgException.invalid("consultantId", "is required");
        consultants.findByOrgIdAndId(orgId, r.consultantId()).orElseThrow(OrgNotFoundException::new);
        String title = text("title", r.title(), ApprovalKinds.TITLE_MAX, true);
        String note = text("note", r.note(), ApprovalKinds.NOTE_MAX, false);
        String payload = payloadText(r.payload());
        requests
            .findByOrgIdAndSubjectTypeAndSubjectIdAndKindAndStatus(orgId, subjectType, r.subjectId(), kind, MktApprovalRequest.STATUS_PENDING)
            .ifPresent(existing -> {
                throw pending(existing);
            });
        Instant now = clock.instant();
        MktApprovalRequest row = new MktApprovalRequest();
        row.setOrgId(orgId);
        row.setKind(kind);
        row.setSubjectType(subjectType);
        row.setSubjectId(r.subjectId());
        row.setConsultantId(r.consultantId());
        row.setRequestedByMemberId(requester.memberId());
        row.setRequestedAt(now);
        row.setTitle(title);
        row.setNote(note);
        row.setPayloadJson(payload);
        row.setStatus(MktApprovalRequest.STATUS_PENDING);
        row.setExpiresAt(now.plus(Duration.ofDays(settings.approvalExpiryDays(orgId))));
        row.setCreatedAt(now);
        row.setUpdatedAt(now);
        MktApprovalRequest saved;
        try {
            saved = requests.saveAndFlush(row);
        } catch (DataIntegrityViolationException raced) {
            throw OrgException.coded(409, ApprovalKinds.CODE_PENDING, "This is already waiting for a manager's approval.", Map.of("kind", kind));
        }
        subjectEvent(saved, ApprovalKinds.EVENT_REQUESTED, requester.memberId(), "Sent to a manager for approval", now);
        audit.record(
            requester.orgId(), requester.login(), requester.role(), ApprovalKinds.AUDIT_OPEN, ApprovalKinds.TARGET, null, String.valueOf(saved.getId()),
            "kind=" + kind + " subject=" + subjectType + ":" + r.subjectId() + " consultant=" + r.consultantId(), null, null, null, "LOW"
        );
        return dtos(orgId, List.of(saved)).get(0);
    }

    private static OrgException pending(MktApprovalRequest existing) {
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("requestId", existing.getId());
        extra.put("kind", existing.getKind());
        return OrgException.coded(409, ApprovalKinds.CODE_PENDING, "This is already waiting for a manager's approval.", extra);
    }

    // ---- reads -----------------------------------------------------------------------------------------------------------------------

    /**
     * The manager's list: the requests of the marketers in {@code team} (every marketer for an organization-wide caller). {@code status} PENDING (the
     * default, oldest first), DECIDED (approved, rejected, withdrawn or expired, newest first), ALL or one status.
     */
    @Transactional(readOnly = true)
    public Page<ApprovalRequestDTO> pending(TeamScope.View team, Filter f, Pageable p) {
        Filter filter = f == null ? new Filter(null, null, null) : f;
        List<String> statuses = statuses(filter.status());
        String kind = filter.kind() == null || filter.kind().isBlank() ? null : oneOf("kind", filter.kind(), ApprovalKinds.KINDS);
        Long marketer = filter.marketerMemberId();
        if (marketer != null && !team.all()) teamScope.require(team, marketer);
        boolean oldestFirst = statuses.size() == 1 && MktApprovalRequest.STATUS_PENDING.equals(statuses.get(0));
        Pageable page = PageRequest.of(p.getPageNumber(), p.getPageSize(), oldestFirst ? Sort.by("requestedAt", "id").ascending() : Sort.by("requestedAt", "id").descending());
        Page<MktApprovalRequest> rows = requests.search(team.orgId(), team.all(), ids(team.marketerMemberIds()), statuses, kind, marketer, page);
        return new PageImpl<>(dtos(team.orgId(), rows.getContent()), page, rows.getTotalElements());
    }

    /** A marketer's own requests ({@code status} PENDING by default, DECIDED, ALL or one status), newest first. */
    @Transactional(readOnly = true)
    public Page<ApprovalRequestDTO> mine(OrgMembership me, String status, Pageable p) {
        if (me == null || me.orgId() == null || me.memberId() == null) throw new OrgNotFoundException();
        Pageable page = PageRequest.of(p.getPageNumber(), p.getPageSize(), Sort.by("requestedAt", "id").descending());
        Page<MktApprovalRequest> rows = requests.mine(me.orgId(), me.memberId(), statuses(status), page);
        return new PageImpl<>(dtos(me.orgId(), rows.getContent()), page, rows.getTotalElements());
    }

    /** One request for a manager of the requester's team. A request outside the team is the generic 404. */
    @Transactional(readOnly = true)
    public ApprovalRequestDTO get(TeamScope.View team, Long id) {
        MktApprovalRequest r = requests.findByOrgIdAndId(team.orgId(), id == null ? -1L : id).orElseThrow(OrgNotFoundException::new);
        if (!team.all()) teamScope.require(team, r.getRequestedByMemberId());
        return dtos(team.orgId(), List.of(r)).get(0);
    }

    /** One of the requester's own requests; anyone else's is the generic 404. */
    @Transactional(readOnly = true)
    public ApprovalRequestDTO getMine(OrgMembership me, Long id) {
        MktApprovalRequest r = requests.findByOrgIdAndId(me.orgId(), id == null ? -1L : id).orElseThrow(OrgNotFoundException::new);
        if (!r.getRequestedByMemberId().equals(me.memberId())) throw new OrgNotFoundException();
        return dtos(me.orgId(), List.of(r)).get(0);
    }

    /** PENDING requests of the team (the Home page's badge and "needs you" list). */
    @Transactional(readOnly = true)
    public long countPending(TeamScope.View team) {
        return requests.countPendingFor(team.orgId(), team.all(), ids(team.marketerMemberIds()));
    }

    @Transactional(readOnly = true)
    public List<ApprovalRequestDTO> oldestPending(TeamScope.View team, int limit) {
        return dtos(team.orgId(), requests.pendingFor(team.orgId(), team.all(), ids(team.marketerMemberIds()), PageRequest.of(0, Math.max(1, limit))));
    }

    // ---- decisions ---------------------------------------------------------------------------------------------------------------------

    /** Approves: runs the held action under the manager's authority, in this transaction. */
    @Transactional
    public ApprovalRequestDTO approve(OrgMembership manager, Long id, String note) {
        return decide(manager, id, note, true);
    }

    /** Rejects: the note (1 to 300 characters) is required; nothing happens but the request and a notice to the marketer. */
    @Transactional
    public ApprovalRequestDTO reject(OrgMembership manager, Long id, String note) {
        return decide(manager, id, note, false);
    }

    private ApprovalRequestDTO decide(OrgMembership manager, Long id, String note, boolean approve) {
        TeamScope.View team = teamScope.resolve(manager, AuthzOperation.WRITE, ApprovalKinds.KEY_DECIDE);
        Long orgId = team.orgId();
        MktApprovalRequest r = requests.lockByOrgIdAndId(orgId, id == null ? -1L : id).orElseThrow(OrgNotFoundException::new);
        if (!team.all()) teamScope.require(team, r.getRequestedByMemberId());
        String decisionNote = decisionNote(note, !approve);
        Instant now = clock.instant();
        if (!r.isPending() || r.getExpiresAt().isBefore(now)) {
            throw OrgException.coded(409, ApprovalKinds.CODE_NOT_PENDING, "This request is no longer waiting for a decision.", Map.of("status", r.getStatus()));
        }
        if (!team.all() && manager.memberId().equals(r.getRequestedByMemberId())) {
            throw OrgException.coded(409, ApprovalKinds.CODE_SELF, "You can't decide a request you made yourself.", Map.of());
        }
        if (approve) execute(manager, r);
        else if (ApprovalKinds.RESUME_RELEASE.equals(r.getKind())) resumes.getObject().releaseDeclined(manager, r.getSubjectId(), decisionNote);
        r.setStatus(approve ? MktApprovalRequest.STATUS_APPROVED : MktApprovalRequest.STATUS_REJECTED);
        r.setDecidedByMemberId(manager.memberId());
        r.setDecidedAt(now);
        r.setDecisionNote(decisionNote);
        r.setUpdatedAt(now);
        requests.save(r);
        clearLink(r);
        String who = names.memberNames(orgId, Set.of(manager.memberId())).getOrDefault(manager.memberId(), "A manager");
        if (approve) {
            subjectEvent(r, ApprovalKinds.EVENT_APPROVED, manager.memberId(), "Approved by " + who + ".", now);
        } else {
            subjectEvent(r, ApprovalKinds.EVENT_DECLINED, manager.memberId(), "Manager declined: " + decisionNote, now);
        }
        boolean high = approve && ApprovalKinds.DUPLICATE_OVERRIDE.equals(r.getKind());
        audit.record(
            orgId, manager.login(), manager.role(), approve ? ApprovalKinds.AUDIT_APPROVE : ApprovalKinds.AUDIT_REJECT, ApprovalKinds.TARGET, null, String.valueOf(r.getId()),
            "kind=" + r.getKind() + " subject=" + r.getSubjectType() + ":" + r.getSubjectId() + " consultant=" + r.getConsultantId() + " requestedBy=" + r.getRequestedByMemberId(),
            null, null, null, high ? "HIGH" : "LOW"
        );
        tell(
            orgId, r.getRequestedByMemberId(), approve ? "Approved: " + r.getTitle() : "Not approved: " + r.getTitle(),
            approve ? who + " approved it." : who + " declined it: " + decisionNote, "/w/marketing/opportunities", "approval:" + r.getId() + ":" + r.getStatus()
        );
        return dtos(orgId, List.of(r)).get(0);
    }

    /** The marketer takes a PENDING request back. Only the requester can; anyone else's request is the generic 404. */
    @Transactional
    public ApprovalRequestDTO withdraw(OrgMembership requester, Long id) {
        if (requester == null || requester.orgId() == null) throw new OrgNotFoundException();
        MktApprovalRequest r = requests.lockByOrgIdAndId(requester.orgId(), id == null ? -1L : id).orElseThrow(OrgNotFoundException::new);
        if (!r.getRequestedByMemberId().equals(requester.memberId())) throw new OrgNotFoundException();
        if (!r.isPending()) throw OrgException.coded(409, ApprovalKinds.CODE_NOT_PENDING, "This request is no longer waiting for a decision.", Map.of("status", r.getStatus()));
        Instant now = clock.instant();
        r.setStatus(MktApprovalRequest.STATUS_WITHDRAWN);
        r.setDecidedAt(now);
        r.setUpdatedAt(now);
        requests.save(r);
        clearLink(r);
        subjectEvent(r, ApprovalKinds.EVENT_WITHDRAWN, requester.memberId(), "Approval request withdrawn", now);
        audit.record(
            requester.orgId(), requester.login(), requester.role(), ApprovalKinds.AUDIT_WITHDRAW, ApprovalKinds.TARGET, null, String.valueOf(r.getId()),
            "kind=" + r.getKind() + " subject=" + r.getSubjectType() + ":" + r.getSubjectId(), null, null, null, "LOW"
        );
        return dtos(requester.orgId(), List.of(r)).get(0);
    }

    /**
     * The expiry job's pass: every PENDING request of the organization whose expiry has passed becomes EXPIRED (nothing happens to the held action; the
     * marketer is told and can ask again). One SYSTEM audit row per request. Returns how many closed.
     */
    @Transactional
    public int expire(Long orgId, Instant now) {
        int n = 0;
        for (MktApprovalRequest r : requests.findExpired(orgId, now)) {
            r.setStatus(MktApprovalRequest.STATUS_EXPIRED);
            r.setDecidedAt(now);
            r.setUpdatedAt(now);
            requests.save(r);
            clearLink(r);
            subjectEvent(r, ApprovalKinds.EVENT_EXPIRED, null, "Approval request expired", now);
            audit.record(
                orgId, OrgAuditService.SYSTEM_ACTOR, null, ApprovalKinds.AUDIT_EXPIRE, ApprovalKinds.TARGET, null, String.valueOf(r.getId()),
                "kind=" + r.getKind() + " subject=" + r.getSubjectType() + ":" + r.getSubjectId(), null, null, null, "LOW"
            );
            tell(orgId, r.getRequestedByMemberId(), "Expired: " + r.getTitle(), "Nobody decided it in time. Nothing was changed; ask again if it still matters.", "/w/marketing/opportunities", "approval:" + r.getId() + ":EXPIRED");
            n++;
        }
        return n;
    }

    // ---- the held action -------------------------------------------------------------------------------------------------------------

    private void execute(OrgMembership manager, MktApprovalRequest r) {
        JsonNode p = readPayload(r);
        switch (r.getKind()) {
            case ApprovalKinds.OPPORTUNITY_ASSIGN, ApprovalKinds.DUPLICATE_OVERRIDE -> {
                if (!ApprovalKinds.SUBJECT_OPPORTUNITY.equals(r.getSubjectType())) {
                    throw OrgException.coded(409, ApprovalKinds.CODE_NOT_SUPPORTED, "This kind of request cannot be carried out from here.", Map.of());
                }
                Long jobId = p.path("jobId").isIntegralNumber() ? p.path("jobId").asLong() : null;
                Long consultantId = r.getConsultantId();
                if (jobId == null) throw OrgException.coded(409, ApprovalKinds.CODE_NOT_SUPPORTED, "This request has nothing to carry out.", Map.of());
                Long owner = p.path("ownerMemberId").isIntegralNumber() ? p.path("ownerMemberId").asLong() : r.getRequestedByMemberId();
                String reason = p.path("duplicateReason").isTextual() ? p.path("duplicateReason").asText() : null;
                DuplicateGuard.Confirm confirm = new DuplicateGuard.Confirm(p.path("confirmDuplicate").asBoolean(false), reason, manager.memberId(), r.getRequestedByMemberId());
                OpportunityAssignmentService.Options o = OpportunityAssignmentService.Options.none().withOwner(owner).confirmingDuplicate(confirm);
                if (p.path("askInterest").asBoolean(false)) o = o.askingInterest();
                o = o.withOpportunity(textOrNull(p, "marketerNote"), textOrNull(p, "priority"), dateOrNull(p, "dueOn"));
                AssignmentScope scope = new HeldScope(r.getOrgId(), consultantId);
                OpportunityAssignmentService.Result res = assignment.getObject().assign(scope, manager, jobId, consultantId, o);
                if (res.refused()) throw OrgException.coded(409, res.reason(), "This can no longer be assigned: " + res.reason(), Map.of());
            }
            case ApprovalKinds.RESUME_RELEASE -> resumes.getObject().releaseApproved(manager, r.getSubjectId());
            default -> throw OrgException.coded(409, ApprovalKinds.CODE_NOT_SUPPORTED, "This kind of request cannot be carried out from here.", Map.of());
        }
    }

    /** The one consultant a held action concerns: nothing else is reachable through it. */
    private record HeldScope(Long orgId, Long consultantId) implements AssignmentScope {
        @Override
        public boolean sees(Long id) {
            return consultantId != null && consultantId.equals(id);
        }
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------------------------

    private JsonNode readPayload(MktApprovalRequest r) {
        if (r.getPayloadJson() == null || r.getPayloadJson().isBlank()) return json.createObjectNode();
        try {
            return json.readTree(r.getPayloadJson());
        } catch (JsonProcessingException e) {
            throw OrgException.coded(409, ApprovalKinds.CODE_NOT_SUPPORTED, "This request has nothing to carry out.", Map.of());
        }
    }

    private static String textOrNull(JsonNode p, String field) {
        return p.path(field).isTextual() && !p.path(field).asText().isBlank() ? p.path(field).asText() : null;
    }

    private static LocalDate dateOrNull(JsonNode p, String field) {
        String t = textOrNull(p, field);
        if (t == null) return null;
        try {
            return LocalDate.parse(t);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** The opportunity's timeline line for a decision (who and when are on the line itself). */
    private void subjectEvent(MktApprovalRequest r, String kind, Long actor, String text, Instant now) {
        if (!ApprovalKinds.SUBJECT_OPPORTUNITY.equals(r.getSubjectType())) return;
        MktOpportunityEvent e = new MktOpportunityEvent();
        e.setOrgId(r.getOrgId());
        e.setOpportunityId(r.getSubjectId());
        e.setKind(kind);
        e.setActorMemberId(actor);
        e.setText(text.length() > 200 ? text.substring(0, 200) : text);
        e.setOccurredAt(now);
        opportunityEvents.save(e);
    }

    /** A decision, withdrawal or expiry frees the opportunity: nothing is held any more. */
    private void clearLink(MktApprovalRequest r) {
        if (!ApprovalKinds.SUBJECT_OPPORTUNITY.equals(r.getSubjectType())) return;
        opportunities
            .findByOrgIdAndId(r.getOrgId(), r.getSubjectId())
            .filter(o -> r.getId().equals(o.getApprovalRequestId()))
            .ifPresent(o -> {
                o.setApprovalRequestId(null);
                opportunities.save(o);
            });
    }

    private void tell(Long orgId, Long memberId, String title, String body, String link, String dedupe) {
        if (feed == null || memberId == null) return;
        try {
            members
                .findByOrgIdAndId(orgId, memberId)
                .filter(seat -> seat.getUserId() != null)
                .ifPresent(seat -> feed.publish(NotificationKind.SYSTEM, seat.getUserId(), new NotificationService.Payload(title, body, link, null, null, dedupe, null, false, null)));
        } catch (RuntimeException e) {
            LOG.warn("Could not tell member {} of org {} about an approval decision", memberId, orgId, e); // the decision itself stands
        }
    }

    private List<ApprovalRequestDTO> dtos(Long orgId, List<MktApprovalRequest> rows) {
        if (rows.isEmpty()) return List.of();
        Set<Long> memberIds = new HashSet<>();
        Set<Long> consultantIds = new HashSet<>();
        for (MktApprovalRequest r : rows) {
            memberIds.add(r.getRequestedByMemberId());
            if (r.getDecidedByMemberId() != null) memberIds.add(r.getDecidedByMemberId());
            consultantIds.add(r.getConsultantId());
        }
        Map<Long, String> memberNames = names.memberNames(orgId, memberIds);
        Map<Long, String> consultantNames = new HashMap<>();
        for (Object[] c : lookup.consultantNames(orgId, consultantIds)) consultantNames.put((Long) c[0], (String) c[1]);
        List<ApprovalRequestDTO> out = new ArrayList<>();
        for (MktApprovalRequest r : rows) {
            out.add(new ApprovalRequestDTO(
                r.getId(), r.getKind(), r.getSubjectType(), r.getSubjectId(),
                new ApprovalRequestDTO.Person(r.getConsultantId(), consultantNames.getOrDefault(r.getConsultantId(), "Consultant")),
                new ApprovalRequestDTO.Person(r.getRequestedByMemberId(), memberNames.getOrDefault(r.getRequestedByMemberId(), "Member")),
                r.getRequestedAt(), r.getTitle(), r.getNote(), r.getStatus(),
                r.getDecidedByMemberId() == null ? null : new ApprovalRequestDTO.Person(r.getDecidedByMemberId(), memberNames.getOrDefault(r.getDecidedByMemberId(), "Member")),
                r.getDecidedAt(), r.getDecisionNote(), r.getExpiresAt(), safePayload(r)
            ));
        }
        return out;
    }

    private Map<String, Object> safePayload(MktApprovalRequest r) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (r.getPayloadJson() == null || r.getPayloadJson().isBlank()) return out;
        try {
            JsonNode p = json.readTree(r.getPayloadJson());
            for (Iterator<Map.Entry<String, JsonNode>> it = p.fields(); it.hasNext();) {
                Map.Entry<String, JsonNode> e = it.next();
                if (SAFE_PAYLOAD_KEYS.contains(e.getKey()) && (e.getValue().isValueNode() || e.getValue().isArray())) out.put(e.getKey(), json.convertValue(e.getValue(), Object.class));
            }
        } catch (JsonProcessingException e) {
            LOG.warn("Unreadable payload on approval request {}", r.getId());
        }
        return out;
    }

    private String payloadText(JsonNode payload) {
        if (payload == null || payload.isNull() || payload.isMissingNode()) return null;
        if (!payload.isObject()) throw OrgException.invalid("payload", "must be an object");
        SensitiveContent.check("payload", payload);
        try {
            String text = json.writeValueAsString(payload);
            if (text.length() > ApprovalKinds.PAYLOAD_MAX) throw OrgException.invalid("payload", "is too long");
            return text;
        } catch (JsonProcessingException e) {
            throw OrgException.invalid("payload", "is not valid");
        }
    }

    private static String text(String field, String raw, int max, boolean required) {
        if (raw == null || raw.isBlank()) {
            if (required) throw OrgException.invalid(field, "is required");
            return null;
        }
        String t = raw.strip();
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String decisionNote(String raw, boolean required) {
        String t = raw == null ? "" : raw.strip();
        if (t.isEmpty()) {
            if (required) throw OrgException.invalid("note", "enter 1 to " + ApprovalKinds.DECISION_NOTE_MAX + " characters");
            return null;
        }
        if (t.length() > ApprovalKinds.DECISION_NOTE_MAX) throw OrgException.invalid("note", "at most " + ApprovalKinds.DECISION_NOTE_MAX + " characters");
        SensitiveContent.check("note", "note", t);
        return t;
    }

    private static String oneOf(String field, String raw, List<String> allowed) {
        String v = raw == null ? "" : raw.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) throw OrgException.invalid(field, "must be one of " + allowed);
        return v;
    }

    /** PENDING (default), DECIDED, ALL or one status. */
    private static List<String> statuses(String raw) {
        String v = raw == null || raw.isBlank() ? MktApprovalRequest.STATUS_PENDING : raw.strip().toUpperCase(Locale.ROOT);
        return switch (v) {
            case "PENDING" -> List.of(MktApprovalRequest.STATUS_PENDING);
            case "DECIDED" -> ApprovalKinds.DECIDED;
            case "ALL" -> {
                List<String> all = new ArrayList<>(ApprovalKinds.DECIDED);
                all.add(MktApprovalRequest.STATUS_PENDING);
                yield all;
            }
            case "APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED" -> List.of(v);
            default -> throw OrgException.invalid("status", "must be PENDING, DECIDED, ALL, APPROVED, REJECTED, WITHDRAWN or EXPIRED");
        };
    }

    /** Never an empty collection in an IN list. */
    private static Collection<Long> ids(Set<Long> ids) {
        return ids.isEmpty() ? List.of(-1L) : ids;
    }
}
