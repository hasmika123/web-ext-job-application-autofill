package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO.Decision;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO.Detail;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO.PastPage;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO.ResumeSummary;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO.Row;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO.Tile;
import com.dossier.api.service.ent.consultantws.ConsultantSubmissionsDTO.Tiles;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Submissions and Approvals page (docs/enterprise-v2/page-consultant-submissions.md). The gate is
 * {@link ConsultantHomeService#requireSelf} (Consultant role, own consultant_profile, else the generic 404); approving and declining also
 * need {@code submissions.authorize}. Every query is organization id first plus the caller's own consultant id, so another consultant's row
 * (or another tenant's) is the same 404. Nothing here sends anything to a client: the consultant approves, the marketer proceeds.
 */
@Service
public class ConsultantSubmissionsService {

    public static final String AUTHORIZE_PERMISSION = "submissions.authorize";
    public static final String CODE_NOT_PENDING = "SUBMISSION_NOT_PENDING";
    static final int MIN_REASON = 3;
    static final int MAX_REASON = 300;
    static final int DEFAULT_PAGE_SIZE = 5;
    static final int MAX_PAGE_SIZE = 50;
    static final int WEEKS = 6;
    static final Duration ATTENTION_WINDOW = Duration.ofHours(24);
    private static final int MAX_DESCRIPTION = 1200;

    /** The statuses the Past Submissions filter accepts (a pending row is never "past"). */
    static final Set<String> PAST_STATUSES = new LinkedHashSet<>(
        List.of(CwsSubmission.APPROVED, CwsSubmission.DECLINED, CwsSubmission.SUBMITTED, CwsSubmission.INTERVIEW, CwsSubmission.NOT_SELECTED, CwsSubmission.CLOSED)
    );

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final CwsSubmissionRepository submissions;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final OrgResumeRepository resumes;
    private final OrgMemberDirectoryRepository memberDirectory;
    private final UserRepository users;
    private final Clock clock;

    @Autowired
    public ConsultantSubmissionsService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        CwsSubmissionRepository submissions,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        OrgResumeRepository resumes,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users
    ) {
        this(gate, authorization, submissions, requirements, clients, resumes, memberDirectory, users, Clock.systemUTC());
    }

    ConsultantSubmissionsService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        CwsSubmissionRepository submissions,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        OrgResumeRepository resumes,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users,
        Clock clock
    ) {
        this.gate = gate;
        this.authorization = authorization;
        this.submissions = submissions;
        this.requirements = requirements;
        this.clients = clients;
        this.resumes = resumes;
        this.memberDirectory = memberDirectory;
        this.users = users;
        this.clock = clock;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me, String status, Integer page, Integer size) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);

        List<CwsSubmission> all = submissions.findByOrgIdAndConsultantId(org, c.getId());
        List<CwsSubmission> pending = submissions.findByOrgIdAndConsultantIdAndStatusOrderByDueAtAscIdAsc(org, c.getId(), CwsSubmission.PENDING);
        Page<CwsSubmission> past = pastPage(org, c.getId(), status, page, size);

        Lookups look = lookups(org, concat(pending, past.getContent()));
        List<Row> pendingRows = pending.stream().map(s -> row(s, look, now)).filter(Objects::nonNull).toList();
        return new Response(org, now, c.getDisplayName(), tiles(all, now), pendingRows, toPastPage(past, look, status, now));
    }

    /** Past Submissions only (the status filter and the pager call this). */
    @Transactional(readOnly = true)
    public PastPage past(OrgMembership me, String status, Integer page, Integer size) {
        ConsultantProfile c = gate.requireSelf(me);
        Instant now = Instant.now(clock);
        Page<CwsSubmission> past = pastPage(c.getOrgId(), c.getId(), status, page, size);
        return toPastPage(past, lookups(c.getOrgId(), past.getContent()), status, now);
    }

    private Page<CwsSubmission> pastPage(Long org, Long consultantId, String status, Integer page, Integer size) {
        String st = status == null || status.isBlank() ? null : status.strip().toUpperCase(java.util.Locale.ROOT);
        if (st != null && !PAST_STATUSES.contains(st)) throw TrackerException.invalid("status", "is not a status of a past submission");
        int p = page == null ? 0 : page;
        int s = size == null ? DEFAULT_PAGE_SIZE : size;
        if (p < 0) throw TrackerException.invalid("page", "must be 0 or more");
        if (s < 1 || s > MAX_PAGE_SIZE) throw TrackerException.invalid("size", "must be between 1 and " + MAX_PAGE_SIZE);
        PageRequest req = PageRequest.of(p, s);
        return st == null ? submissions.findPast(org, consultantId, req) : submissions.findPastWithStatus(org, consultantId, st, req);
    }

    private PastPage toPastPage(Page<CwsSubmission> past, Lookups look, String status, Instant now) {
        String st = status == null || status.isBlank() ? null : status.strip().toUpperCase(java.util.Locale.ROOT);
        List<Row> rows = past.getContent().stream().map(s -> row(s, look, now)).filter(Objects::nonNull).toList();
        return new PastPage(rows, past.getNumber(), past.getSize(), past.getTotalElements(), past.getTotalPages(), st);
    }

    // ---- the tiles ------------------------------------------------------------------------------------------------

    /**
     * Pending: rows waiting now (week delta). Approved: every submission the consultant ever approved, i.e. not pending and not declined
     * (month delta, stamped decided_at). Submitted to Client: rows with a submitted_on time (month delta). Needs Attention: pending rows
     * due within 24 hours or already past due (week delta). Each delta compares the value now with how many of those same rows already
     * existed (were stamped) before the window; no delta when that earlier count is zero.
     */
    static Tiles tiles(List<CwsSubmission> all, Instant now) {
        Instant soon = now.plus(ATTENTION_WINDOW);
        List<CwsSubmission> pending = all.stream().filter(s -> CwsSubmission.PENDING.equals(s.getStatus())).toList();
        List<CwsSubmission> approved = all.stream().filter(s -> !CwsSubmission.PENDING.equals(s.getStatus()) && !CwsSubmission.DECLINED.equals(s.getStatus())).toList();
        List<CwsSubmission> submitted = all.stream().filter(s -> s.getSubmittedOn() != null).toList();
        List<CwsSubmission> attention = pending.stream().filter(s -> needsAttention(s, soon)).toList();
        return new Tiles(
            tile(pending.size(), pending.stream().map(CwsSubmission::getCreatedAt).toList(), now, 7, "week"),
            tile(approved.size(), approved.stream().map(s -> s.getDecidedAt() != null ? s.getDecidedAt() : s.getCreatedAt()).toList(), now, 30, "month"),
            tile(submitted.size(), submitted.stream().map(CwsSubmission::getSubmittedOn).toList(), now, 30, "month"),
            tile(attention.size(), attention.stream().map(CwsSubmission::getCreatedAt).toList(), now, 7, "week")
        );
    }

    static boolean needsAttention(CwsSubmission s, Instant soon) {
        return CwsSubmission.PENDING.equals(s.getStatus()) && s.getDueAt() != null && !s.getDueAt().isAfter(soon);
    }

    static Tile tile(long value, List<Instant> stamps, Instant now, int windowDays, String vs) {
        Instant before = now.minus(Duration.ofDays(windowDays));
        long previous = stamps.stream().filter(t -> t != null && t.isBefore(before)).count();
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            spark.add(stamps.stream().filter(t -> t != null && !t.isAfter(at)).count());
        }
        return new Tile(value, previous, delta, spark, vs);
    }

    // ---- one submission -------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, long id) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        CwsSubmission s = own(org, c.getId(), id);
        Instant now = Instant.now(clock);
        Lookups look = lookups(org, List.of(s));
        Row row = row(s, look, now);
        if (row == null) throw new OrgNotFoundException();
        ClientRequirement r = look.reqs.get(s.getRequirementId());
        OrgResume res = s.getResumeId() == null ? null : look.resumes.get(s.getResumeId());
        ResumeSummary resume = res == null ? null : new ResumeSummary(res.getId(), res.getName(), res.getVersionNo(), res.getHeadline(), res.getSummaryText(), res.getFileName(), res.getUpdatedAt());
        String desc = r.getDescriptionText();
        if (desc != null && desc.length() > MAX_DESCRIPTION) desc = desc.substring(0, MAX_DESCRIPTION).stripTrailing() + "...";
        return new Detail(row, s.getDeclineReason(), r.getLocation(), r.getWorkMode(), desc, resume, s.getCreatedAt());
    }

    // ---- the two decisions ----------------------------------------------------------------------------------------

    /**
     * Approves a submission still waiting for the consultant. Records the attestation (status APPROVED, decided_at) and nothing else:
     * nothing is sent to a client and nothing is submitted by Kiwiply; the marketer proceeds only after this. A second call is a 409.
     */
    @Transactional
    public Decision approve(OrgMembership me, long id) {
        ConsultantProfile c = requireAuthorizer(me);
        CwsSubmission s = own(c.getOrgId(), c.getId(), id);
        return decide(c, s, CwsSubmission.APPROVED, null);
    }

    /** Declines a pending submission with a reason (3 to 300 characters, scanned for sensitive data). A second call is a 409. */
    @Transactional
    public Decision decline(OrgMembership me, long id, String reason) {
        ConsultantProfile c = requireAuthorizer(me);
        CwsSubmission s = own(c.getOrgId(), c.getId(), id);
        return decide(c, s, CwsSubmission.DECLINED, cleanReason(reason));
    }

    private Decision decide(ConsultantProfile c, CwsSubmission s, String to, String reason) {
        Instant now = Instant.now(clock);
        int moved = submissions.transition(c.getOrgId(), c.getId(), s.getId(), CwsSubmission.PENDING, to, now, reason);
        if (moved == 0) {
            CwsSubmission fresh = own(c.getOrgId(), c.getId(), s.getId());
            throw OrgException.coded(409, CODE_NOT_PENDING, notPendingMessage(fresh.getStatus()), Map.of("status", fresh.getStatus()));
        }
        return new Decision(s.getId(), to, now);
    }

    static String notPendingMessage(String status) {
        return switch (status) {
            case CwsSubmission.APPROVED -> "You already approved this submission.";
            case CwsSubmission.DECLINED -> "You already declined this submission.";
            default -> "This submission is no longer waiting for your approval.";
        };
    }

    static String cleanReason(String reason) {
        String v = reason == null ? "" : reason.strip();
        if (v.length() < MIN_REASON || v.length() > MAX_REASON) throw TrackerException.invalid("reason", "must be " + MIN_REASON + " to " + MAX_REASON + " characters");
        SensitiveContent.check("reason", "reason", v);
        return v;
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    /** The read gate plus {@code submissions.authorize}. */
    private ConsultantProfile requireAuthorizer(OrgMembership me) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(AUTHORIZE_PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        return c;
    }

    private CwsSubmission own(Long org, Long consultantId, long id) {
        return submissions.findByOrgIdAndConsultantIdAndId(org, consultantId, id).orElseThrow(OrgNotFoundException::new);
    }

    private static List<CwsSubmission> concat(List<CwsSubmission> a, List<CwsSubmission> b) {
        List<CwsSubmission> out = new ArrayList<>(a);
        out.addAll(b);
        return out;
    }

    private record Lookups(Map<Long, ClientRequirement> reqs, Map<Long, ClientAccount> clients, Map<Long, OrgResume> resumes, Map<Long, String> marketers) {}

    private Lookups lookups(Long org, List<CwsSubmission> rows) {
        Map<Long, ClientRequirement> reqs = rows.isEmpty()
            ? Map.of()
            : requirements.findAllById(rows.stream().map(CwsSubmission::getRequirementId).distinct().toList()).stream()
                .filter(r -> org.equals(r.getOrgId()))
                .collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
        Map<Long, ClientAccount> clientById = rows.isEmpty() ? Map.of() : clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
        Map<Long, OrgResume> resumeById = new HashMap<>();
        for (Long rid : rows.stream().map(CwsSubmission::getResumeId).filter(Objects::nonNull).distinct().toList()) {
            resumes.findByOrgIdAndId(org, rid).ifPresent(r -> resumeById.put(rid, r));
        }
        Map<Long, String> marketers = new HashMap<>();
        List<Long> marketerIds = rows.stream().map(CwsSubmission::getMarketerMemberId).filter(Objects::nonNull).distinct().toList();
        if (!marketerIds.isEmpty()) {
            for (OrgMember seat : memberDirectory.findByOrgIdAndIdIn(org, marketerIds)) {
                User u = seat.getUserId() == null ? null : users.findById(seat.getUserId()).orElse(null);
                marketers.put(seat.getId(), ConsultantMarketerService.personName(u, seat));
            }
        }
        return new Lookups(reqs, clientById, resumeById, marketers);
    }

    private Row row(CwsSubmission s, Lookups look, Instant now) {
        ClientRequirement r = look.reqs.get(s.getRequirementId());
        if (r == null) return null;
        ClientAccount cl = r.getClientId() == null ? null : look.clients.get(r.getClientId());
        OrgResume res = s.getResumeId() == null ? null : look.resumes.get(s.getResumeId());
        Integer version = s.getResumeVersionNo() != null ? s.getResumeVersionNo() : res == null ? null : res.getVersionNo();
        return new Row(
            s.getId(), r.getId(), r.getTitle(), r.getEmploymentLabel(), cl == null ? null : cl.getName(), res == null ? null : res.getId(), version,
            res == null ? null : res.getUpdatedAt(), s.getMarketerNote(), s.getMarketerMemberId() == null ? null : look.marketers.get(s.getMarketerMemberId()),
            s.getDueAt(), needsAttention(s, now.plus(ATTENTION_WINDOW)), s.getStatus(), s.getSubmittedOn(), s.getDecidedAt(), s.getClientUpdate(),
            s.getClientUpdateAt(), s.isSampleData()
        );
    }
}
