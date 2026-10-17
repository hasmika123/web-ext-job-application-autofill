package com.dossier.api.service.ent.mkt.opportunities;

import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktEventRow;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.ent.mkt.MktResumeFact;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.domain.ent.consultantws.CwsNotification;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationGenerator;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.*;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
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
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Opportunities page of the Marketing workspace ({@code /api/orgs/{orgId}/mkt/opportunities}, permission {@code opportunities.manage}).
 *
 * <p>An opportunity is a {@code requirement_match} row that is ASSIGNED or SUGGESTED for a job that is still open. Everything is filtered by
 * {@link MktScope.View#sees}: a consultant outside the caller's scope never appears and a write on one answers the generic 404.
 *
 * <p><b>E1:</b> a marketer prepares, requests and records; the consultant answers and submits. "Assign" moves a suggested match to ASSIGNED and
 * asks the consultant for their interest; "Follow up" asks again (or asks for a resume update); nothing here sets {@code interest} (the consultant
 * does, on their own workspace), submits an application, or signs in as anyone.
 */
@Service
public class MktOpportunitiesService {

    public static final String PERMISSION = "opportunities.manage";
    public static final int STALE_DAYS = 14;
    public static final int RESUME_STALE_DAYS = 120;
    public static final int DEFAULT_SIZE = 8;
    public static final int MAX_SIZE = 100;
    public static final int MAX_BULK = 50;
    public static final int REASON_MAX = 200;
    static final int SPARK_WEEKS = 8;
    static final Duration NOTIFY_COOLDOWN = Duration.ofHours(24);
    static final Duration DEDUPE = Duration.ofHours(1);

    public static final List<String> INTERESTS = List.of("VERY_INTERESTED", "INTERESTED", "OPEN", "NOT_INTERESTED", "NO_RESPONSE");
    private static final Map<String, String> INTEREST_LABEL = Map.of(
        "VERY_INTERESTED", "Very Interested", "INTERESTED", "Interested", "OPEN", "Open", "NOT_INTERESTED", "Not Interested", "NO_RESPONSE", "No Response"
    );
    private static final Set<String> OPEN_JOB = Set.of("OPEN", "IN_REVIEW");
    private static final Set<String> SORTS = Set.of("recent", "score", "consultant", "client", "next");

    /** The list's filters (all optional). {@code days} 0 = any time. */
    public record Query(String q, Long consultantId, Long clientId, String interest, Integer minScore, int days, boolean stale, boolean ready, String sort, boolean desc, int page, int size, int responseDays) {
        public static Query defaults() {
            return new Query(null, null, null, null, null, 30, false, false, "recent", true, 0, DEFAULT_SIZE, 30);
        }
    }

    /** A row plus everything derived from it. */
    record Row(MktOpportunityRow r, String interest, String resume, boolean approvedResume, Instant last, boolean open, boolean stale, boolean ready, String action, Long ownerId) {
        Long id() { return r.matchId(); }
    }

    private final MktScope scope;
    private final OpportunityAssignmentService assignment;
    private final MktOpportunityRepository repo;
    private final MktOpportunityEventRepository events;
    private final RequirementMatchRepository matches;
    private final ConsultantProfileRepository consultants;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final ConsultantSkillRepository consultantSkills;
    private final RequirementSkillRepository requirementSkills;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgAuditService audit;
    private final Clock clock;
    private ConsultantNotificationGenerator notifier;

    @Autowired
    public MktOpportunitiesService(
        MktScope scope, OpportunityAssignmentService assignment, MktOpportunityRepository repo, MktOpportunityEventRepository events, RequirementMatchRepository matches, ConsultantProfileRepository consultants,
        ClientRequirementRepository requirements, ClientAccountRepository clients, ConsultantSkillRepository consultantSkills, RequirementSkillRepository requirementSkills,
        OrgMemberRepository members, UserRepository users, OrgAuditService audit
    ) {
        this(scope, assignment, repo, events, matches, consultants, requirements, clients, consultantSkills, requirementSkills, members, users, audit, Clock.systemUTC());
    }

    MktOpportunitiesService(
        MktScope scope, OpportunityAssignmentService assignment, MktOpportunityRepository repo, MktOpportunityEventRepository events, RequirementMatchRepository matches, ConsultantProfileRepository consultants,
        ClientRequirementRepository requirements, ClientAccountRepository clients, ConsultantSkillRepository consultantSkills, RequirementSkillRepository requirementSkills,
        OrgMemberRepository members, UserRepository users, OrgAuditService audit, Clock clock
    ) {
        this.scope = scope;
        this.assignment = assignment;
        this.repo = repo;
        this.events = events;
        this.matches = matches;
        this.consultants = consultants;
        this.requirements = requirements;
        this.clients = clients;
        this.consultantSkills = consultantSkills;
        this.requirementSkills = requirementSkills;
        this.members = members;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    /** The consultant's notification feed (withdraw and reassign tell the consultant). Optional so the plain-constructor unit tests need no feed. */
    @Autowired(required = false)
    void setNotifier(ConsultantNotificationGenerator notifier) {
        this.notifier = notifier;
    }

    // ---- reads ----------------------------------------------------------------------------------------------------------------

    /** The whole board in one call: KPIs, the filtered page of rows, the three lower cards and the filter options. */
    @Transactional(readOnly = true)
    public ListResponse list(OrgMembership me, Query query) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Query q = sanitize(query);
        Instant now = clock.instant();
        List<Row> all = model(view, now);
        List<Row> open = all.stream().filter(Row::open).toList();
        if (q.consultantId() != null) scope.require(view, q.consultantId());

        List<Row> filtered = filter(open, q, now);
        filtered = sort(filtered, q);
        int from = Math.min(q.page() * q.size(), filtered.size());
        List<Row> pageRows = filtered.subList(from, Math.min(from + q.size(), filtered.size()));

        List<MktEventRow> feed = recentFeed(view, 5);
        Set<Long> memberIds = new HashSet<>();
        pageRows.forEach(r -> memberIds.add(r.ownerId()));
        feed.forEach(f -> memberIds.add(f.actorMemberId()));
        Map<Long, String> names = memberNames(view.orgId(), memberIds);

        List<Item> items = pageRows.stream().map(r -> item(r, names, now)).toList();
        return new ListResponse(kpis(open, now), items, filtered.size(), q.page(), q.size(), topMatches(open), responses(open, q.responseDays(), now), activity(feed), filters(open));
    }

    /** One opportunity, the same consultant's other open opportunities (the Compare view) and its timeline. */
    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, Long id) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        Row row = require(view, id, now);
        List<Row> alternatives = model(view, now).stream()
            .filter(r -> r.open() && r.r().consultantId().equals(row.r().consultantId()) && !r.id().equals(id))
            .sorted(Comparator.comparingInt((Row r) -> r.r().score()).reversed())
            .limit(5)
            .toList();
        List<MktEventRow> timeline = events.forMatch(view.orgId(), id, PageRequest.of(0, 10));
        Set<Long> ids = new HashSet<>();
        ids.add(row.ownerId());
        alternatives.forEach(a -> ids.add(a.ownerId()));
        timeline.forEach(t -> ids.add(t.actorMemberId()));
        Map<Long, String> names = memberNames(view.orgId(), ids);
        Info info = repo.findByOrgIdAndMatchId(view.orgId(), id)
            .filter(o -> o.getInfoRequest() != null && !o.getInfoRequest().isBlank())
            .map(o -> new Info(o.getInfoRequest(), o.getInfoAnswer(), "NEEDS_INFO".equals(o.getState()) && "ASSIGNED".equals(row.r().matchStatus())))
            .orElse(null);
        return new Detail(item(row, names, now), alternatives.stream().map(a -> item(a, names, now)).toList(), activity(timeline), info);
    }

    /** Consultants the caller may see and open jobs, for the Add Opportunity dialog. */
    @Transactional(readOnly = true)
    public Options options(OrgMembership me, String q) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        List<ConsultantOption> people = consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(view.orgId(), "ACTIVE").stream()
            .filter(c -> view.sees(c.getId()))
            .filter(c -> needle.isEmpty() || c.getDisplayName().toLowerCase(Locale.ROOT).contains(needle))
            .limit(100)
            .map(c -> new ConsultantOption(c.getId(), c.getDisplayName(), OpportunityAssignmentService.pausedReason(c)))
            .toList();
        Map<Long, String> clientNames = new HashMap<>();
        for (ClientAccount a : clients.findByOrgId(view.orgId())) clientNames.put(a.getId(), a.getName());
        List<JobOption> jobs = requirements.findByOrgIdAndStatusOrderByPostedAtDesc(view.orgId(), "OPEN").stream()
            .filter(j -> needle.isEmpty() || j.getTitle().toLowerCase(Locale.ROOT).contains(needle) || clientNames.getOrDefault(j.getClientId(), "").toLowerCase(Locale.ROOT).contains(needle))
            .limit(100)
            .map(j -> new JobOption(j.getId(), j.getTitle(), clientNames.get(j.getClientId()), j.getLocation()))
            .toList();
        return new Options(people, jobs);
    }

    /** The caller's visible rows under the list's filters as CSV (no emails, no phone numbers: names and job facts only). */
    @Transactional
    public String exportCsv(OrgMembership me, Query query) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Query q = sanitize(query);
        Instant now = clock.instant();
        if (q.consultantId() != null) scope.require(view, q.consultantId());
        List<Row> rows = sort(filter(model(view, now).stream().filter(Row::open).toList(), q, now), q);
        Set<Long> ids = new HashSet<>();
        rows.forEach(r -> ids.add(r.ownerId()));
        Map<Long, String> names = memberNames(view.orgId(), ids);
        StringBuilder sb = new StringBuilder("Consultant,Job Title,Client,Location,Match Score,Consultant Interest,Resume Status,Owner,Next Action,Status,Last Activity\r\n");
        for (Row r : rows) {
            sb.append(csv(r.r().consultantName())).append(',').append(csv(r.r().jobTitle())).append(',').append(csv(r.r().clientName())).append(',')
                .append(csv(r.r().location())).append(',').append(r.r().score()).append(',').append(csv(INTEREST_LABEL.get(r.interest()))).append(',')
                .append(csv("UPDATED".equals(r.resume()) ? "Updated" : "Needs Update")).append(',').append(csv(r.ownerId() == null ? "" : names.getOrDefault(r.ownerId(), ""))).append(',')
                .append(csv(r.r().nextActionAt() == null ? "" : r.r().nextActionAt().toString())).append(',').append(csv(r.r().matchStatus())).append(',')
                .append(csv(r.last().toString())).append("\r\n");
        }
        audit.record(me, "EXPORT", "MKT_OPPORTUNITIES", null, null, rows.size() + " rows");
        return sb.toString();
    }

    // ---- writes (E1: all of these prepare or request; none answers for the consultant or submits) ------------------------------------

    /** Add an opportunity: a consultant of the caller's scope and an open job become a SUGGESTED match (or reopen a dismissed one). */
    @Transactional
    public ActionResult create(OrgMembership me, Long consultantId, Long requirementId) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        if (consultantId == null || requirementId == null) throw OrgException.coded(400, "VALIDATION", "Choose a consultant and a job.", Map.of());
        scope.require(view, consultantId);
        Instant now = clock.instant();
        OpportunityAssignmentService.Options options = OpportunityAssignmentService.Options.none()
            .withNewMatch(() -> overlapScore(view.orgId(), consultantId, requirementId), "Added by a marketer", "MANUAL")
            .withAudit(new OpportunityAssignmentService.Audit("MARKETER_OPPORTUNITY_CREATE", "OPPORTUNITY", null, r -> "consultant " + consultantId + ", job " + requirementId));
        OpportunityAssignmentService.Result added = assignment.suggest(view, me, requirementId, consultantId, options);
        if (added.existing()) {
            throw OrgException.coded(409, "OPPORTUNITY_EXISTS", "That consultant already has this opportunity.", Map.of("opportunityId", added.matchId()));
        }
        return result(view, added.matchId(), "Opportunity added.", true, now, true);
    }

    /** SUGGESTED to ASSIGNED, then ask the consultant for their interest. Needs an approved resume (the approval gate of 31 section 4). */
    @Transactional
    public ActionResult assign(OrgMembership me, Long id) {
        return assign(me, id, DuplicateGuard.Confirm.NONE);
    }

    /** {@link #assign(OrgMembership, Long)} with the answer to a duplicate warning (Sprint 2 / B1). */
    @Transactional
    public ActionResult assign(OrgMembership me, Long id, DuplicateGuard.Confirm confirm) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        Row row = require(view, id, now);
        OpportunityAssignmentService.Audit auditRow = new OpportunityAssignmentService.Audit("MARKETER_OPPORTUNITY_ASSIGN", "OPPORTUNITY", String.valueOf(id), r -> "consultant " + row.r().consultantId());
        String why = assignOne(view, me, row, auditRow, confirm, true);
        if (why != null) throw assignError(why);
        return result(view, id, "Assigned. " + row.r().consultantName() + " was asked for their interest.", true, now);
    }

    /** Assign several ready opportunities; the ones that cannot be assigned come back with a code instead of failing the batch. */
    @Transactional
    public BulkResult bulkAssign(OrgMembership me, List<Long> ids) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        if (ids == null || ids.isEmpty()) throw OrgException.coded(400, "VALIDATION", "Choose at least one opportunity.", Map.of());
        if (ids.size() > MAX_BULK) throw OrgException.coded(400, "TOO_MANY", "Assign at most " + MAX_BULK + " at a time.", Map.of("max", MAX_BULK));
        Instant now = clock.instant();
        Map<Long, Row> byId = new HashMap<>();
        for (Row r : model(view, now)) byId.put(r.id(), r);
        List<Skipped> skipped = new ArrayList<>();
        int done = 0;
        for (Long id : new LinkedHashSet<>(ids)) {
            Row row = byId.get(id);
            if (row == null) {
                skipped.add(new Skipped(id, "NOT_FOUND"));
                continue;
            }
            String why = assignOne(view, me, row, null, DuplicateGuard.Confirm.NONE, false); // one audit row for the whole batch, below
            if (why == null) done++;
            else skipped.add(new Skipped(id, why));
        }
        if (done > 0) audit.record(me, "MARKETER_OPPORTUNITY_BULK_ASSIGN", "OPPORTUNITY", null, null, done + " assigned");
        return new BulkResult(done, skipped, done == 1 ? "Assigned 1 opportunity." : "Assigned " + done + " opportunities.");
    }

    /**
     * Ask the consultant for their interest (kind INTEREST) or for an updated resume (kind RESUME). It only records the request and moves the
     * next action; the consultant answers on their own workspace. The same request within an hour is not recorded twice.
     */
    @Transactional
    public ActionResult requestFromConsultant(OrgMembership me, Long id, String kind) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        Row row = require(view, id, now);
        String k = kind == null ? "" : kind.trim().toUpperCase(Locale.ROOT);
        if (!k.equals("INTEREST") && !k.equals("RESUME")) throw OrgException.coded(400, "VALIDATION", "Ask for INTEREST or RESUME.", Map.of());
        if (k.equals("INTEREST")) {
            if (!"ASSIGNED".equals(row.r().matchStatus())) throw OrgException.coded(409, "NOT_ASSIGNED", "Assign the opportunity first.", Map.of());
            if (!row.interest().equals("NO_RESPONSE") && !row.interest().equals("OPEN")) {
                throw OrgException.coded(409, "ALREADY_ANSWERED", "The consultant has already answered.", Map.of());
            }
        }
        String eventKind = k.equals("INTEREST") ? "INTEREST_REQUESTED" : "RESUME_REQUESTED";
        MktOpportunity opp = ensure(view, id, row.r().assignedMarketerId() != null ? row.r().assignedMarketerId() : me.memberId(), now);
        boolean repeat = events.findByOrgIdAndOpportunityIdOrderByOccurredAtDesc(view.orgId(), opp.getId()).stream()
            .anyMatch(e -> e.getKind().equals(eventKind) && Duration.between(e.getOccurredAt(), now).compareTo(DEDUPE) < 0);
        if (repeat) return result(view, id, "Already requested a moment ago.", false, now);
        requestOne(opp, eventKind, me.memberId(), now);
        audit.record(me, "MARKETER_OPPORTUNITY_REQUEST", "OPPORTUNITY", null, String.valueOf(id), eventKind);
        String msg = k.equals("INTEREST") ? "Asked " + row.r().consultantName() + " for their interest." : "Asked " + row.r().consultantName() + " to update their resume.";
        return result(view, id, msg, true, now);
    }

    /** Ask every consultant who has not answered yet (assigned opportunities, not asked in the last 24 hours). */
    @Transactional
    public BulkResult notifyAwaiting(OrgMembership me) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        int done = 0;
        int skippedCount = 0;
        for (Row r : model(view, now)) {
            if (!r.open() || !"ASSIGNED".equals(r.r().matchStatus()) || !(r.interest().equals("NO_RESPONSE") || r.interest().equals("OPEN"))) continue;
            Instant asked = r.r().interestRequestedAt();
            if (asked != null && Duration.between(asked, now).compareTo(NOTIFY_COOLDOWN) < 0) {
                skippedCount++;
                continue;
            }
            MktOpportunity opp = ensure(view, r.id(), r.r().assignedMarketerId() != null ? r.r().assignedMarketerId() : me.memberId(), now);
            requestOne(opp, "INTEREST_REQUESTED", me.memberId(), now);
            done++;
        }
        if (done > 0) audit.record(me, "MARKETER_OPPORTUNITY_NOTIFY", "OPPORTUNITY", null, null, done + " requests");
        String msg = done == 0 ? "Everyone has been asked already." : "Asked " + done + (done == 1 ? " consultant" : " consultants") + " for their interest.";
        return new BulkResult(done, skippedCount == 0 ? List.of() : List.of(new Skipped(null, "ASKED_RECENTLY")), msg);
    }

    /** The marketer looked it over (readiness, resume, client): recorded on the timeline. */
    @Transactional
    public ActionResult review(OrgMembership me, Long id) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        Row row = require(view, id, now);
        MktOpportunity opp = ensure(view, id, row.r().assignedMarketerId() != null ? row.r().assignedMarketerId() : me.memberId(), now);
        record(opp, "REVIEWED", me.memberId(), "reviewed opportunity", now);
        opp.setUpdatedAt(now);
        repo.save(opp);
        audit.record(me, "MARKETER_OPPORTUNITY_REVIEW", "OPPORTUNITY", null, String.valueOf(id), "consultant " + row.r().consultantId());
        return result(view, id, "Marked as reviewed.", true, now);
    }

    /** Move (or clear) the next action date. */
    @Transactional
    public ActionResult setNextAction(OrgMembership me, Long id, Instant at) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        Row row = require(view, id, now);
        if (at != null && (at.isAfter(now.plus(Duration.ofDays(365))) || at.isBefore(now.minus(Duration.ofDays(30))))) {
            throw OrgException.coded(400, "VALIDATION", "Pick a date within the next year.", Map.of());
        }
        MktOpportunity opp = ensure(view, id, row.r().assignedMarketerId() != null ? row.r().assignedMarketerId() : me.memberId(), now);
        opp.setNextActionAt(at);
        opp.setUpdatedAt(now);
        repo.save(opp);
        audit.record(me, "MARKETER_OPPORTUNITY_NEXT_ACTION", "OPPORTUNITY", null, String.valueOf(id), at == null ? "cleared" : "set");
        return result(view, id, at == null ? "Next action cleared." : "Next action updated.", true, now);
    }

    /**
     * MKT-44: the marketer takes an assignment back. The opportunity becomes CLOSED with reason WITHDRAWN and the marketer's reason text (required, at most
     * 200 characters, PII-scanned) is kept on the timeline and the audit row. The consultant is told on their own notification feed (the existing
     * Job Match kind). 409 {@code NOT_ASSIGNED} when the row was never assigned, 409 {@code ILLEGAL_TRANSITION} when the consultant already declined or
     * applied or it is closed. Prepares nothing else: it never answers or submits for anyone (E1).
     */
    @Transactional
    public ActionResult withdraw(OrgMembership me, Long id, String reason) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        String text = reason == null ? "" : reason.strip();
        if (text.isEmpty() || text.length() > REASON_MAX) throw OrgException.coded(400, "VALIDATION", "reason: enter 1 to " + REASON_MAX + " characters", Map.of("field", "reason"));
        SensitiveContent.check("reason", "reason", text);
        Instant now = clock.instant();
        MktOpportunityRow raw = repo.findRow(view.orgId(), id).orElseThrow(OrgNotFoundException::new);
        scope.require(view, raw.consultantId());
        if (raw.oppId() == null || !"ASSIGNED".equals(raw.matchStatus())) throw OrgException.coded(409, "NOT_ASSIGNED", "Only an assigned opportunity can be withdrawn.", Map.of());
        assignment.withdraw(view, me, raw.oppId(), text); // writes the one MARKETER_OPPORTUNITY_WITHDRAW audit row (with the reason) and the CLOSED event
        if (notifier != null) {
            String body = (raw.jobTitle() == null ? "An opportunity" : raw.jobTitle()) + " was withdrawn by your marketer: " + text;
            notifier.push(view.orgId(), raw.consultantId(), "withdrawn:" + raw.oppId() + ":" + now.getEpochSecond(), CwsNotification.JOB_MATCH, "Opportunity Withdrawn", body.length() > 300 ? body.substring(0, 300) : body,
                CwsNotification.MEDIUM, "View", "/w/consultant/opportunities", "OPPORTUNITY", id);
        }
        return result(view, id, "Withdrawn. " + raw.consultantName() + " was told.", true, now);
    }

    /**
     * MKT-44: a declined (or withdrawn) opportunity is offered to ANOTHER consultant of the caller's scope, through the one assignment path (same gates:
     * job open, active consultant, approved resume). The old row stays as the consultant left it; its timeline records where the job went. 409
     * {@code NOT_REASSIGNABLE} for any other state, 404 for a consultant outside the caller's scope. Answers the NEW row. The new consultant sees it in
     * their feed as "Opportunity Awaiting Your Response" (a pair that is reopened gets that notice pushed, because its old one is already closed).
     */
    @Transactional
    public ActionResult reassign(OrgMembership me, Long id, Long toConsultantId) {
        return reassign(me, id, toConsultantId, DuplicateGuard.Confirm.NONE);
    }

    /** {@link #reassign(OrgMembership, Long, Long)} with the answer to a duplicate warning (Sprint 2 / B1). */
    @Transactional
    public ActionResult reassign(OrgMembership me, Long id, Long toConsultantId, DuplicateGuard.Confirm confirm) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        if (toConsultantId == null) throw OrgException.coded(400, "VALIDATION", "Choose a consultant.", Map.of("field", "consultantId"));
        Instant now = clock.instant();
        MktOpportunityRow raw = repo.findRow(view.orgId(), id).orElseThrow(OrgNotFoundException::new);
        scope.require(view, raw.consultantId());
        if (toConsultantId.equals(raw.consultantId())) throw OrgException.coded(400, "VALIDATION", "Choose a different consultant.", Map.of("field", "consultantId"));
        scope.require(view, toConsultantId);
        MktOpportunity opp = raw.oppId() == null ? null : repo.findByOrgIdAndId(view.orgId(), raw.oppId()).orElse(null);
        boolean declined = opp != null && "DECLINED".equals(opp.getState());
        boolean withdrawn = opp != null && "CLOSED".equals(opp.getState()) && OpportunityAssignmentService.CLOSED_WITHDRAWN.equals(opp.getClosedReason());
        if (!declined && !withdrawn) throw OrgException.coded(409, "NOT_REASSIGNABLE", "Only a declined or withdrawn opportunity can be offered to someone else.", Map.of());
        if (!OPEN_JOB.contains(raw.requirementStatus())) throw OrgException.coded(409, "JOB_NOT_OPEN", "That job is not open.", Map.of());
        String toName = consultants.findByOrgIdAndId(view.orgId(), toConsultantId).map(c -> c.getDisplayName()).orElseThrow(OrgNotFoundException::new);
        OpportunityAssignmentService.Audit auditRow = new OpportunityAssignmentService.Audit("MARKETER_OPPORTUNITY_REASSIGN", "OPPORTUNITY", String.valueOf(id), r -> "from consultant " + raw.consultantId() + " to consultant " + toConsultantId);
        OpportunityAssignmentService.Result assigned =
            assignment.assign(view, me, raw.requirementId(), toConsultantId, OpportunityAssignmentService.Options.none().withOwner(me.memberId()).askingInterest().confirmingDuplicate(confirm).withAudit(auditRow));
        if (assigned.refused()) throw assignError(assigned.reason());
        if (assigned.existing()) throw assignError("ALREADY_ASSIGNED");
        record(opp, "OFFERED_ELSEWHERE", me.memberId(), "was offered to " + toName + " instead", now);
        if (notifier != null && assigned.reopened()) {
            String job = raw.jobTitle() == null ? "An opportunity" : raw.jobTitle();
            notifier.push(view.orgId(), toConsultantId, "reassigned:" + assigned.matchId() + ":" + now.getEpochSecond(), CwsNotification.JOB_MATCH, "Opportunity Awaiting Your Response",
                job + " was assigned to you. Let your marketer know if you are interested.", CwsNotification.MEDIUM, "Respond", "/w/consultant/opportunities", "OPPORTUNITY", assigned.matchId());
        }
        return result(view, assigned.matchId(), "Offered to " + toName + ". They were asked for their interest.", true, now, true);
    }

    // ---- internals --------------------------------------------------------------------------------------------------------------

    /** Null when assigned; otherwise the reason code. The pair rules and every gate live in {@link OpportunityAssignmentService}. */
    private String assignOne(MktScope.View view, OrgMembership me, Row row, OpportunityAssignmentService.Audit auditRow, DuplicateGuard.Confirm confirm, boolean single) {
        if (!row.open()) return "JOB_NOT_OPEN";
        Long owner = row.r().assignedMarketerId() != null ? row.r().assignedMarketerId() : me.memberId();
        OpportunityAssignmentService.Result assigned;
        try {
            assigned = assignment.assign(view, me, row.r().requirementId(), row.r().consultantId(), OpportunityAssignmentService.Options.none().withOwner(owner).askingInterest().confirmingDuplicate(confirm).withAudit(auditRow));
        } catch (OrgException refused) {
            if (single && GUARD_CODES.contains(refused.getCode())) throw refused; // the duplicate and cap answers carry their findings: the single call raises them as they are
            return refused.getCode(); // JOB_NOT_OPEN, RESUME_NOT_APPROVED, NOT_FOUND: the batch reports it, the single call raises it
        }
        if (assigned.refused()) return assigned.reason();
        return assigned.existing() ? "ALREADY_ASSIGNED" : null;
    }

    private static final Set<String> GUARD_CODES = Set.of(DuplicateGuard.CODE_WARNING, DuplicateGuard.CODE_BLOCKED, DuplicateGuard.CODE_CAP);

    private static OrgException assignError(String code) {
        return switch (code) {
            case "ALREADY_ASSIGNED" -> OrgException.coded(409, code, "This opportunity is already assigned.", Map.of());
            case "RESUME_NOT_APPROVED" -> OrgException.coded(409, code, "The consultant needs an approved resume before this can be assigned.", Map.of());
            case "JOB_NOT_OPEN" -> OrgException.coded(409, code, "That job is not open.", Map.of());
            case OpportunityAssignmentService.CONSULTANT_PAUSED -> OrgException.coded(409, code, "This consultant is on a project and their marketing is paused, so nothing can be assigned.", Map.of());
            case OpportunityAssignmentService.CONSULTANT_INACTIVE -> OrgException.coded(409, code, "That consultant is not active, so nothing can be assigned.", Map.of());
            default -> new OrgNotFoundException();
        };
    }

    private void requestOne(MktOpportunity opp, String eventKind, Long actor, Instant now) {
        if ("INTEREST_REQUESTED".equals(eventKind)) opp.setInterestRequestedAt(now);
        opp.setNextActionAt(now.plus(Duration.ofDays("INTEREST_REQUESTED".equals(eventKind) ? 3 : 2)));
        opp.setUpdatedAt(now);
        repo.save(opp);
        record(opp, eventKind, actor, "INTEREST_REQUESTED".equals(eventKind) ? "was asked for their interest" : "was asked to update their resume", now);
    }

    private MktOpportunity ensure(MktScope.View view, Long matchId, Long owner, Instant now) {
        return assignment.ensureOpportunity(view, matchId, owner);
    }

    /**
     * The marketer's answer to the consultant's question (doc 60 section 3, NEEDS_INFO to NEEDS_INFO): sets {@code info_answer} and records
     * {@code INFO_PROVIDED}. The state is NOT changed: only the consultant moves their own opportunity on (interest or decline). {@code id} is the
     * opportunity's match id, like every route of this page. A consultant outside the caller's scope or a row that is gone is the generic 404; an
     * opportunity with no open question is 409 {@code NO_OPEN_INFO_REQUEST}; a sensitive value in the answer is 422.
     */
    @Transactional
    public ActionResult answerInfo(OrgMembership me, Long id, String answer) {
        MktScope.View view = scope.resolve(me, PERMISSION);
        String text = answer == null ? "" : answer.trim();
        if (text.isEmpty() || text.length() > 1000) throw OrgException.coded(400, "VALIDATION", "answer: enter 1 to 1000 characters", Map.of("field", "answer"));
        SensitiveContent.check("answer", "answer", text);
        Instant now = clock.instant();
        MktOpportunityRow raw = repo.findRow(view.orgId(), id).orElseThrow(OrgNotFoundException::new);
        scope.require(view, raw.consultantId());
        MktOpportunity opp = raw.oppId() == null ? null : repo.lockByOrgIdAndId(view.orgId(), raw.oppId()).orElse(null);
        if (opp == null || !"ASSIGNED".equals(raw.matchStatus()) || !"NEEDS_INFO".equals(opp.getState()) || opp.getInfoRequest() == null || opp.getInfoRequest().isBlank()) {
            throw OrgException.coded(409, "NO_OPEN_INFO_REQUEST", "The consultant has not asked a question that is waiting for an answer.", Map.of());
        }
        opp.setInfoAnswer(text);
        opp.setUpdatedAt(now);
        repo.save(opp);
        record(opp, "INFO_PROVIDED", me.memberId(), "answered the consultant's question", now);
        audit.record(me, "MARKETER_OPPORTUNITY_INFO_ANSWER", "OPPORTUNITY", null, String.valueOf(id), "consultant " + raw.consultantId());
        return result(view, id, "Your answer was sent to " + raw.consultantName() + ".", true, now);
    }

    private void record(MktOpportunity opp, String kind, Long actor, String text, Instant now) {
        MktOpportunityEvent e = new MktOpportunityEvent();
        e.setOrgId(opp.getOrgId());
        e.setOpportunityId(opp.getId());
        e.setKind(kind);
        e.setActorMemberId(actor);
        e.setText(text);
        e.setOccurredAt(now);
        events.save(e);
    }

    private ActionResult result(MktScope.View view, Long id, String message, boolean changed, Instant now) {
        return result(view, id, message, changed, now, false);
    }

    /** {@code justCreated}: the match was committed by the assignment service's own transaction a moment ago (Add opportunity), so read it in a fresh snapshot. */
    private ActionResult result(MktScope.View view, Long id, String message, boolean changed, Instant now, boolean justCreated) {
        Row row = require(view, id, now, justCreated);
        return new ActionResult(item(row, memberNames(view.orgId(), Set.of(row.ownerId() == null ? -1L : row.ownerId())), now), message, changed);
    }

    /** The row, or the generic 404 (missing, another tenant's, a consultant outside the caller's scope, or no longer open). */
    private Row require(MktScope.View view, Long id, Instant now) {
        return require(view, id, now, false);
    }

    /**
     * {@code justCreated} only for the one caller that just had the match committed by a transaction of its own (a plain read cannot see it): its re-read
     * runs in a fresh transaction. Every other id (and every 404) stays on the caller's connection, so a missing row never takes a second one from the pool.
     */
    private Row require(MktScope.View view, Long id, Instant now, boolean justCreated) {
        MktOpportunityRow raw = (justCreated ? repo.findRow(view.orgId(), id).or(() -> assignment.readRowFresh(view.orgId(), id)) : repo.findRow(view.orgId(), id)).orElseThrow(OrgNotFoundException::new);
        scope.require(view, raw.consultantId());
        Row row = enrich(raw, resumeInfo(view.orgId(), now), now);
        if (!row.open()) throw new OrgNotFoundException();
        return row;
    }

    private List<Row> model(MktScope.View view, Instant now) {
        Map<Long, boolean[]> resumes = resumeInfo(view.orgId(), now);
        List<Row> out = new ArrayList<>();
        for (MktOpportunityRow r : repo.findRows(view.orgId())) {
            if (view.sees(r.consultantId())) out.add(enrich(r, resumes, now));
        }
        return out;
    }

    /** {updated, approved} per consultant. Updated = the primary (else newest) resume is approved and touched in the last RESUME_STALE_DAYS days. */
    private Map<Long, boolean[]> resumeInfo(Long orgId, Instant now) {
        Map<Long, List<MktResumeFact>> by = new HashMap<>();
        for (MktResumeFact f : repo.findResumeFacts(orgId)) by.computeIfAbsent(f.consultantId(), k -> new ArrayList<>()).add(f);
        Map<Long, boolean[]> out = new HashMap<>();
        Instant cut = now.minus(Duration.ofDays(RESUME_STALE_DAYS));
        by.forEach((cid, list) -> {
            MktResumeFact pick = list.stream().filter(MktResumeFact::primaryForOrg).findFirst()
                .orElseGet(() -> list.stream().max(Comparator.comparing(MktResumeFact::updatedAt)).orElse(null));
            boolean updated = pick != null && "APPROVED".equals(pick.approvalStatus()) && !pick.updatedAt().isBefore(cut);
            boolean approved = list.stream().anyMatch(f -> "APPROVED".equals(f.approvalStatus()));
            out.put(cid, new boolean[] {updated, approved});
        });
        return out;
    }

    Row enrich(MktOpportunityRow r, Map<Long, boolean[]> resumes, Instant now) {
        String interest = r.interest() == null || !INTERESTS.contains(r.interest()) ? "NO_RESPONSE" : r.interest();
        boolean[] info = resumes.get(r.consultantId());
        boolean updated = info != null && info[0];
        boolean approved = info != null && info[1];
        boolean open = OPEN_JOB.contains(r.requirementStatus());
        Instant last = latest(r.oppUpdatedAt(), r.lastResponseAt(), r.assignedAt(), r.createdAt());
        boolean stale = open && last.isBefore(now.minus(Duration.ofDays(STALE_DAYS)));
        boolean suggested = "SUGGESTED".equals(r.matchStatus());
        boolean ready = open && suggested && updated && !"NOT_INTERESTED".equals(interest);
        String action;
        if ("NOT_INTERESTED".equals(interest)) action = "COMPARE";
        else if (!updated) action = "FOLLOW_UP";
        else if (suggested) action = "ASSIGN";
        else if ("VERY_INTERESTED".equals(interest) || "INTERESTED".equals(interest)) action = "REVIEW";
        else action = "FOLLOW_UP";
        Long owner = r.ownerMemberId() != null ? r.ownerMemberId() : r.assignedMarketerId();
        return new Row(r, interest, updated ? "UPDATED" : "NEEDS_UPDATE", approved, last, open, stale, ready, action, owner);
    }

    private static Instant latest(Instant... xs) {
        Instant best = Instant.EPOCH;
        for (Instant x : xs) if (x != null && x.isAfter(best)) best = x;
        return best;
    }

    private Item item(Row e, Map<Long, String> names, Instant now) {
        MktOpportunityRow r = e.r();
        Person owner = e.ownerId() == null ? null : new Person(e.ownerId(), names.getOrDefault(e.ownerId(), "Team member"), null);
        return new Item(
            r.matchId(), new Person(r.consultantId(), r.consultantName(), null), r.requirementId(), r.jobTitle(), place(r), r.clientId(), r.clientName(), r.score() == null ? 0 : r.score(),
            e.interest(), e.resume(), owner, r.nextActionAt(), e.action(), r.matchStatus(), e.last(), e.stale(), e.ready(), r.reason(), r.oppState()
        );
    }

    private static String place(MktOpportunityRow r) {
        String loc = r.location() == null ? "" : r.location().trim();
        String mode = r.workMode() == null ? "" : r.workMode().trim();
        if (loc.isEmpty()) return mode.isEmpty() ? "" : mode;
        if (mode.isEmpty() || mode.equalsIgnoreCase("REMOTE") && loc.toLowerCase(Locale.ROOT).contains("remote")) return loc;
        return loc + " (" + mode.substring(0, 1).toUpperCase(Locale.ROOT) + mode.substring(1).toLowerCase(Locale.ROOT) + ")";
    }

    private Query sanitize(Query q) {
        if (q == null) q = Query.defaults();
        String interest = q.interest() == null || q.interest().isBlank() ? null : q.interest().trim().toUpperCase(Locale.ROOT);
        if (interest != null && !INTERESTS.contains(interest)) throw OrgException.coded(400, "VALIDATION", "Unknown interest filter.", Map.of());
        String sort = q.sort() == null ? "recent" : q.sort().trim().toLowerCase(Locale.ROOT);
        if (!SORTS.contains(sort)) throw OrgException.coded(400, "VALIDATION", "Unknown sort.", Map.of());
        int size = q.size() <= 0 ? DEFAULT_SIZE : Math.min(q.size(), MAX_SIZE);
        String text = q.q() == null ? null : q.q().trim();
        return new Query(text == null || text.isEmpty() ? null : text, q.consultantId(), q.clientId(), interest, q.minScore(), Math.max(0, q.days()), q.stale(), q.ready(), sort, q.desc(), Math.max(0, q.page()), size, Math.max(0, q.responseDays()));
    }

    private List<Row> filter(List<Row> rows, Query q, Instant now) {
        String needle = q.q() == null ? null : q.q().toLowerCase(Locale.ROOT);
        Instant since = q.days() > 0 ? now.minus(Duration.ofDays(q.days())) : null;
        return rows.stream()
            .filter(r -> needle == null || r.r().consultantName().toLowerCase(Locale.ROOT).contains(needle) || r.r().jobTitle().toLowerCase(Locale.ROOT).contains(needle))
            .filter(r -> q.consultantId() == null || q.consultantId().equals(r.r().consultantId()))
            .filter(r -> q.clientId() == null || q.clientId().equals(r.r().clientId()))
            .filter(r -> q.interest() == null || q.interest().equals(r.interest()))
            .filter(r -> q.minScore() == null || (r.r().score() != null && r.r().score() >= q.minScore()))
            .filter(r -> !q.stale() || r.stale())
            .filter(r -> !q.ready() || r.ready())
            .filter(r -> since == null || q.stale() || q.ready() || !r.last().isBefore(since))
            .toList();
    }

    private List<Row> sort(List<Row> rows, Query q) {
        Comparator<Row> c = switch (q.sort()) {
            case "score" -> Comparator.comparingInt(r -> r.r().score() == null ? 0 : r.r().score());
            case "consultant" -> Comparator.comparing(r -> r.r().consultantName().toLowerCase(Locale.ROOT));
            case "client" -> Comparator.comparing(r -> r.r().clientName().toLowerCase(Locale.ROOT));
            case "next" -> Comparator.comparing((Row r) -> r.r().nextActionAt(), Comparator.nullsLast(Comparator.naturalOrder()));
            default -> Comparator.comparing(Row::last);
        };
        if (q.desc()) c = c.reversed();
        return rows.stream().sorted(c.thenComparing(Row::id)).toList();
    }

    private List<Kpi> kpis(List<Row> open, Instant now) {
        Instant monthAgo = now.minus(Duration.ofDays(30));
        List<Row> ready = open.stream().filter(Row::ready).toList();
        List<Row> awaiting = open.stream().filter(r -> "ASSIGNED".equals(r.r().matchStatus()) && r.interest().equals("NO_RESPONSE")).toList();
        List<Row> stale = open.stream().filter(Row::stale).toList();
        return List.of(
            new Kpi("open", open.size(), deltaPct(open.size(), open.stream().filter(r -> r.r().createdAt().isBefore(monthAgo)).count()), spark(open, r -> r.r().createdAt(), now)),
            new Kpi("ready", ready.size(), deltaPct(ready.size(), ready.stream().filter(r -> r.r().createdAt().isBefore(monthAgo)).count()), spark(ready, r -> r.r().createdAt(), now)),
            new Kpi("awaiting", awaiting.size(), deltaPct(awaiting.size(), awaiting.stream().filter(r -> latest(r.r().assignedAt(), r.r().createdAt()).isBefore(monthAgo)).count()), spark(awaiting, r -> latest(r.r().assignedAt(), r.r().createdAt()), now)),
            // Stale has no honest previous value (activity is not versioned), so no delta is drawn; the sparkline shows when the quiet ones last moved.
            new Kpi("stale", stale.size(), null, spark(stale, Row::last, now))
        );
    }

    /** (current - previous) / previous in percent, one decimal; null when there is nothing to compare. */
    static Double deltaPct(long current, long previous) {
        if (previous <= 0) return null;
        return Math.round((current - previous) * 1000.0 / previous) / 10.0;
    }

    /** Counts per week for the last 8 weeks, oldest first. */
    static List<Long> spark(List<Row> rows, Function<Row, Instant> when, Instant now) {
        long[] buckets = new long[SPARK_WEEKS];
        for (Row r : rows) {
            long days = Duration.between(when.apply(r), now).toDays();
            if (days < 0 || days >= SPARK_WEEKS * 7L) continue;
            buckets[SPARK_WEEKS - 1 - (int) (days / 7)]++;
        }
        List<Long> out = new ArrayList<>();
        for (long b : buckets) out.add(b);
        return out;
    }

    private List<TopMatch> topMatches(List<Row> open) {
        Map<Long, Row> bestByJob = new LinkedHashMap<>();
        open.stream().sorted(Comparator.comparingInt((Row r) -> r.r().score() == null ? 0 : r.r().score()).reversed().thenComparing(Row::id))
            .forEach(r -> bestByJob.putIfAbsent(r.r().requirementId(), r));
        return bestByJob.values().stream().limit(5)
            .map(r -> new TopMatch(r.id(), r.r().jobTitle(), r.r().clientName(), r.r().location() == null ? "" : r.r().location(), r.r().score() == null ? 0 : r.r().score()))
            .toList();
    }

    private Responses responses(List<Row> open, int days, Instant now) {
        Instant since = days > 0 ? now.minus(Duration.ofDays(days)) : null;
        List<Row> in = open.stream().filter(r -> since == null || !r.last().isBefore(since)).toList();
        List<Slice> slices = new ArrayList<>();
        for (String k : INTERESTS) slices.add(new Slice(k, INTEREST_LABEL.get(k), in.stream().filter(r -> r.interest().equals(k)).count()));
        return new Responses(in.size(), days, slices);
    }

    private Filters filters(List<Row> open) {
        Map<Long, String> people = new java.util.TreeMap<>();
        Map<Long, String> orgs = new java.util.TreeMap<>();
        for (Row r : open) {
            people.put(r.r().consultantId(), r.r().consultantName());
            orgs.put(r.r().clientId(), r.r().clientName());
        }
        Comparator<Option> byName = Comparator.comparing(o -> o.name().toLowerCase(Locale.ROOT));
        return new Filters(
            people.entrySet().stream().map(e -> new Option(e.getKey(), e.getValue())).sorted(byName).toList(),
            orgs.entrySet().stream().map(e -> new Option(e.getKey(), e.getValue())).sorted(byName).toList()
        );
    }

    private List<MktEventRow> recentFeed(MktScope.View view, int limit) {
        if (view.all()) return events.recent(view.orgId(), PageRequest.of(0, limit));
        if (view.consultantIds().isEmpty()) return List.of();
        return events.recentForConsultants(view.orgId(), view.consultantIds(), PageRequest.of(0, limit));
    }

    private List<Activity> activity(List<MktEventRow> rows) {
        return rows.stream()
            .map(f -> new Activity(f.id(), f.kind(), f.consultantName(), f.text(), f.jobTitle() + " at " + f.clientName(), f.occurredAt()))
            .toList();
    }

    private Map<Long, String> memberNames(Long orgId, Collection<Long> memberIds) {
        Set<Long> ids = new HashSet<>();
        for (Long id : memberIds) if (id != null && id > 0) ids.add(id);
        if (ids.isEmpty()) return Map.of();
        Map<Long, Long> userOf = new HashMap<>();
        for (OrgMember m : members.findByOrgIdAndIdIn(orgId, ids)) if (m.getUserId() != null) userOf.put(m.getId(), m.getUserId());
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

    /** Share of the job's skills the consultant lists (0..100). Zero when the job lists none: no score is made up. */
    private int overlapScore(Long orgId, Long consultantId, Long requirementId) {
        Set<String> have = new HashSet<>();
        for (ConsultantSkill s : consultantSkills.findByOrgIdAndConsultantIdIn(orgId, List.of(consultantId))) have.add(s.getSkill().trim().toLowerCase(Locale.ROOT));
        List<RequirementSkill> need = requirementSkills.findByOrgIdAndRequirementIdIn(orgId, List.of(requirementId));
        if (need.isEmpty()) return 0;
        long hit = need.stream().filter(s -> have.contains(s.getSkill().trim().toLowerCase(Locale.ROOT))).count();
        return (int) Math.round(hit * 100.0 / need.size());
    }

    /** One CSV cell; a leading = + - @ is neutralised so a spreadsheet never runs it as a formula. */
    static String csv(String s) {
        if (s == null) return "";
        String v = s;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) v = "'" + v;
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) v = "\"" + v.replace("\"", "\"\"") + "\"";
        return v;
    }
}
