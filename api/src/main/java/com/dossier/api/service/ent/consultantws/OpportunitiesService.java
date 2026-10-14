package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.consultantws.CwsMatchInterest;
import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
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
 */
@Service
public class OpportunitiesService {

    static final int MAX_TEXT = 300;
    static final int MIN_TEXT = 3;
    static final int MAX_PAGE_SIZE = 50;
    static final int DUE_DAYS = 14;
    static final int WEEKS = 6;
    static final String STATUS_ASSIGNED = "ASSIGNED";

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
        TalentInterviewRepository interviews
    ) {
        this(gate, authorization, matches, requirements, clients, requirementSkills, consultantSkills, responses, interests, assignments, memberDirectory, users, interviews, Clock.systemUTC());
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
        List<Row> active = all.stream().filter(r -> !"DECLINED".equals(r.status())).toList();
        List<Row> high = active.stream().filter(r -> "HIGH".equals(r.priority())).toList();
        List<Row> awaiting = all.stream().filter(r -> "AWAITING_RESPONSE".equals(r.status())).toList();
        List<Row> review = all.stream().filter(r -> "IN_REVIEW".equals(r.status())).toList();
        List<Row> declined = all.stream().filter(r -> "DECLINED".equals(r.status())).toList();
        return new Tiles(
            monthTile(all.stream().map(Row::assignedAt).toList(), now),
            monthTile(high.stream().map(Row::assignedAt).toList(), now),
            monthTile(awaiting.stream().map(r -> stamp(ctx, r)).toList(), now),
            monthTile(review.stream().map(r -> stamp(ctx, r)).toList(), now),
            monthTile(declined.stream().map(r -> ctx.responseOf(r.requirementId()).map(x -> x.getRespondedAt() != null ? x.getRespondedAt() : x.getUpdatedAt()).orElse(null)).toList(), now)
        );
    }

    /** When the row entered its current status: the response row's last change. */
    private static Instant stamp(Ctx ctx, Row r) {
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
        List<Row> open = all.stream().filter(r -> "NEW".equals(r.status()) && !r.interestSent()).toList();
        Integer soonest = open.stream().map(Row::daysLeft).min(Integer::compare).orElse(null);
        int gaps = (int) all.stream().filter(r -> !"DECLINED".equals(r.status()) && r.missingSkills() > 0).count();
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

        List<SkillFit> fit = ctx.jobSkills.getOrDefault(m.getRequirementId(), List.of()).stream()
            .sorted(Comparator.comparingInt((RequirementSkill s) -> s.getSortOrder() == null ? 0 : s.getSortOrder()))
            .map(s -> new SkillFit(s.getSkill(), ctx.mine.contains(norm(s.getSkill()))))
            .toList();

        List<TimelineEvent> timeline = new ArrayList<>();
        timeline.add(new TimelineEvent("ASSIGNED", row.marketer() == null ? "Assigned to you" : "Assigned to you by " + row.marketer(), row.assignedAt()));
        interest.ifPresent(i -> timeline.add(new TimelineEvent("INTEREST", "You expressed interest", i.getCreatedAt())));
        resp.ifPresent(x -> {
            if (x.getResumeUpdateRequestedAt() != null) timeline.add(new TimelineEvent("RESUME_UPDATE", "You asked your marketer for a resume update", x.getResumeUpdateRequestedAt()));
            Instant at = x.getRespondedAt();
            if (at == null) return;
            switch (x.getStatus()) {
                case CwsOpportunityResponse.AWAITING_RESPONSE -> timeline.add(new TimelineEvent("INFO_REQUEST", "You asked for more information", at));
                case CwsOpportunityResponse.IN_REVIEW -> timeline.add(new TimelineEvent("IN_REVIEW", "Your marketer moved it to review", at));
                case CwsOpportunityResponse.DECLINED -> timeline.add(new TimelineEvent("DECLINED", "You declined this opportunity", at));
                default -> { }
            }
        });
        timeline.sort(Comparator.comparing(TimelineEvent::at, Comparator.nullsLast(Comparator.naturalOrder())));

        return new Detail(
            row, r.getDescriptionText(), r.getEmploymentLabel(), r.getDurationLabel(), r.getExperienceLevel(), fit,
            r.getRateMinMinor(), r.getRateMaxMinor(), r.getRateUnit(), r.getCurrency(), m.getReason(),
            resp.map(CwsOpportunityResponse::getDeclineReason).orElse(null),
            resp.map(CwsOpportunityResponse::getInfoRequest).orElse(null),
            resp.map(CwsOpportunityResponse::getResumeUpdateNote).orElse(null),
            resp.map(CwsOpportunityResponse::getResumeUpdateRequestedAt).orElse(null),
            interest.map(CwsMatchInterest::getCreatedAt).orElse(null),
            interest.map(CwsMatchInterest::getNote).orElse(null),
            timeline
        );
    }

    // ---- writes (own ASSIGNED matches only; each is org-scoped; 404 for anything else) ---------------------------------

    /**
     * "Express Interest": the consultant wants this job. Records the same {@code cws_match_interest} row the Job Matches page writes (so both pages
     * show "Interest sent") and changes no status: IN_REVIEW is the marketer's step, and a NEW row with interest sent simply stops counting as
     * "still to respond". A declined opportunity must be reopened first. Idempotent. No application, no submission.
     */
    @Transactional
    public Outcome expressInterest(OrgMembership me, long matchId, String note) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        Optional<CwsOpportunityResponse> resp = responses.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId());
        if (resp.isPresent() && CwsOpportunityResponse.DECLINED.equals(resp.get().getStatus())) throw TrackerException.invalid("status", "is declined; reopen it first");
        String clean = optionalText("note", note);
        CwsMatchInterest row = interests.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId()).orElse(null);
        if (row == null) {
            row = new CwsMatchInterest();
            row.setOrgId(c.getOrgId());
            row.setConsultantId(c.getId());
            row.setRequirementId(m.getRequirementId());
            row.setNote(clean);
            row.setCreatedAt(Instant.now(clock));
            row = interests.save(row);
        }
        return new Outcome(matchId, statusOf(resp), true, row.getCreatedAt(), resp.map(x -> x.getResumeUpdateRequestedAt() != null).orElse(false));
    }

    /** "Need More Info": stores the question for the marketer and moves a NEW opportunity to AWAITING_RESPONSE (waiting for the marketer's answer). */
    @Transactional
    public Outcome needMoreInfo(OrgMembership me, long matchId, String message) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        String text = requiredText("message", message);
        CwsOpportunityResponse r = responseFor(c, m);
        if (CwsOpportunityResponse.DECLINED.equals(r.getStatus())) throw TrackerException.invalid("status", "is declined; reopen it first");
        Instant now = Instant.now(clock);
        r.setInfoRequest(text);
        if (CwsOpportunityResponse.NEW.equals(r.getStatus())) r.setStatus(CwsOpportunityResponse.AWAITING_RESPONSE);
        r.setRespondedAt(now);
        r.setUpdatedAt(now);
        responses.save(r);
        return outcome(c, m, r);
    }

    /** "Decline Opportunity": a reason is required. Idempotent: declining a declined opportunity keeps the first reason and time. */
    @Transactional
    public Outcome decline(OrgMembership me, long matchId, String reason) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        String text = requiredText("reason", reason);
        CwsOpportunityResponse r = responseFor(c, m);
        if (!CwsOpportunityResponse.DECLINED.equals(r.getStatus())) {
            Instant now = Instant.now(clock);
            r.setStatus(CwsOpportunityResponse.DECLINED);
            r.setDeclineReason(text);
            r.setRespondedAt(now);
            r.setUpdatedAt(now);
            responses.save(r);
        }
        return outcome(c, m, r);
    }

    /** Undo for a decline: DECLINED goes back to NEW and the reason is cleared. Idempotent: anything that is not declined is returned as it is. */
    @Transactional
    public Outcome reopen(OrgMembership me, long matchId) {
        ConsultantProfile c = requireWriter(me);
        RequirementMatch m = ownAssigned(c.getOrgId(), c.getId(), matchId);
        Optional<CwsOpportunityResponse> existing = responses.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId());
        if (existing.isPresent() && CwsOpportunityResponse.DECLINED.equals(existing.get().getStatus())) {
            CwsOpportunityResponse r = existing.get();
            r.setStatus(CwsOpportunityResponse.NEW);
            r.setDeclineReason(null);
            r.setRespondedAt(null);
            r.setUpdatedAt(Instant.now(clock));
            responses.save(r);
        }
        return outcome(c, m, existing.orElse(null));
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
        return outcome(c, m, r);
    }

    private Outcome outcome(ConsultantProfile c, RequirementMatch m, CwsOpportunityResponse r) {
        Optional<CwsMatchInterest> interest = interests.findByOrgIdAndConsultantIdAndRequirementId(c.getOrgId(), c.getId(), m.getRequirementId());
        return new Outcome(m.getId(), r == null ? CwsOpportunityResponse.NEW : r.getStatus(), interest.isPresent(), interest.map(CwsMatchInterest::getCreatedAt).orElse(null), r != null && r.getResumeUpdateRequestedAt() != null);
    }

    private static String statusOf(Optional<CwsOpportunityResponse> r) {
        return r.map(CwsOpportunityResponse::getStatus).orElse(CwsOpportunityResponse.NEW);
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
        final Set<Long> interestReqs;
        final Map<Long, String> marketerNames;
        final String assignmentMarketer;

        Ctx(Long org, ConsultantProfile c, List<RequirementMatch> list) {
            List<Long> reqIds = list.stream().map(RequirementMatch::getRequirementId).distinct().toList();
            reqs = reqIds.isEmpty() ? Map.of() : requirements.findAllById(reqIds).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
            clientById = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
            jobSkills = reqs.isEmpty() ? Map.of() : requirementSkills.findByOrgIdAndRequirementIdIn(org, reqs.keySet()).stream().collect(Collectors.groupingBy(RequirementSkill::getRequirementId));
            mine = consultantSkills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(org, c.getId()).stream().map(s -> norm(s.getSkill())).collect(Collectors.toSet());
            responseByReq = responses.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(CwsOpportunityResponse::getRequirementId, Function.identity(), (a, b) -> a));
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

        String marketer = m.getAssignedByMemberId() != null && ctx.marketerNames.containsKey(m.getAssignedByMemberId()) ? ctx.marketerNames.get(m.getAssignedByMemberId()) : ctx.assignmentMarketer;
        return new Row(
            m.getId(), r.getId(), r.getTitle(), skills.stream().map(RequirementSkill::getSkill).limit(3).toList(), cl == null ? null : cl.getName(),
            r.getLocation(), r.getWorkMode(), marketer, resp.map(CwsOpportunityResponse::getStatus).orElse(CwsOpportunityResponse.NEW), priority, priorityDerived,
            due, dueDerived, (int) ChronoUnit.DAYS.between(today, due), score, missing, ctx.interestReqs.contains(r.getId()), assignedAt
        );
    }
}
