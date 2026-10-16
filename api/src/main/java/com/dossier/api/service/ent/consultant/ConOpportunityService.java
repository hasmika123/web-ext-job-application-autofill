package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.mkt.MktPipelineApplicationLink;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.consultant.ConOpportunityRepository;
import com.dossier.api.repository.ent.consultant.ConOpportunityRow;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktPipelineApplicationLinkRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.jobs.JobDetailCap;
import com.dossier.api.service.ent.jobs.UrlKeys;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The consultant side of an assigned opportunity (doc 60 sections 3 and 4): list, read, and the seven transitions the matrix gives the consultant.
 * Every call goes through {@link ConScope} first, so the consultant id is the caller's own and any miss is the generic 404; another consultant's
 * opportunity id and another user's application id are 404s as well, never 403s.
 *
 * <p><b>Matrix</b> (state, actor C): viewed ASSIGNED to VIEWED; interest ASSIGNED, VIEWED, NEEDS_INFO to INTERESTED (and DECLINED to INTERESTED while the
 * job is open); request-info ASSIGNED, VIEWED, INTERESTED to NEEDS_INFO; decline ASSIGNED, VIEWED, INTERESTED, NEEDS_INFO to DECLINED; applied and link ASSIGNED,
 * VIEWED, INTERESTED, NEEDS_INFO to APPLIED. The same target is a 200 no-op that writes nothing. Anything else is 409 {@code ILLEGAL_TRANSITION}. A stale
 * {@code If-Match} or a concurrent write is 409 {@code VERSION_CONFLICT}. Interest, request-info and applied act on an open posting: while the job is not OPEN or
 * IN_REVIEW they are 409 {@code JOB_NOT_OPEN} (viewed and decline stay possible, so the consultant can still say no to a job that closed). Each real transition is one transaction: the row, one
 * {@code mkt_opportunity_event} and one {@code org_audit_event}.
 *
 * <p><b>Applied without an application.</b> {@code pipeline_application_link.personal_application_id} is NOT NULL, so "I applied" with no
 * {@code applicationId} (LinkedIn Easy Apply, Dice: nothing is detected there) sets {@code state=APPLIED} and {@code applied_at} and records the event
 * {@code APPLIED_UNLINKED}; no link row exists. A later {@code link} attaches the application. With an {@code applicationId} (verified to be the caller's
 * own) the link is created with {@code source=CONSULTANT}; the org projection ({@code talent_application}) is written only when the consultant's consent
 * is FULL (doc 60 section 0.3).
 *
 * <p>E1: this is the consultant recording what THEY did. Nothing here submits an application, sets an application's status, or acts for a marketer.
 */
@Service
public class ConOpportunityService {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;

    public static final List<String> STATES = List.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO", "DECLINED", "APPLIED", "CLOSED");
    static final Set<String> BEFORE_APPLY = Set.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO");
    /** The states an opportunity is no longer open in (the linker skips them). */
    public static final Set<String> NOT_OPEN = Set.of("DECLINED", "CLOSED", "APPLIED");
    static final Set<String> OPEN_JOB = Set.of("OPEN", "IN_REVIEW");
    public static final List<String> DECLINE_REASONS = List.of("NOT_INTERESTED", "LOCATION", "RATE", "ALREADY_APPLIED", "OTHER");
    static final int QUESTION_MAX = 500;
    static final int NOTE_MAX = 200;

    public static final String ILLEGAL_TRANSITION = "ILLEGAL_TRANSITION";
    public static final String ALREADY_LINKED = "ALREADY_LINKED";

    private final ConScope scope;
    private final ConOpportunityRepository repo;
    private final MktOpportunityRepository opportunities;
    private final MktOpportunityEventRepository events;
    private final MktPipelineApplicationLinkRepository links;
    private final RequirementSkillRepository skills;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final ApplicationRepository applications;
    private final DataShareService shares;
    private final LinkedApplicationProjection projection;
    private final ConJobDtoFactory jobs;
    private final JobDetailCap detailCap;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public ConOpportunityService(
        ConScope scope, ConOpportunityRepository repo, MktOpportunityRepository opportunities, MktOpportunityEventRepository events,
        MktPipelineApplicationLinkRepository links, RequirementSkillRepository skills, OrgMemberRepository members, UserRepository users,
        ApplicationRepository applications, DataShareService shares, LinkedApplicationProjection projection, ConJobDtoFactory jobs, JobDetailCap detailCap, OrgAuditService audit
    ) {
        this(scope, repo, opportunities, events, links, skills, members, users, applications, shares, projection, jobs, detailCap, audit, Clock.systemUTC());
    }

    ConOpportunityService(
        ConScope scope, ConOpportunityRepository repo, MktOpportunityRepository opportunities, MktOpportunityEventRepository events,
        MktPipelineApplicationLinkRepository links, RequirementSkillRepository skills, OrgMemberRepository members, UserRepository users,
        ApplicationRepository applications, DataShareService shares, LinkedApplicationProjection projection, ConJobDtoFactory jobs, JobDetailCap detailCap, OrgAuditService audit, Clock clock
    ) {
        this.scope = scope;
        this.repo = repo;
        this.opportunities = opportunities;
        this.events = events;
        this.links = links;
        this.skills = skills;
        this.members = members;
        this.users = users;
        this.applications = applications;
        this.shares = shares;
        this.projection = projection;
        this.jobs = jobs;
        this.detailCap = detailCap;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- reads ---------------------------------------------------------------------------------------------------------------

    /**
     * The caller's opportunities. {@code states} is a comma list (none = every state), {@code size} defaults to 20 and is capped at 100. With a
     * {@code matchUrl} or an ({@code atsPlatform}, {@code externalJobId}) pair the answer is the opportunities whose job is that posting (the extension asks
     * this on a job page); the state filter still applies and the answer is not paged.
     */
    @Transactional(readOnly = true)
    public ConOpportunityDTO.ListResponse list(OrgMembership me, String states, Integer page, Integer size, String matchUrl, String atsPlatform, String externalJobId) {
        ConScope.View view = scope.read(me);
        Set<String> wanted = parseStates(states);
        boolean matching = (matchUrl != null && !matchUrl.isBlank()) || (atsPlatform != null && !atsPlatform.isBlank() && externalJobId != null && !externalJobId.isBlank());
        if (matching) {
            Map<Long, ConOpportunityRow> found = new LinkedHashMap<>();
            if (matchUrl != null && !matchUrl.isBlank()) {
                for (String hash : urlHashes(matchUrl, externalJobId)) {
                    for (ConOpportunityRow r : repo.findByUrlKeyHash(view.orgId(), view.consultantId(), hash)) found.putIfAbsent(r.opportunityId(), r);
                }
            }
            if (atsPlatform != null && !atsPlatform.isBlank() && externalJobId != null && !externalJobId.isBlank()) {
                for (ConOpportunityRow r : repo.findByAtsAndExternalId(view.orgId(), view.consultantId(), atsPlatform.trim(), externalJobId.trim())) found.putIfAbsent(r.opportunityId(), r);
            }
            List<ConOpportunityRow> rows = found.values().stream().filter(r -> wanted.contains(r.state())).limit(MAX_SIZE).toList();
            return new ConOpportunityDTO.ListResponse(toDtos(view, rows), rows.size());
        }
        int p = page == null ? 0 : Math.max(0, page);
        int s = size == null ? DEFAULT_SIZE : Math.max(1, Math.min(size, MAX_SIZE));
        List<ConOpportunityRow> rows = repo.findRows(view.orgId(), view.consultantId(), wanted, PageRequest.of(p, s));
        long total = repo.countRows(view.orgId(), view.consultantId(), wanted);
        return new ConOpportunityDTO.ListResponse(toDtos(view, rows), total);
    }

    @Transactional(readOnly = true)
    public ConOpportunityDTO get(OrgMembership me, Long id) {
        ConScope.View view = scope.read(me);
        return one(view, id);
    }

    // ---- transitions ---------------------------------------------------------------------------------------------------------

    /** ASSIGNED to VIEWED. Explicit (never a side effect of a GET). */
    @Transactional
    public ConOpportunityDTO viewed(OrgMembership me, Long id, String ifMatch) {
        ConScope.View view = scope.write(me);
        MktOpportunity opp = load(view, id, ifMatch);
        String from = opp.getState();
        if ("VIEWED".equals(from)) return one(view, id);
        if (!"ASSIGNED".equals(from)) throw illegal(from, "VIEWED");
        Instant now = clock.instant();
        opp.setState("VIEWED");
        opp.setViewedAt(now);
        save(opp, now);
        record(opp, "VIEWED", view, "viewed this opportunity", now);
        audit(me, "CONSULTANT_OPPORTUNITY_VIEWED", opp, "VIEWED");
        return one(view, id);
    }

    /** ASSIGNED, VIEWED, NEEDS_INFO to INTERESTED; DECLINED to INTERESTED while the job is open. */
    @Transactional
    public ConOpportunityDTO interest(OrgMembership me, Long id, String ifMatch) {
        ConScope.View view = scope.write(me);
        recordInterest(view, me, id, ifMatch);
        return one(view, id);
    }

    /**
     * The transition behind {@link #interest}, for a caller that already resolved the consultant (the consultant workspace's Assigned Opportunities page
     * gates with its own service, then writes the SAME record through this). Everything is org- and consultant-scoped by {@code view}.
     */
    @Transactional
    public void recordInterest(ConScope.View view, OrgMembership me, Long id, String ifMatch) {
        MktOpportunity opp = load(view, id, ifMatch);
        String from = opp.getState();
        if ("INTERESTED".equals(from)) return;
        if ("DECLINED".equals(from)) {
            ConOpportunityRow row = repo.findRow(view.orgId(), view.consultantId(), id).orElseThrow(OrgNotFoundException::new);
            if (!OPEN_JOB.contains(row.jobStatus())) throw OrgException.coded(409, "JOB_NOT_OPEN", "That job is not open any more.", Map.of());
        } else if (!"ASSIGNED".equals(from) && !"VIEWED".equals(from) && !"NEEDS_INFO".equals(from)) {
            throw illegal(from, "INTERESTED");
        } else {
            requireOpenJob(view, id);
        }
        Instant now = clock.instant();
        opp.setState("INTERESTED");
        opp.setInterest("INTERESTED");
        opp.setDeclineReason(null);
        opp.setDeclineNote(null);
        opp.setLastResponseAt(now);
        save(opp, now);
        record(opp, "INTERESTED", view, "is interested", now);
        audit(me, "CONSULTANT_OPPORTUNITY_INTERESTED", opp, "from " + from);
    }

    /** ASSIGNED, VIEWED, INTERESTED to NEEDS_INFO with the consultant's question (the marketer sees it on the activity feed). */
    @Transactional
    public ConOpportunityDTO requestInfo(OrgMembership me, Long id, String question, String ifMatch) {
        ConScope.View view = scope.write(me);
        String q = question == null ? "" : question.strip();
        if (q.isEmpty() || q.length() > QUESTION_MAX) throw validation("question", "must be 1 to " + QUESTION_MAX + " characters");
        SensitiveContent.check("question", "question", q);
        recordInfoRequest(view, me, id, q, false, ifMatch);
        return one(view, id);
    }

    /**
     * The transition behind {@link #requestInfo} for an already validated question (1 to {@value #QUESTION_MAX} characters, scanned). {@code reask} lets a
     * consultant who is already in NEEDS_INFO send a NEW question (the old question and its answer are replaced and the marketer is told again); without
     * it the same target is the usual no-op. The consultant workspace page passes {@code true}: pressing Need More Info twice must never lose the second question.
     */
    @Transactional
    public void recordInfoRequest(ConScope.View view, OrgMembership me, Long id, String question, boolean reask, String ifMatch) {
        MktOpportunity opp = load(view, id, ifMatch);
        String from = opp.getState();
        if ("NEEDS_INFO".equals(from) && !reask) return;
        if (!"NEEDS_INFO".equals(from) && !"ASSIGNED".equals(from) && !"VIEWED".equals(from) && !"INTERESTED".equals(from)) throw illegal(from, "NEEDS_INFO");
        requireOpenJob(view, id);
        Instant now = clock.instant();
        opp.setState("NEEDS_INFO");
        opp.setInfoRequest(question);
        opp.setInfoAnswer(null);
        opp.setLastResponseAt(now);
        save(opp, now);
        record(opp, "INFO_REQUESTED", view, "asked a question", now);
        audit(me, "CONSULTANT_OPPORTUNITY_INFO_REQUESTED", opp, "from " + from);
    }

    /** ASSIGNED, VIEWED, INTERESTED, NEEDS_INFO to DECLINED. The consultant's "no" is sovereign: no marketer action is needed or possible. */
    @Transactional
    public ConOpportunityDTO decline(OrgMembership me, Long id, String reason, String note, String ifMatch) {
        ConScope.View view = scope.write(me);
        String why = reason == null ? "" : reason.strip().toUpperCase(Locale.ROOT);
        if (!DECLINE_REASONS.contains(why)) throw validation("reason", "must be one of " + String.join(", ", DECLINE_REASONS));
        String n = note == null ? null : note.strip();
        if (n != null && n.length() > NOTE_MAX) throw validation("note", "must be at most " + NOTE_MAX + " characters");
        if (n != null && !n.isEmpty()) SensitiveContent.check("note", "note", n);
        recordDecline(view, me, id, why, n, ifMatch);
        return one(view, id);
    }

    /**
     * The transition behind {@link #decline} for an already validated reason code ({@link #DECLINE_REASONS}) and note (null or up to 300 characters, scanned).
     * The code is what the Opportunities board reads; the note is kept on the row and, cut to the event's 200 characters, on the activity feed.
     */
    @Transactional
    public void recordDecline(ConScope.View view, OrgMembership me, Long id, String reasonCode, String note, String ifMatch) {
        MktOpportunity opp = load(view, id, ifMatch);
        String from = opp.getState();
        if ("DECLINED".equals(from)) return;
        if (!BEFORE_APPLY.contains(from)) throw illegal(from, "DECLINED");
        String n = note == null || note.isBlank() ? null : note.strip();
        Instant now = clock.instant();
        opp.setState("DECLINED");
        opp.setInterest("NOT_INTERESTED");
        opp.setDeclineReason(reasonCode);
        opp.setDeclineNote(n);
        opp.setLastResponseAt(now);
        save(opp, now);
        String text = "declined (" + reasonCode + ")" + (n == null ? "" : ": " + n);
        record(opp, "DECLINED", view, text.length() > 200 ? text.substring(0, 200) : text, now);
        audit(me, "CONSULTANT_OPPORTUNITY_DECLINED", opp, reasonCode);
    }

    /**
     * Undo a decline: DECLINED back to ASSIGNED (what the consultant said is cleared, the history stays in the events) while the job is open. Any other
     * state is returned as it is (a no-op). Not part of the extension-facing matrix: the consultant workspace's page offers it as "Reopen".
     */
    @Transactional
    public void recordReopen(ConScope.View view, OrgMembership me, Long id, String ifMatch) {
        MktOpportunity opp = load(view, id, ifMatch);
        if (!"DECLINED".equals(opp.getState())) return;
        requireOpenJob(view, id);
        Instant now = clock.instant();
        opp.setState("ASSIGNED");
        opp.setInterest("NO_RESPONSE");
        opp.setDeclineReason(null);
        opp.setDeclineNote(null);
        opp.setInfoRequest(null);
        opp.setInfoAnswer(null);
        save(opp, now);
        record(opp, "REOPENED", view, "reopened this opportunity", now);
        audit(me, "CONSULTANT_OPPORTUNITY_REOPENED", opp, "from DECLINED");
    }

    /** "I applied": APPLIED, optionally tied to one of the caller's own tracked applications. */
    @Transactional
    public ConOpportunityDTO applied(OrgMembership me, Long id, Long applicationId, String ifMatch) {
        return markApplied(me, id, applicationId, ifMatch, false);
    }

    /** Tie one of the caller's tracked applications to the opportunity (APPLIED). {@code applicationId} is required. */
    @Transactional
    public ConOpportunityDTO link(OrgMembership me, Long id, Long applicationId, String ifMatch) {
        if (applicationId == null) {
            scope.write(me); // the gate first: a non-consultant gets the generic 404, never a hint about the body
            throw validation("applicationId", "is required");
        }
        return markApplied(me, id, applicationId, ifMatch, true);
    }

    /** End the live link, if any. The opportunity stays APPLIED (the consultant did apply); the projection stops following the application. */
    @Transactional
    public ConOpportunityDTO unlink(OrgMembership me, Long id, String ifMatch) {
        ConScope.View view = scope.write(me);
        MktOpportunity opp = load(view, id, ifMatch);
        MktPipelineApplicationLink live = links.findByOrgIdAndOpportunityIdAndUnlinkedAtIsNull(view.orgId(), id).orElse(null);
        if (live == null || !view.consultantId().equals(live.getConsultantId())) return one(view, id);
        Instant now = clock.instant();
        live.setUnlinkedAt(now);
        links.save(live);
        projection.detach(view.orgId(), live.getTalentApplicationId());
        touch(opp, now);
        record(opp, "UNLINKED", view, "unlinked the tracked application", now);
        audit(me, "CONSULTANT_OPPORTUNITY_UNLINKED", opp, "application " + live.getPersonalApplicationId());
        return one(view, id);
    }

    private ConOpportunityDTO markApplied(OrgMembership me, Long id, Long applicationId, String ifMatch, boolean explicitLink) {
        ConScope.View view = scope.write(me);
        recordApplied(view, me, id, applicationId, ifMatch, explicitLink);
        return one(view, id);
    }

    /** The "I applied" transition for a caller that already resolved the consultant (see {@link #recordInterest}). {@code applicationId} may be null. */
    @Transactional
    public void recordApplied(ConScope.View view, OrgMembership me, Long id, Long applicationId, String ifMatch, boolean explicitLink) {
        // Ownership first, before any state is looked at: someone else's application id is a plain 404 (IDOR), as is one that does not exist.
        Application app = applicationId == null ? null : applications.findOneByIdAndUserId(applicationId, view.userId()).orElseThrow(OrgNotFoundException::new);
        MktOpportunity opp = load(view, id, ifMatch);
        String from = opp.getState();
        MktPipelineApplicationLink live = links.findByOrgIdAndOpportunityIdAndUnlinkedAtIsNull(view.orgId(), id).orElse(null);
        if ("APPLIED".equals(from)) {
            if (app == null) return;
            if (live != null) {
                if (live.getPersonalApplicationId().equals(app.getId())) return;
                throw OrgException.coded(409, ALREADY_LINKED, "Another application is already linked to this opportunity. Unlink it first.", Map.of());
            }
        } else if (!BEFORE_APPLY.contains(from)) {
            throw illegal(from, "APPLIED");
        }
        boolean flip = !"APPLIED".equals(from);
        if (flip) requireOpenJob(view, id); // recording that they applied to a posting that is gone is not an action on an open job
        ShareScope consent = app == null ? null : shares.scopeOf(view.orgId(), view.memberId());
        if (!flip && consent != null && !consent.atLeast(ShareScope.SUMMARY)) return; // nothing to record: already applied, and no link is allowed
        Instant now = clock.instant();
        if (flip) {
            opp.setState("APPLIED");
            opp.setAppliedAt(app != null && app.getAppliedAt() != null ? app.getAppliedAt() : now);
            opp.setLastResponseAt(now);
        }
        save(opp, now);
        if (app == null) {
            record(opp, "APPLIED_UNLINKED", view, "says they applied (no tracked application linked)", now);
            audit(me, "CONSULTANT_OPPORTUNITY_APPLIED", opp, "from " + from + ", unlinked");
            return;
        }
        if (!consent.atLeast(ShareScope.SUMMARY)) {
            // Consent NONE (doc 60 section 0.3 c): the consultant's own "I applied" is recorded on the opportunity, but no link row ties the organization to
            // their personal application, and nothing is projected. The honest state is "applied, no application shown".
            record(opp, "APPLIED_UNLINKED", view, "says they applied (the application is not shared with the organization)", now);
            audit(me, "CONSULTANT_OPPORTUNITY_APPLIED", opp, "from " + from + ", unlinked (consent)");
            return;
        }
        MktPipelineApplicationLink created = new MktPipelineApplicationLink();
        created.setOrgId(view.orgId());
        created.setOpportunityId(opp.getId());
        created.setConsultantId(view.consultantId());
        created.setPersonalApplicationId(app.getId());
        created.setSource(MktPipelineApplicationLink.SOURCE_CONSULTANT);
        created.setLinkedAt(now);
        ConOpportunityRow row = repo.findRow(view.orgId(), view.consultantId(), id).orElseThrow(OrgNotFoundException::new);
        if (consent == ShareScope.FULL) {
            created.setTalentApplicationId(projection.upsert(view.orgId(), opp.getId(), row.jobId(), view.consultantId(), row.assignedByMemberId(), app.getId(), opp.getAppliedAt()));
        }
        links.save(created);
        record(opp, "APPLIED", view, flip ? "applied (tracked application linked)" : "linked a tracked application", now);
        audit(me, explicitLink && !flip ? "CONSULTANT_OPPORTUNITY_LINKED" : "CONSULTANT_OPPORTUNITY_APPLIED", opp, "from " + from + ", application " + app.getId());
    }

    // ---- allowed actions -----------------------------------------------------------------------------------------------------

    /** What the consultant may do next, from the state and the link. The page renders its buttons from this list and from nothing else. */
    public static List<String> allowedActions(String state, boolean linked, boolean jobOpen) {
        if (state == null) return List.of();
        return switch (state) {
            // while the job is not open only the two actions that do not act on the posting stay: mark it seen and say no
            case "ASSIGNED" -> jobOpen ? List.of("VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", "LINK") : List.of("VIEWED", "DECLINE");
            case "VIEWED" -> jobOpen ? List.of("INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", "LINK") : List.of("DECLINE");
            case "INTERESTED" -> jobOpen ? List.of("DECLINE", "REQUEST_INFO", "APPLIED", "LINK") : List.of("DECLINE");
            case "NEEDS_INFO" -> jobOpen ? List.of("INTEREST", "DECLINE", "APPLIED", "LINK") : List.of("DECLINE");
            case "DECLINED" -> jobOpen ? List.of("INTEREST") : List.of();
            case "APPLIED" -> List.of(linked ? "UNLINK" : "LINK");
            default -> List.of();
        };
    }

    // ---- internals -----------------------------------------------------------------------------------------------------------

    /** 409 {@code JOB_NOT_OPEN} unless the opportunity's job is OPEN or IN_REVIEW. */
    private void requireOpenJob(ConScope.View view, Long id) {
        ConOpportunityRow row = repo.findRow(view.orgId(), view.consultantId(), id).orElseThrow(OrgNotFoundException::new);
        if (!OPEN_JOB.contains(row.jobStatus())) throw OrgException.coded(409, "JOB_NOT_OPEN", "That job is not open any more.", Map.of());
    }

    private MktOpportunity load(ConScope.View view, Long id, String ifMatch) {
        if (id == null) throw new OrgNotFoundException();
        MktOpportunity opp = repo.findOwned(view.orgId(), view.consultantId(), id).orElseThrow(OrgNotFoundException::new);
        Long expected = parseIfMatch(ifMatch);
        if (expected != null && expected != opp.getVersion()) {
            throw OrgException.coded(409, "VERSION_CONFLICT", "This was changed by someone else. Reload and try again.", Map.of("version", opp.getVersion()));
        }
        return opp;
    }

    static Long parseIfMatch(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) return null;
        String v = ifMatch.strip();
        if (v.startsWith("W/")) v = v.substring(2);
        v = v.replace("\"", "").strip();
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            throw validation("If-Match", "must be the version number of the opportunity");
        }
    }

    private void save(MktOpportunity opp, Instant now) {
        opp.setUpdatedAt(now);
        opportunities.save(opp);
    }

    private void touch(MktOpportunity opp, Instant now) {
        opp.setUpdatedAt(now);
        opportunities.save(opp);
    }

    private void record(MktOpportunity opp, String kind, ConScope.View view, String text, Instant now) {
        MktOpportunityEvent e = new MktOpportunityEvent();
        e.setOrgId(opp.getOrgId());
        e.setOpportunityId(opp.getId());
        e.setKind(kind);
        e.setActorMemberId(view.memberId());
        e.setText(text);
        e.setOccurredAt(now);
        events.save(e);
    }

    private void audit(OrgMembership me, String action, MktOpportunity opp, String details) {
        audit.record(me, action, "OPPORTUNITY", null, String.valueOf(opp.getId()), details);
    }

    /** 400 {@code VALIDATION} with the field named (the contract's code for a bad value, like {@code UrlKeys.requireAllowed}). */
    private static OrgException validation(String field, String message) {
        return OrgException.coded(400, "VALIDATION", field + ": " + message, Map.of("field", field));
    }

    private static OrgException illegal(String from, String to) {
        return OrgException.coded(409, ILLEGAL_TRANSITION, "That is not possible from the opportunity's current state.", Map.of("state", from, "target", to));
    }

    private static Set<String> parseStates(String csv) {
        if (csv == null || csv.isBlank()) return new LinkedHashSet<>(STATES);
        Set<String> out = new LinkedHashSet<>();
        for (String part : csv.split(",")) {
            String s = part.strip().toUpperCase(Locale.ROOT);
            if (s.isEmpty()) continue;
            if (!STATES.contains(s)) throw validation("state", "must be a comma list of " + String.join(", ", STATES));
            out.add(s);
        }
        return out.isEmpty() ? new LinkedHashSet<>(STATES) : out;
    }

    /** The hashes a page URL may be stored under: with the external id (a LinkedIn collection page) and without. */
    private static Set<String> urlHashes(String url, String externalJobId) {
        Set<String> out = new LinkedHashSet<>();
        String a = UrlKeys.keyHash(url.strip(), externalJobId == null || externalJobId.isBlank() ? null : externalJobId.strip());
        String b = UrlKeys.keyHash(url.strip(), null);
        if (a != null) out.add(a);
        if (b != null) out.add(b);
        return out;
    }

    private ConOpportunityDTO one(ConScope.View view, Long id) {
        ConOpportunityRow row = repo.findRow(view.orgId(), view.consultantId(), id).orElseThrow(OrgNotFoundException::new);
        return toDtos(view, List.of(row)).get(0);
    }

    private List<ConOpportunityDTO> toDtos(ConScope.View view, List<ConOpportunityRow> rows) {
        if (rows.isEmpty()) return List.of();
        Long orgId = view.orgId();
        Set<Long> jobIds = new HashSet<>();
        Set<Long> oppIds = new HashSet<>();
        Set<Long> markerIds = new HashSet<>();
        for (ConOpportunityRow r : rows) {
            jobIds.add(r.jobId());
            oppIds.add(r.opportunityId());
            if (r.assignedByMemberId() != null) markerIds.add(r.assignedByMemberId());
        }
        Map<Long, List<String>> skillsOf = new HashMap<>();
        skills.findByOrgIdAndRequirementIdIn(orgId, jobIds).stream()
            .sorted(Comparator.comparing((RequirementSkill s) -> s.getSortOrder() == null ? 0 : s.getSortOrder()).thenComparing(RequirementSkill::getId, Comparator.nullsLast(Comparator.naturalOrder())))
            .forEach(s -> skillsOf.computeIfAbsent(s.getRequirementId(), k -> new ArrayList<>()).add(s.getSkill()));
        Map<Long, Long> linkedApp = new HashMap<>();
        for (MktPipelineApplicationLink l : repo.findLiveLinks(orgId, view.consultantId(), oppIds)) linkedApp.put(l.getOpportunityId(), l.getPersonalApplicationId());
        Map<Long, String> names = memberNames(orgId, markerIds);
        String cap = detailCap.capFor(orgId); // read once per call; raising or lowering the cap takes effect at once
        List<ConOpportunityDTO> out = new ArrayList<>();
        for (ConOpportunityRow r : rows) {
            boolean linked = linkedApp.containsKey(r.opportunityId());
            out.add(new ConOpportunityDTO(
                r.opportunityId(),
                r.state(),
                jobs.job(r, skillsOf.get(r.jobId()), cap),
                r.marketerNote(),
                r.assignedByMemberId() == null ? null : new ConOpportunityDTO.AssignedBy(r.assignedByMemberId(), names.get(r.assignedByMemberId())),
                r.assignedAt(),
                r.priority(),
                r.dueOn(),
                r.infoRequest(),
                r.infoAnswer(),
                r.appliedAt(),
                linkedApp.get(r.opportunityId()),
                allowedActions(r.state(), linked, OPEN_JOB.contains(r.jobStatus())),
                r.version()
            ));
        }
        return out;
    }

    private Map<Long, String> memberNames(Long orgId, Set<Long> memberIds) {
        if (memberIds.isEmpty()) return Map.of();
        Map<Long, Long> userOf = new HashMap<>();
        for (OrgMember m : members.findByOrgIdAndIdIn(orgId, memberIds)) if (m.getUserId() != null) userOf.put(m.getId(), m.getUserId());
        Map<Long, String> byUser = new HashMap<>();
        for (User u : users.findAllById(userOf.values())) {
            String full = ((u.getFirstName() == null ? "" : u.getFirstName().trim()) + " " + (u.getLastName() == null ? "" : u.getLastName().trim())).trim();
            if (!full.isEmpty()) byUser.put(u.getId(), full);
        }
        Map<Long, String> out = new HashMap<>();
        userOf.forEach((memberId, userId) -> {
            String n = byUser.get(userId);
            if (n != null) out.put(memberId, n);
        });
        return out;
    }
}
