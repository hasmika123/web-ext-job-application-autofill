package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.consultantws.CwsMatchInterest;
import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsMatchInterestRepository;
import com.dossier.api.repository.ent.consultantws.CwsOpportunityResponseRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultant.ConOpportunityService;
import com.dossier.api.service.ent.consultant.ConScope;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tile;
import com.dossier.api.service.ent.consultantws.OpportunitiesDTO.Detail;
import com.dossier.api.service.ent.consultantws.OpportunitiesDTO.NextSteps;
import com.dossier.api.service.ent.consultantws.OpportunitiesDTO.Outcome;
import com.dossier.api.service.ent.consultantws.OpportunitiesDTO.Response;
import com.dossier.api.service.ent.consultantws.OpportunitiesDTO.Row;
import com.dossier.api.service.ent.consultantws.OpportunitiesDTO.SkillFit;
import com.dossier.api.service.ent.consultantws.OpportunitiesDTO.TimelineEvent;
import com.dossier.api.service.ent.consultantws.OpportunitiesDTO.Tiles;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Assigned Opportunities page (docs/enterprise-v2/page-consultant-opportunities.md): the caller's own
 * {@code requirement_match} rows with status ASSIGNED as a response worklist. The gate is {@link ConsultantHomeService#requireSelf}; every write
 * adds the WRITE check on {@code opportunities.respond}. Every query is organization id first plus the caller's own consultant id, and a match
 * that is not one of the caller's own ASSIGNED matches is the same generic 404. Nothing here creates an application or submits anything.
 *
 * <p><b>One record per answer.</b> The consultant's answer (interested, a question, declined, applied) lives on {@code mkt_opportunity}, the row the
 * marketer's Opportunities board, its activity feed and {@code answer-info} read. Every write here goes through the same transitions as the
 * extension-facing {@code /con/opportunities} API ({@link ConOpportunityService}), so one event lands on the marketer's feed and the marketer's answer to a
 * question comes back on {@link #detail}. {@code cws_opportunity_response} keeps only what is not an answer: the marketer's priority and due date, the
 * resume-update note and the seed-only IN_REVIEW stage. The row is created on the consultant's first answer when the match has none yet.
 */
@Service
public class OpportunitiesService {

    static final int MAX_TEXT = 300;
    static final int MIN_TEXT = 3;
    static final int MAX_PAGE_SIZE = 50;
    static final int DUE_DAYS = 14;
    static final int WEEKS = 6;
    static final String STATUS_ASSIGNED = "ASSIGNED";
    /** The consultant's reason code on the shared record when the page's free-text reason is the whole explanation. */
    static final String DECLINE_CODE = "OTHER";
    static final String APPLIED = "APPLIED";
    static final String CLOSED = "CLOSED";
    private static final Set<String> OPEN_JOB = Set.of("OPEN", "IN_REVIEW");

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final RequirementSkillRepository requirementSkills;
    private final ConsultantSkillRepository consultantSkills;
    private final CwsOpportunityResponseRepository responses;
    private final CwsMatchInterestRepository interests;
    private final MarketerAssignmentRepository assignments;
    private final OrgMemberDirectoryRepository memberDirectory;
    private final UserRepository users;
    private final TalentInterviewRepository interviews;
    private final ConsultantWsJobSourceReader sources;
    private final MktOpportunityRepository opportunities;
    private final MktOpportunityEventRepository opportunityEvents;
    private final ConOpportunityService conOpportunities;
    private final Clock clock;

    @Autowired
    public OpportunitiesService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        RequirementSkillRepository requirementSkills,
        ConsultantSkillRepository consultantSkills,
        CwsOpportunityResponseRepository responses,
        CwsMatchInterestRepository interests,
        MarketerAssignmentRepository assignments,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users,
        TalentInterviewRepository interviews,
        ConsultantWsJobSourceReader sources,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository opportunityEvents,
        ConOpportunityService conOpportunities
    ) {
        this(gate, authorization, matches, requirements, clients, requirementSkills, consultantSkills, responses, interests, assignments, memberDirectory, users, interviews, sources, opportunities, opportunityEvents, conOpportunities, Clock.systemUTC());
    }

    OpportunitiesService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        RequirementSkillRepository requirementSkills,
        ConsultantSkillRepository consultantSkills,
        CwsOpportunityResponseRepository responses,
        CwsMatchInterestRepository interests,
        MarketerAssignmentRepository assignments,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users,
        TalentInterviewRepository interviews,
        ConsultantWsJobSourceReader sources,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository opportunityEvents,
        ConOpportunityService conOpportunities,
        Clock clock
    ) {
        this.gate = gate;
        this.authorization = authorization;
        this.matches = matches;
        this.requirements = requirements;
        this.clients = clients;
        this.requirementSkills = requirementSkills;
        this.consultantSkills = consultantSkills;
        this.responses = responses;
        this.interests = interests;
        this.assignments = assignments;
        this.memberDirectory = memberDirectory;
        this.users = users;
        this.interviews = interviews;
        this.sources = sources;
        this.opportunities = opportunities;
        this.opportunityEvents = opportunityEvents;
        this.conOpportunities = conOpportunities;
        this.clock = clock;
    }

    /** The consultant for a write: the read gate plus the WRITE check on {@code opportunities.respond}. */
    private ConsultantProfile requireWriter(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(ConsultantHomeService.PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        return c;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me, String sort, Integer page, Integer size) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        String key = normalizeSort(sort);
        int pageNo = page == null || page < 0 ? 0 : page;
        int pageSize = size == null || size < 1 ? MAX_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);

        List<RequirementMatch> assigned = assignedMatches(org, c.getId());
        Ctx ctx = context(org, c, assigned);
        List<Row> all = assigned.stream().map(m -> row(m, ctx, today)).filter(Objects::nonNull).toList();

        List<Row> sorted = sortRows(all, key);
        int from = (int) Math.min((long) pageNo * pageSize, sorted.size());
        List<Row> slice = sorted.subList(from, Math.min(from + pageSize, sorted.size()));

        return new Response(org, now, c.getDisplayName(), tiles(all, ctx, now), slice, pageNo, pageSize, all.size(), key, nextSteps(c, all, now));
    }

    static String normalizeSort(String sort) {
        if (sort == null) return "due";
        return switch (sort.toLowerCase(Locale.ROOT)) {
            case "priority" -> "priority";
            case "newest" -> "newest";
            default -> "due";
        };
    }

    static int priorityRank(String p) {
        return "HIGH".equals(p) ? 0 : "MEDIUM".equals(p) ? 1 : 2;
    }

    static List<Row> sortRows(List<Row> rows, String key) {
        Comparator<Row> byDue = Comparator.comparing(Row::dueOn, Comparator.nullsLast(Comparator.naturalOrder()));
        Comparator<Row> byPriority = Comparator.comparingInt((Row r) -> priorityRank(r.priority()));
        Comparator<Row> byNewest = Comparator.comparing(Row::assignedAt, Comparator.nullsLast(Comparator.reverseOrder()));
        Comparator<Row> tie = Comparator.comparing(Row::title, Comparator.nullsLast(String::compareToIgnoreCase)).thenComparingLong(Row::matchId);
        Comparator<Row> cmp = switch (key) {
            case "priority" -> byPriority.thenComparing(byDue);
            case "newest" -> byNewest;
            default -> byDue.thenComparing(byPriority);
        };
        return rows.stream().sorted(cmp.thenComparing(tie)).toList();
    }

    /** HIGH from 85, MEDIUM from 70, else LOW (the same rule as the Marketer page). */
    static String derivedPriority(int score) {
        return score >= 85 ? "HIGH" : score >= 70 ? "MEDIUM" : "LOW";
    }

    private Tiles tiles(List<Row> all, Ctx ctx, Instant now) {
        List<Row> active = all.stream().filter(r -> !"DECLINED".equals(r.status()) && !APPLIED.equals(r.status()) && !CLOSED.equals(r.status())).toList();
        List<Row> high = active.stream().filter(r -> "HIGH".equals(r.priority())).toList();
        List<Row> awaiting = all.stream().filter(r -> "AWAITING_RESPONSE".equals(r.status()) && !r.infoAnswered()).toList();
        List<Row> review = all.stream().filter(r -> "IN_REVIEW".equals(r.status())).toList();
        List<Row> declined = all.stream().filter(r -> "DECLINED".equals(r.status())).toList();
        return new Tiles(
            monthTile(all.stream().map(Row::assignedAt).toList(), now),
            monthTile(high.stream().map(Row::assignedAt).toList(), now),
            monthTile(awaiting.stream().map(r -> stamp(ctx, r)).toList(), now),
            monthTile(review.stream().map(r -> stamp(ctx, r)).toList(), now),
            monthTile(declined.stream().map(r -> stamp(ctx, r)).toList(), now)
        );
    }

    /** When the row entered its current status: the consultant's last answer on the shared record, else the legacy stage row's change, else the assignment. */
    private static Instant stamp(Ctx ctx, Row r) {
        MktOpportunity o = ctx.oppByMatch.get(r.matchId());
        if (o != null && o.getLastResponseAt() != null) return o.getLastResponseAt();
        if (o != null && o.getUpdatedAt() != null && !"ASSIGNED".equals(o.getState())) return o.getUpdatedAt();
        return ctx.responseOf(r.requirementId()).map(CwsOpportunityResponse::getUpdatedAt).orElse(r.assignedAt());
    }

    /**
     * The count now against the count of the same kind of rows that already existed 30 days ago ("vs last month"), and six weekly cumulative
     * counts for the sparkline. The delta is null when there was nothing a month ago, never a made-up percentage.
     */
    static Tile monthTile(List<Instant> stamps, Instant now) {
        Instant monthAgo = now.minus(Duration.ofDays(30));
        long value = stamps.size();
        long previous = stamps.stream().filter(t -> t != null && !t.isAfter(monthAgo)).count();
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            spark.add(stamps.stream().filter(t -> t != null && !t.isAfter(at)).count());
        }
        return new Tile(value, previous, delta, spark, false);
    }

    private NextSteps nextSteps(ConsultantProfile c, List<Row> all, Instant now) {
        List<Row> open = all.stream().filter(r -> ("NEW".equals(r.status()) && !r.interestSent()) || ("AWAITING_RESPONSE".equals(r.status()) && r.infoAnswered())).toList();
        Integer soonest = open.stream().map(Row::daysLeft).min(Integer::compare).orElse(null);
        int gaps = (int) all.stream().filter(r -> !"DECLINED".equals(r.status()) && !APPLIED.equals(r.status()) && !CLOSED.equals(r.status()) && r.missingSkills() > 0).count();
        int upcoming = interviews.findByOrgIdAndConsultantIdAndStatusAndScheduledAtAfterOrderByScheduledAtAsc(c.getOrgId(), c.getId(), "SCHEDULED", now).size();
        return new NextSteps(open.size(), soonest, gaps, upcoming, all.stream().anyMatch(r -> r.marketer() != null));
    }

    // ---- one opportunity ------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, long matchId) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        RequirementMatch m = ownAssigned(org, c.getId(), matchId);
        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();
        Ctx ctx = context(org, c, List.of(m));
        Row row = row(m, ctx, today);
        if (row == null) throw new OrgNotFoundException();
        ClientRequirement r = ctx.reqs.get(m.getRequirementId());
        Optional<CwsOpportunityResponse> resp = ctx.responseOf(m.getRequirementId());
        Optional<CwsMatchInterest> interest = interests.findByOrgIdAndConsultantIdAndRequirementId(org, c.getId(), m.getRequirementId());
        MktOpportunity opp = ctx.oppByMatch.get(m.getId());

        List<SkillFit> fit = ctx.jobSkills.getOrDefault(m.getRequirementId(), List.of()).stream()
            .sorted(Comparator.comparingInt((RequirementSkill s) -> s.getSortOrder() == null ? 0 : s.getSortOrder()))
            .map(s -> new SkillFit(s.getSkill(), ctx.mine.contains(norm(s.getSkill()))))
            .toList();

        List<TimelineEvent> timeline = new ArrayList<>();
        timeline.add(new TimelineEvent("ASSIGNED", row.marketer() == null ? "Assigned to you" : "Assigned to you by " + row.marketer(), row.assignedAt()));
        List<MktOpportunityEvent> events = opp == null ? List.of() : opportunityEvents.findByOrgIdAndOpportunityIdOrderByOccurredAtDesc(org, opp.getId());
        boolean interestEvent = events.stream().anyMatch(e -> "INTERESTED".equals(e.getKind()));
        // an interest sent from the Job Matches page is only the legacy row, with no event
        if (!interestEvent) interest.ifPresent(i -> timeline.add(new TimelineEvent("INTEREST", "You expressed interest", i.getCreatedAt())));
        Map<Long, String> actors = names(org, events.stream().filter(e -> "INFO_PROVIDED".equals(e.getKind())).map(MktOpportunityEvent::getActorMemberId).filter(Objects::nonNull).collect(Collectors.toSet()));
        for (MktOpportunityEvent e : events) {
            TimelineEvent t = timelineOf(e, row.marketer(), actors);
            if (t != null) timeline.add(t);
        }
        resp.ifPresent(x -> {
            if (x.getResumeUpdateRequestedAt() != null) timeline.add(new TimelineEvent("RESUME_UPDATE", "You asked your marketer for a resume update", x.getResumeUpdateRequestedAt()));
            if (CwsOpportunityResponse.IN_REVIEW.equals(x.getStatus()) && x.getRespondedAt() != null) timeline.add(new TimelineEvent("IN_REVIEW", "Your marketer moved it to review", x.getRespondedAt()));
        });
        timeline.sort(Comparator.comparing(TimelineEvent::at, Comparator.nullsLast(Comparator.naturalOrder())));

        return new Detail(
            row, r.getDescriptionText(), r.getEmploymentLabel(), r.getDurationLabel(), r.getExperienceLevel(), fit,
            r.getRateMinMinor(), r.getRateMaxMinor(), r.getRateUnit(), r.getCurrency(), m.getReason(),
            opp == null || !"DECLINED".equals(opp.getState()) ? null : opp.getDeclineNote() != null ? opp.getDeclineNote() : declineLabel(opp.getDeclineReason()),
            opp == null || !"NEEDS_INFO".equals(opp.getState()) ? null : opp.getInfoRequest(),
            opp == null || !"NEEDS_INFO".equals(opp.getState()) ? null : opp.getInfoAnswer(),
            opp == null ? null : opp.getAppliedAt(),
            resp.map(CwsOpportunityResponse::getResumeUpdateNote).orElse(null),
            resp.map(CwsOpportunityResponse::getResumeUpdateRequestedAt).orElse(null),
            interest.map(CwsMatchInterest::getCreatedAt).orElse(null),
            interest.map(CwsMatchInterest::getNote).orElse(null),
            timeline
        );
    }

    // ---- writes (own ASSIGNED matches only; each is org-scoped; 404 for anything else) ---------------------------------

    /**
     * "Express Interest": the consultant wants this job. The state moves to INTERESTED on the shared record (so the marketer's board reads Interested and the
     * activity feed says so) and the same {@code cws_match_interest} row the Job Matches page writes is kept, so both consultant pages show "Interest sent".
     * A declined opportunity must be reopened first. Idempotent. No application, no submission.
     */
    @Transactional
    public Outcome expressInterest(OrgMembership me, long matchId, String note) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        MktOpportunity opp = opportunityFor(c, m);
        if (DECLINED_STATE.equals(opp.getState())) throw TrackerException.invalid("status", "is declined; reopen it first");
        String clean = optionalText("note", note);
        conOpportunities.recordInterest(view(me, c), me, opp.getId(), null);
        if (interests.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId()).isEmpty()) {
            CwsMatchInterest row = new CwsMatchInterest();
            row.setOrgId(c.getOrgId());
            row.setConsultantId(c.getId());
            row.setRequirementId(m.getRequirementId());
            row.setNote(clean);
            row.setCreatedAt(Instant.now(clock));
            interests.save(row);
        }
        return outcome(c, m);
    }

    /** "Need More Info": the question goes on the shared record for the marketer (state NEEDS_INFO, one activity event); asking again replaces it. */
    @Transactional
    public Outcome needMoreInfo(OrgMembership me, long matchId, String message) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        String text = requiredText("message", message);
        MktOpportunity opp = opportunityFor(c, m);
        if (DECLINED_STATE.equals(opp.getState())) throw TrackerException.invalid("status", "is declined; reopen it first");
        conOpportunities.recordInfoRequest(view(me, c), me, opp.getId(), text, true, null);
        return outcome(c, m);
    }

    /** "Decline Opportunity": a reason is required. Idempotent: declining a declined opportunity keeps the first reason and time. */
    @Transactional
    public Outcome decline(OrgMembership me, long matchId, String reason) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        String text = requiredText("reason", reason);
        MktOpportunity opp = opportunityFor(c, m);
        conOpportunities.recordDecline(view(me, c), me, opp.getId(), DECLINE_CODE, text, null);
        return outcome(c, m);
    }

    /** Undo for a decline: DECLINED goes back to ASSIGNED (shown as NEW) and the reason is cleared. Idempotent: anything that is not declined is returned as it is. */
    @Transactional
    public Outcome reopen(OrgMembership me, long matchId) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        MktOpportunity existing = opportunities.findByOrgIdAndMatchId(c.getOrgId(), m.getId()).orElse(null);
        if (existing != null) conOpportunities.recordReopen(view(me, c), me, existing.getId(), null);
        return outcome(c, m);
    }

    /**
     * "I applied": the consultant records that THEY applied on the source site (state APPLIED, one activity event the marketer reads as "says they applied").
     * Kiwiply never applies or submits: this stores a statement, and nothing leaves the system. Idempotent.
     */
    @Transactional
    public Outcome markApplied(OrgMembership me, long matchId) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        MktOpportunity opp = opportunityFor(c, m);
        conOpportunities.recordApplied(view(me, c), me, opp.getId(), null, null, false);
        return outcome(c, m);
    }

    /**
     * "Request Resume Update": a note to the marketer, stored on the response row (no messaging exists; the marketer side will read it later).
     * It changes no status. Asking again replaces the note and the time.
     */
    @Transactional
    public Outcome requestResumeUpdate(OrgMembership me, long matchId, String note) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        String clean = optionalText("note", note);
        CwsOpportunityResponse r = responseFor(c, m);
        Instant now = Instant.now(clock);
        r.setResumeUpdateNote(clean);
        r.setResumeUpdateRequestedAt(now);
        r.setUpdatedAt(now);
        responses.save(r);
        return outcome(c, m);
    }

    /** What the write did, read back from the shared record (and the legacy interest row) after it. */
    private Outcome outcome(ConsultantProfile c, RequirementMatch m) {
        Optional<CwsMatchInterest> interest = interests.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId());
        MktOpportunity opp = opportunities.findByOrgIdAndMatchId(c.getOrgId(), m.getId()).orElse(null);
        Optional<CwsOpportunityResponse> legacy = responses.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId());
        Instant interestAt = interest.map(CwsMatchInterest::getCreatedAt).orElse(null);
        boolean sent = interestSent(opp, interest.isPresent());
        if (interestAt == null && sent && opp != null) interestAt = opp.getLastResponseAt();
        return new Outcome(m.getId(), statusOf(opp, legacy), sent, interestAt, legacy.map(x -> x.getResumeUpdateRequestedAt() != null).orElse(false));
    }

    /** The consultant's view of the shared record's state: NEEDS_INFO is "awaiting response", INTERESTED and the rest of the open states are "new". */
    static String statusOf(MktOpportunity o, Optional<CwsOpportunityResponse> legacy) {
        String state = o == null ? STATUS_ASSIGNED : o.getState();
        return switch (state) {
            case "DECLINED" -> CwsOpportunityResponse.DECLINED;
            case "NEEDS_INFO" -> CwsOpportunityResponse.AWAITING_RESPONSE;
            case "APPLIED" -> APPLIED;
            case "CLOSED" -> CLOSED;
            default -> legacy.filter(x -> CwsOpportunityResponse.IN_REVIEW.equals(x.getStatus())).isPresent() ? CwsOpportunityResponse.IN_REVIEW : CwsOpportunityResponse.NEW;
        };
    }

    /** Said "interested" on the shared record (the state, or the interest the marketer's board shows), or on the Job Matches page (the legacy row). */
    static boolean interestSent(MktOpportunity o, boolean legacyRow) {
        if (legacyRow) return true;
        return o != null && ("INTERESTED".equals(o.getState()) || (!DECLINED_STATE.equals(o.getState()) && ("INTERESTED".equals(o.getInterest()) || "VERY_INTERESTED".equals(o.getInterest()))));
    }

    /** What the page may offer for a row, from its status, whether interest is already sent, whether the job still takes answers and whether the question was answered. */
    static List<String> actionsFor(String status, boolean interestSent, boolean jobOpen) {
        List<String> out = new ArrayList<>();
        switch (status) {
            case "NEW", "IN_REVIEW", "AWAITING_RESPONSE" -> {
                if (jobOpen && !interestSent) out.add("INTEREST");
                if (jobOpen) out.add("REQUEST_INFO");
                out.add("RESUME_UPDATE");
                out.add("DECLINE");
                if (jobOpen) out.add("APPLIED");
            }
            case "DECLINED" -> {
                if (jobOpen) out.add("REOPEN");
            }
            default -> { }
        }
        return List.copyOf(out);
    }

    private static final String DECLINED_STATE = "DECLINED";

    private static String declineLabel(String code) {
        if (code == null) return null;
        return switch (code) {
            case "NOT_INTERESTED" -> "Not interested";
            case "LOCATION" -> "The location does not work for me";
            case "RATE" -> "The rate is too low";
            case "ALREADY_APPLIED" -> "I already applied";
            default -> null;
        };
    }

    /** The consultant's own timeline line for an event on the shared record; marketer-internal events (reviews, next actions) are not shown. */
    private static TimelineEvent timelineOf(MktOpportunityEvent e, String marketer, Map<Long, String> actors) {
        String who = e.getActorMemberId() != null && actors.get(e.getActorMemberId()) != null ? actors.get(e.getActorMemberId()) : marketer != null ? marketer : "Your marketer";
        return switch (e.getKind()) {
            case "INTERESTED" -> new TimelineEvent("INTEREST", "You expressed interest", e.getOccurredAt());
            case "INFO_REQUESTED" -> new TimelineEvent("INFO_REQUEST", "You asked for more information", e.getOccurredAt());
            case "INFO_PROVIDED" -> new TimelineEvent("INFO_ANSWER", who + " answered your question", e.getOccurredAt());
            case "DECLINED" -> new TimelineEvent("DECLINED", "You declined this opportunity", e.getOccurredAt());
            case "REOPENED" -> new TimelineEvent("REOPENED", "You reopened this opportunity", e.getOccurredAt());
            case "APPLIED", "APPLIED_UNLINKED" -> new TimelineEvent("APPLIED", "You said you applied", e.getOccurredAt());
            case "INTEREST_REQUESTED" -> new TimelineEvent("INTEREST_REQUESTED", who + " asked for your interest", e.getOccurredAt());
            case "RESUME_REQUESTED" -> new TimelineEvent("RESUME_REQUESTED", who + " asked you to update your resume", e.getOccurredAt());
            default -> null;
        };
    }

    private static ConScope.View view(OrgMembership me, ConsultantProfile c) {
        return new ConScope.View(c.getOrgId(), me.memberId(), me.userId(), c.getId());
    }

    /**
     * The shared record of an assigned match, created (in this transaction, safe against a concurrent first answer) when the match has none yet: the
     * marketer's assign creates it, a match assigned another way gets it on the consultant's first answer.
     */
    private MktOpportunity opportunityFor(ConsultantProfile c, RequirementMatch m) {
        Long org = c.getOrgId();
        Optional<MktOpportunity> found = opportunities.findByOrgIdAndMatchId(org, m.getId());
        if (found.isPresent()) return found.get();
        opportunities.insertIfMissing(org, m.getId(), m.getAssignedByMemberId(), Instant.now(clock));
        return opportunities.findByOrgIdAndMatchId(org, m.getId()).orElseThrow(OrgNotFoundException::new);
    }

    /** The response row of this match, created (not yet saved) when there is none. Priority and due date stay null (derived). */
    private CwsOpportunityResponse responseFor(ConsultantProfile c, RequirementMatch m) {
        return responses.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId()).orElseGet(() -> {
            CwsOpportunityResponse r = new CwsOpportunityResponse();
            r.setOrgId(c.getOrgId());
            r.setConsultantId(c.getId());
            r.setRequirementId(m.getRequirementId());
            r.setStatus(CwsOpportunityResponse.NEW);
            Instant now = Instant.now(clock);
            r.setCreatedAt(now);
            r.setUpdatedAt(now);
            return r;
        });
    }

    /** Required free text, 3..300 characters, scanned for sensitive data. */
    static String requiredText(String path, String value) {
        String v = value == null ? "" : value.strip();
        if (v.isEmpty()) throw TrackerException.invalid(path, "is required");
        return checked(path, v);
    }

    /** Optional free text: blank is null, otherwise 3..300 characters and scanned. */
    static String optionalText(String path, String value) {
        if (value == null || value.isBlank()) return null;
        return checked(path, value.strip());
    }

    private static String checked(String path, String v) {
        if (v.length() < MIN_TEXT) throw TrackerException.invalid(path, "needs at least " + MIN_TEXT + " characters");
        if (v.length() > MAX_TEXT) throw TrackerException.invalid(path, "is longer than " + MAX_TEXT + " characters");
        SensitiveContent.check(path, path, v);
        return v;
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    private List<RequirementMatch> assignedMatches(Long org, Long consultantId) {
        return matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, consultantId).stream().filter(m -> STATUS_ASSIGNED.equals(m.getStatus())).toList();
    }

    private RequirementMatch ownAssigned(Long org, Long consultantId, long matchId) {
        RequirementMatch m = matches.findByOrgIdAndId(org, matchId).orElseThrow(OrgNotFoundException::new);
        if (!consultantId.equals(m.getConsultantId()) || !STATUS_ASSIGNED.equals(m.getStatus())) throw new OrgNotFoundException();
        return m;
    }

    private static String norm(String s) {
        return s == null ? "" : s.strip().toLowerCase(Locale.ROOT);
    }

    /** Everything the rows need, loaded once for a list of the caller's own matches. */
    private final class Ctx {
        final Map<Long, ClientRequirement> reqs;
        final Map<Long, ClientAccount> clientById;
        final Map<Long, List<RequirementSkill>> jobSkills;
        final Set<String> mine;
        final Map<Long, CwsOpportunityResponse> responseByReq;
        final Map<Long, MktOpportunity> oppByMatch;
        final Set<Long> interestReqs;
        final Map<Long, ConsultantWsJobSourceReader.Info> sourceInfo;
        final Map<Long, String> marketerNames;
        final String assignmentMarketer;

        Ctx(Long org, ConsultantProfile c, List<RequirementMatch> list) {
            List<Long> reqIds = list.stream().map(RequirementMatch::getRequirementId).distinct().toList();
            reqs = reqIds.isEmpty() ? Map.of() : requirements.findByOrgIdAndIdIn(org, reqIds).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
            clientById = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
            jobSkills = reqs.isEmpty() ? Map.of() : requirementSkills.findByOrgIdAndRequirementIdIn(org, reqs.keySet()).stream().collect(Collectors.groupingBy(RequirementSkill::getRequirementId));
            mine = consultantSkills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(org, c.getId()).stream().map(s -> norm(s.getSkill())).collect(Collectors.toSet());
            sourceInfo = reqs.isEmpty() ? Map.of() : sources.load(org, reqs.keySet());
            responseByReq = responses.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(CwsOpportunityResponse::getRequirementId, Function.identity(), (a, b) -> a));
            oppByMatch = list.isEmpty() ? Map.of() : opportunities.findByOrgIdAndMatchIdIn(org, list.stream().map(RequirementMatch::getId).toList()).stream().collect(Collectors.toMap(MktOpportunity::getMatchId, Function.identity(), (a, b) -> a));
            interestReqs = interests.findByOrgIdAndConsultantId(org, c.getId()).stream().map(CwsMatchInterest::getRequirementId).collect(Collectors.toSet());

            // the marketer: who assigned the match (a person of this organization), else the consultant's ACTIVE marketer assignment
            Optional<MarketerAssignment> assignment = assignments.findByOrgIdAndConsultantId(org, c.getId()).filter(a -> "ACTIVE".equals(a.getStatus()));
            Set<Long> ids = new HashSet<>();
            list.stream().map(RequirementMatch::getAssignedByMemberId).filter(Objects::nonNull).forEach(ids::add);
            assignment.map(MarketerAssignment::getMarketerMemberId).ifPresent(ids::add);
            marketerNames = names(org, ids);
            assignmentMarketer = assignment.map(a -> marketerNames.get(a.getMarketerMemberId())).orElse(null);
        }

        Optional<CwsOpportunityResponse> responseOf(Long requirementId) {
            return Optional.ofNullable(responseByReq.get(requirementId));
        }
    }

    private Ctx context(Long org, ConsultantProfile c, List<RequirementMatch> list) {
        return new Ctx(org, c, list);
    }

    private Map<Long, String> names(Long org, Collection<Long> memberIds) {
        if (memberIds.isEmpty()) return Map.of();
        Map<Long, String> out = new HashMap<>();
        for (OrgMember seat : memberDirectory.findByOrgIdAndIdIn(org, memberIds)) {
            if (seat.getStatus() != OrgMemberStatus.ACTIVE) continue;
            User u = seat.getUserId() == null ? null : users.findById(seat.getUserId()).orElse(null);
            out.put(seat.getId(), ConsultantMarketerService.personName(u, seat));
        }
        return out;
    }

    private Row row(RequirementMatch m, Ctx ctx, LocalDate today) {
        ClientRequirement r = ctx.reqs.get(m.getRequirementId());
        if (r == null) return null;
        ClientAccount cl = r.getClientId() == null ? null : ctx.clientById.get(r.getClientId());
        Optional<CwsOpportunityResponse> resp = ctx.responseOf(r.getId());
        int score = m.getScore() == null ? 0 : m.getScore();
        Instant assignedAt = m.getAssignedAt() != null ? m.getAssignedAt() : m.getCreatedAt();

        String storedPriority = resp.map(CwsOpportunityResponse::getPriority).filter(p -> p != null && !p.isBlank()).orElse(null);
        boolean priorityDerived = storedPriority == null;
        String priority = priorityDerived ? derivedPriority(score) : storedPriority;
        LocalDate storedDue = resp.map(CwsOpportunityResponse::getDueOn).orElse(null);
        boolean dueDerived = storedDue == null;
        LocalDate due = dueDerived ? assignedAt.atZone(ZoneOffset.UTC).toLocalDate().plusDays(DUE_DAYS) : storedDue;

        List<RequirementSkill> skills = ctx.jobSkills.getOrDefault(r.getId(), List.of()).stream()
            .sorted(Comparator.comparingInt((RequirementSkill s) -> s.getSortOrder() == null ? 0 : s.getSortOrder()))
            .toList();
        int missing = (int) skills.stream().filter(s -> !ctx.mine.contains(norm(s.getSkill()))).count();

        ConsultantWsJobSourceReader.Info src = ConsultantWsJobSourceReader.orNone(ctx.sourceInfo, r.getId());
        MktOpportunity opp = ctx.oppByMatch.get(m.getId());
        String status = statusOf(opp, resp);
        boolean sent = interestSent(opp, ctx.interestReqs.contains(r.getId()));
        boolean answered = opp != null && "NEEDS_INFO".equals(opp.getState()) && opp.getInfoAnswer() != null && !opp.getInfoAnswer().isBlank();
        String marketer = m.getAssignedByMemberId() != null && ctx.marketerNames.containsKey(m.getAssignedByMemberId()) ? ctx.marketerNames.get(m.getAssignedByMemberId()) : ctx.assignmentMarketer;
        return new Row(
            m.getId(), r.getId(), r.getTitle(), skills.stream().map(RequirementSkill::getSkill).limit(3).toList(), cl == null ? null : cl.getName(),
            r.getLocation(), r.getWorkMode(), marketer, status, priority, priorityDerived,
            due, dueDerived, (int) ChronoUnit.DAYS.between(today, due), score, missing, sent, assignedAt,
            src.sourceUrl(), src.sourceName(), src.quickInfo(), src.sample(), answered, actionsFor(status, sent, OPEN_JOB.contains(r.getStatus()))
        );
    }
}
