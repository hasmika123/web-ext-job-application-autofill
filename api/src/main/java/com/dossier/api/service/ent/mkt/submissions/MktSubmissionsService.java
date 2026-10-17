package com.dossier.api.service.ent.mkt.submissions;

import com.dossier.api.domain.ent.mkt.MktSubmission;
import com.dossier.api.domain.ent.mkt.MktSubmissionEvent;
import com.dossier.api.domain.ent.mkt.MktSubmissionView;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.repository.ent.mkt.MktSubmissionEventRepository;
import com.dossier.api.repository.ent.mkt.MktSubmissionRepository;
import com.dossier.api.repository.ent.mkt.MktSubmissionViewRepository;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.*;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.ent.applications.EntChangeActors;
import com.dossier.api.service.tracker.Changes;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Submissions page. A submission here is a RECORD of a profile package a marketer prepared for a job, with an approval state
 * (E1: the marketer prepares, requests and records; the consultant submits; nothing is ever sent to a client by this system).
 *
 * <p>Every call goes through {@link MktScope} (key {@code submissions.record}): a caller outside the module / without the key gets the generic 404, and
 * only consultants the caller is assigned to (ASSIGNED scope) are ever read or written; a consultant outside the set is a 404. Writes additionally
 * pass the WRITE authorization (an organization that is past due or closed refuses them), validate free text with the PII scanner, append a
 * {@code mkt_submission_event} and write an audit row. KPI deltas are computed from those events (the state a package was in a week ago), never invented.
 */
@Service
public class MktSubmissionsService {

    public static final String KEY = "submissions.record";
    public static final int MAX_VIEWS = 20;
    public static final int MAX_SIZE = 100;
    public static final List<String> BUCKETS = List.of("DRAFT", "AWAITING_APPROVAL", "SUBMITTED", "CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED");
    private static final Map<String, String> BUCKET_LABEL = Map.of(
        "DRAFT", "Draft", "AWAITING_APPROVAL", "Awaiting Approval", "SUBMITTED", "Submitted", "CLIENT_REVIEW", "Client Review",
        "INTERVIEW_REQUESTED", "Interview Requested", "REJECTED", "Rejected"
    );
    private static final Set<String> APPROVALS = Set.of("DRAFT", "AWAITING_APPROVAL", "APPROVED", "REJECTED");
    private static final Map<String, Set<String>> NEXT_STATUS = Map.of(
        "DRAFT", Set.of("SUBMITTED"),
        "SUBMITTED", Set.of("CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED"),
        "CLIENT_REVIEW", Set.of("INTERVIEW_REQUESTED", "REJECTED"),
        "INTERVIEW_REQUESTED", Set.of("REJECTED"),
        "REJECTED", Set.of()
    );
    private static final Map<String, Long> PERIOD_DAYS = Map.of("7d", 7L, "30d", 30L, "90d", 90L);

    private final MktScope scope;
    private final AuthorizationService authorization;
    private final MktSubmissionRepository submissions;
    private final MktSubmissionEventRepository events;
    private final MktSubmissionViewRepository views;
    private final OrgAuditService audit;
    private final EntChangeActors changeActors;
    private final Clock clock;

    @Autowired
    public MktSubmissionsService(
        MktScope scope, AuthorizationService authorization, MktSubmissionRepository submissions, MktSubmissionEventRepository events,
        MktSubmissionViewRepository views, OrgAuditService audit, EntChangeActors changeActors
    ) {
        this(scope, authorization, submissions, events, views, audit, changeActors, Clock.systemUTC());
    }

    MktSubmissionsService(
        MktScope scope, AuthorizationService authorization, MktSubmissionRepository submissions, MktSubmissionEventRepository events,
        MktSubmissionViewRepository views, OrgAuditService audit, EntChangeActors changeActors, Clock clock
    ) {
        this.changeActors = changeActors;
        this.scope = scope;
        this.authorization = authorization;
        this.submissions = submissions;
        this.events = events;
        this.views = views;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- read ------------------------------------------------------------------------------------------------------------------

    /** The whole board in one call. */
    @Transactional(readOnly = true)
    public BoardResponse board(OrgMembership me, Query query) {
        MktScope.View view = scope.resolve(me, KEY);
        Instant now = clock.instant();
        List<MktSubmission> all = visible(view);
        Lookups lk = lookups(view.orgId(), all);
        Map<Long, List<MktSubmissionEvent>> evs = eventsOf(view.orgId(), all);

        Kpis kpis = kpis(all, evs, now);

        String donut = period(query.donutPeriod());
        Instant donutFrom = from(donut, now);
        Breakdown breakdown = breakdown(donut, all.stream().filter(s -> donutFrom == null || !s.shownAt().isBefore(donutFrom)).toList());

        List<Row> filtered = filter(all, lk, query, now);
        sort(filtered, query.sort(), query.dir());
        int size = Math.max(1, Math.min(MAX_SIZE, query.size() <= 0 ? 10 : query.size()));
        int page = Math.max(0, query.page());
        int fromIdx = (int) Math.min((long) page * size, filtered.size());
        List<Row> items = filtered.subList(fromIdx, Math.min(filtered.size(), fromIdx + size));

        return new BoardResponse(
            kpis, List.copyOf(items), filtered.size(), page, size, breakdown, activity(all, lk, evs), filterOptions(all, lk), savedViews(view)
        );
    }

    /** One record with its history. A consultant the caller may not see, or an unknown id, is a 404. */
    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, Long id) {
        MktScope.View view = scope.resolve(me, KEY);
        MktSubmission s = live(view, id);
        List<Event> evs = events.findByOrgIdAndSubmissionIdOrderByOccurredAtAsc(view.orgId(), s.getId()).stream()
            .map(e -> new Event(e.getId(), e.getKind(), e.getField(), e.getFromValue(), e.getToValue(), e.getDetail(), e.getOccurredAt())).toList();
        return new Detail(row(s, lookups(view.orgId(), List.of(s))), s.getNote(), evs);
    }

    /** The choices of the New Submission dialog (assigned consultants, open jobs). */
    @Transactional(readOnly = true)
    public Options options(OrgMembership me) {
        MktScope.View view = scope.resolve(me, KEY);
        Long orgId = view.orgId();
        List<ConsultantProfile> consultants;
        if (view.all()) consultants = submissions.findActiveConsultants(orgId);
        else if (view.consultantIds().isEmpty()) consultants = List.of();
        else consultants = submissions.findConsultants(orgId, view.consultantIds()).stream().filter(c -> "ACTIVE".equals(c.getStatus())).sorted(Comparator.comparing(c -> low(c.getDisplayName()))).toList();
        List<ClientRequirement> jobs = submissions.findOpenRequirements(orgId);
        Map<Long, String> clientNames = new HashMap<>();
        if (!jobs.isEmpty()) submissions.findClients(orgId, jobs.stream().map(ClientRequirement::getClientId).collect(java.util.stream.Collectors.toSet())).forEach(a -> clientNames.put(a.getId(), a.getName()));
        return new Options(
            consultants.stream().limit(300).map(c -> new Person(c.getId(), c.getDisplayName(), c.getJobTitle(), null)).toList(),
            jobs.stream().limit(300).map(j -> new OptionJob(j.getId(), j.getTitle(), jobCode(j.getId()), clientNames.getOrDefault(j.getClientId(), ""))).toList()
        );
    }

    // ---- writes (each: scope + WRITE authorization, no external effect) -------------------------------------------------------

    /** The duplicate guard (Sprint 2 / B1); null in unit tests built by hand. */
    private com.dossier.api.service.ent.pipeline.DuplicateGuard guard;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setGuard(com.dossier.api.service.ent.pipeline.DuplicateGuard guard) {
        this.guard = guard;
    }

    /** Prepare a package for a job: creates a DRAFT record. It does not send anything. */
    @Transactional
    public Row create(OrgMembership me, CreateRequest req) {
        MktScope.View view = gateWrite(me);
        if (req == null || req.consultantId() == null || req.requirementId() == null) throw OrgException.invalid("consultantId", "a consultant and a job are required");
        String note = cleanText("note", req.note(), 300);
        Long orgId = view.orgId();
        ConsultantProfile consultant = submissions.findConsultant(orgId, req.consultantId()).orElseThrow(OrgNotFoundException::new);
        scope.require(view, consultant.getId());
        ClientRequirement job = submissions.findRequirement(orgId, req.requirementId()).orElseThrow(OrgNotFoundException::new);
        OrgResume resume = null;
        if (req.resumeId() != null) {
            resume = submissions.findResume(orgId, req.resumeId()).orElseThrow(OrgNotFoundException::new);
            if (!consultant.getId().equals(resume.getConsultantId())) throw new OrgNotFoundException();
        } else {
            resume = submissions.findPrimaryResume(orgId, consultant.getId()).orElse(null);
        }
        if (submissions.existsByOrgIdAndConsultantIdAndRequirementIdAndArchivedAtIsNull(orgId, consultant.getId(), job.getId())) {
            throw state("SUBMISSION_EXISTS", "A submission for this consultant and job already exists.");
        }
        if (guard != null) guard.enforce(me, consultant.getId(), job, com.dossier.api.service.ent.pipeline.DuplicateGuard.Confirm.of(req.confirmDuplicate(), req.duplicateReason())); // record time (Sprint 2 / B1)
        Instant now = clock.instant();
        MktSubmission s = new MktSubmission();
        s.setOrgId(orgId);
        s.setCode(nextCode(orgId, now));
        s.setConsultantId(consultant.getId());
        s.setRequirementId(job.getId());
        s.setClientId(job.getClientId());
        if (resume != null) {
            s.setResumeId(resume.getId());
            s.setResumeVersion(resume.getVersionNo());
            s.setResumeMinor(0);
            s.setResumeUpdatedAt(resume.getUpdatedAt());
        }
        s.setPreparedByMemberId(me.memberId());
        s.setCreatedByMemberId(me.memberId());
        s.setUpdatedByMemberId(me.memberId());
        s.setNote(note);
        s.setCreatedAt(now);
        s.setUpdatedAt(now);
        s = submissions.save(s);
        event(s, MktSubmissionEvent.CREATED, null, null, "DRAFT", me, note, now);
        record(me, "MARKETER_SUBMISSION_CREATE", s, "code=" + s.getCode());
        return row(s, lookups(orgId, List.of(s)));
    }

    /** Ask the consultant/approver to approve the package (DRAFT to AWAITING_APPROVAL). */
    @Transactional
    public Row requestApproval(OrgMembership me, Long id) {
        MktScope.View view = gateWrite(me);
        MktSubmission s = live(view, id);
        if (!MktSubmission.DRAFT.equals(s.getApprovalState()) || !MktSubmission.DRAFT.equals(s.getStatus())) {
            throw state("SUBMISSION_STATE", "Only a draft that has not been sent for approval can be sent.");
        }
        Instant now = clock.instant();
        s.setApprovalState(MktSubmission.AWAITING_APPROVAL);
        s = submissions.save(s);
        event(s, MktSubmissionEvent.APPROVAL_REQUESTED, MktSubmissionEvent.FIELD_APPROVAL, "DRAFT", "AWAITING_APPROVAL", me, null, now);
        record(me, "MARKETER_SUBMISSION_REQUEST_APPROVAL", s, "code=" + s.getCode());
        return row(s, lookups(view.orgId(), List.of(s)));
    }

    /** Record the consultant/approver's decision (AWAITING_APPROVAL to APPROVED or REJECTED). A rejected approval also ends the record as REJECTED. */
    @Transactional
    public Row recordApproval(OrgMembership me, Long id, ApprovalRequest req) {
        MktScope.View view = gateWrite(me);
        MktSubmission s = live(view, id);
        String decision = req == null || req.decision() == null ? "" : req.decision().trim().toUpperCase(Locale.ROOT);
        if (!decision.equals("APPROVED") && !decision.equals("REJECTED")) throw OrgException.invalid("decision", "must be APPROVED or REJECTED");
        String note = cleanText("note", req.note(), 300);
        if (!MktSubmission.AWAITING_APPROVAL.equals(s.getApprovalState())) throw state("SUBMISSION_STATE", "This package is not waiting for an approval.");
        Instant now = clock.instant();
        s.setApprovalState(decision);
        if (decision.equals("REJECTED")) s.setStatus(MktSubmission.REJECTED);
        s = submissions.save(s);
        event(s, MktSubmissionEvent.APPROVAL_DECIDED, MktSubmissionEvent.FIELD_APPROVAL, "AWAITING_APPROVAL", decision, me, note, now);
        record(me, "MARKETER_SUBMISSION_APPROVAL", s, "code=" + s.getCode() + " decision=" + decision);
        return row(s, lookups(view.orgId(), List.of(s)));
    }

    /** Record a fact about where the submission stands (the consultant submitted; the client moved it to review / asked for an interview / declined). */
    @Transactional
    public Row recordStatus(OrgMembership me, Long id, StatusRequest req) {
        MktScope.View view = gateWrite(me);
        MktSubmission s = live(view, id);
        String next = req == null || req.status() == null ? "" : req.status().trim().toUpperCase(Locale.ROOT);
        if (!BUCKETS.contains(next) || next.equals("DRAFT") || next.equals("AWAITING_APPROVAL")) throw OrgException.invalid("status", "must be SUBMITTED, CLIENT_REVIEW, INTERVIEW_REQUESTED or REJECTED");
        String note = cleanText("note", req.note(), 300);
        if (!NEXT_STATUS.getOrDefault(s.getStatus(), Set.of()).contains(next)) throw state("SUBMISSION_STATE", "That status cannot be recorded from " + s.getStatus() + ".");
        if (MktSubmission.DRAFT.equals(s.getStatus()) && !MktSubmission.APPROVED.equals(s.getApprovalState())) {
            throw state("SUBMISSION_NOT_APPROVED", "A package can be recorded as submitted only after it is approved.");
        }
        Instant now = clock.instant();
        String from = s.getStatus();
        s.setStatus(next);
        if (next.equals(MktSubmission.SUBMITTED) && s.getSubmittedOn() == null) s.setSubmittedOn(now);
        s = submissions.save(s);
        event(s, MktSubmissionEvent.STATUS_RECORDED, MktSubmissionEvent.FIELD_STATUS, from, next, me, note, now);
        record(me, "MARKETER_SUBMISSION_STATUS", s, "code=" + s.getCode() + " status=" + next);
        return row(s, lookups(view.orgId(), List.of(s)));
    }

    /** Withdraw a draft the marketer no longer wants to pursue: the row leaves the board, its history stays. */
    @Transactional
    public void withdraw(OrgMembership me, Long id) {
        MktScope.View view = gateWrite(me);
        MktSubmission s = live(view, id);
        boolean open = MktSubmission.DRAFT.equals(s.getStatus()) && (MktSubmission.DRAFT.equals(s.getApprovalState()) || MktSubmission.AWAITING_APPROVAL.equals(s.getApprovalState()));
        if (!open) throw state("SUBMISSION_STATE", "Only a draft can be withdrawn.");
        Instant now = clock.instant();
        s.setArchivedAt(now);
        s = submissions.save(s);
        event(s, MktSubmissionEvent.WITHDRAWN, null, null, null, me, null, now);
        record(me, "MARKETER_SUBMISSION_WITHDRAW", s, "code=" + s.getCode());
    }

    // ---- saved views ("Save View"): private to the marketer -------------------------------------------------------------------

    @Transactional
    public SavedView saveView(OrgMembership me, ViewRequest req) {
        MktScope.View view = scope.resolve(me, KEY);
        String name = req == null || req.name() == null ? "" : req.name().trim();
        if (name.isEmpty() || name.length() > 60) throw OrgException.invalid("name", "give the view a name of 1 to 60 characters");
        SensitiveContent.check("name", "name", name);
        String q = cleanText("q", req.q(), 120);
        String jobTitle = cleanText("jobTitle", req.jobTitle(), 200);
        String status = blankToNull(req.status());
        if (status != null && !BUCKETS.contains(status)) throw OrgException.invalid("status", "unknown status");
        String approval = blankToNull(req.approval());
        if (approval != null && !APPROVALS.contains(approval)) throw OrgException.invalid("approval", "unknown approval state");
        String period = blankToNull(req.period());
        if (period != null && !period.equals("all") && !PERIOD_DAYS.containsKey(period)) throw OrgException.invalid("period", "unknown period");
        Long clientId = req.clientId();
        if (clientId != null && submissions.findClients(view.orgId(), List.of(clientId)).isEmpty()) clientId = null;
        MktSubmissionView v = views.findByOrgIdAndMemberIdAndName(view.orgId(), view.memberId(), name).orElse(null);
        if (v == null) {
            if (views.countByOrgIdAndMemberId(view.orgId(), view.memberId()) >= MAX_VIEWS) throw OrgException.invalid("name", "you can keep up to " + MAX_VIEWS + " saved views");
            v = new MktSubmissionView();
            v.setOrgId(view.orgId());
            v.setMemberId(view.memberId());
            v.setName(name);
        }
        v.setQ(q);
        v.setStatusFilter(status);
        v.setApprovalFilter(approval);
        v.setClientId(clientId);
        v.setJobTitle(jobTitle);
        v.setPeriod(period);
        return toView(views.save(v));
    }

    @Transactional
    public void deleteView(OrgMembership me, Long id) {
        MktScope.View view = scope.resolve(me, KEY);
        MktSubmissionView v = views.findByOrgIdAndMemberIdAndId(view.orgId(), view.memberId(), id).orElseThrow(OrgNotFoundException::new);
        views.deleteByOrgIdAndMemberIdAndId(view.orgId(), view.memberId(), v.getId());
    }

    // ---- internals -------------------------------------------------------------------------------------------------------------

    private MktScope.View gateWrite(OrgMembership me) {
        MktScope.View view = scope.resolve(me, KEY);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(KEY), Beneficiary.NONE, null, AuthzOperation.WRITE).withActor(me));
        return view;
    }

    private MktSubmission live(MktScope.View view, Long id) {
        MktSubmission s = submissions.findByOrgIdAndId(view.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (s.getArchivedAt() != null) throw new OrgNotFoundException();
        scope.require(view, s.getConsultantId());
        return s;
    }

    private List<MktSubmission> visible(MktScope.View view) {
        if (view.all()) return submissions.findByOrgIdAndArchivedAtIsNull(view.orgId());
        if (view.consultantIds().isEmpty()) return List.of();
        return submissions.findByOrgIdAndConsultantIdInAndArchivedAtIsNull(view.orgId(), view.consultantIds());
    }

    private Map<Long, List<MktSubmissionEvent>> eventsOf(Long orgId, List<MktSubmission> rows) {
        Map<Long, List<MktSubmissionEvent>> out = new HashMap<>();
        if (rows.isEmpty()) return out;
        for (MktSubmissionEvent e : events.findByOrgIdAndSubmissionIdInOrderByOccurredAtAsc(orgId, rows.stream().map(MktSubmission::getId).toList())) {
            out.computeIfAbsent(e.getSubmissionId(), k -> new ArrayList<>()).add(e);
        }
        return out;
    }

    /** consultants, jobs and clients of a set of rows, read inside the organization. */
    private record Lookups(Map<Long, ConsultantProfile> consultants, Map<Long, ClientRequirement> jobs, Map<Long, ClientAccount> clients, EntChangeActors.Lookup actors) {}

    private Lookups lookups(Long orgId, Collection<MktSubmission> rows) {
        Map<Long, ConsultantProfile> c = new HashMap<>();
        Map<Long, ClientRequirement> j = new HashMap<>();
        Map<Long, ClientAccount> a = new HashMap<>();
        if (!rows.isEmpty()) {
            Set<Long> cIds = new LinkedHashSet<>(), jIds = new LinkedHashSet<>(), aIds = new LinkedHashSet<>();
            for (MktSubmission s : rows) {
                cIds.add(s.getConsultantId());
                jIds.add(s.getRequirementId());
                aIds.add(s.getClientId());
            }
            submissions.findConsultants(orgId, cIds).forEach(x -> c.put(x.getId(), x));
            submissions.findRequirements(orgId, jIds).forEach(x -> j.put(x.getId(), x));
            submissions.findClients(orgId, aIds).forEach(x -> a.put(x.getId(), x));
        }
        Set<Long> updaters = new LinkedHashSet<>();
        List<EntChangeActors.Subject> subjects = new ArrayList<>();
        for (MktSubmission x : rows) {
            updaters.add(x.getUpdatedByMemberId());
            subjects.add(new EntChangeActors.Subject(x.getConsultantId(), x.getPreparedByMemberId()));
        }
        return new Lookups(c, j, a, changeActors.load(orgId, updaters, subjects));
    }

    static String bucketOf(MktSubmission s) {
        return MktSubmission.AWAITING_APPROVAL.equals(s.getApprovalState()) ? "AWAITING_APPROVAL" : s.getStatus();
    }

    static String jobCode(Long requirementId) {
        return "JOB-" + (1000 + requirementId);
    }

    static String versionLabel(MktSubmission s) {
        return s.getResumeVersion() == null ? null : "v" + s.getResumeVersion() + "." + (s.getResumeMinor() == null ? 0 : s.getResumeMinor());
    }

    private Row row(MktSubmission s, Lookups lk) {
        ConsultantProfile c = lk.consultants().get(s.getConsultantId());
        ClientRequirement j = lk.jobs().get(s.getRequirementId());
        ClientAccount a = lk.clients().get(s.getClientId());
        String version = versionLabel(s);
        return new Row(
            s.getId(), s.getCode(),
            new Person(s.getConsultantId(), c == null ? "Unknown" : c.getDisplayName(), c == null ? null : c.getJobTitle(), null),
            new Job(s.getRequirementId(), j == null ? "Unknown job" : j.getTitle(), jobCode(s.getRequirementId())),
            new ClientRef(s.getClientId(), a == null ? "Unknown client" : a.getName()),
            s.shownAt(), s.getApprovalState(),
            version == null ? null : new ResumeRef(s.getResumeId(), version, s.getResumeUpdatedAt()),
            s.getStatus(), bucketOf(s), actionsOf(s),
            s.getUpdatedAt(), lk.actors().of(s.getUpdatedByMemberId(), null, new EntChangeActors.Subject(s.getConsultantId(), s.getPreparedByMemberId()))
        );
    }

    /** What may be recorded on the row now (the same rules the writes enforce). */
    static List<String> actionsOf(MktSubmission s) {
        List<String> out = new ArrayList<>();
        boolean draft = MktSubmission.DRAFT.equals(s.getStatus());
        if (draft && MktSubmission.DRAFT.equals(s.getApprovalState())) {
            out.add("REQUEST_APPROVAL");
            out.add("WITHDRAW");
        } else if (draft && MktSubmission.AWAITING_APPROVAL.equals(s.getApprovalState())) {
            out.add("RECORD_APPROVAL");
            out.add("WITHDRAW");
        } else if (draft && MktSubmission.APPROVED.equals(s.getApprovalState())) {
            out.add("RECORD_STATUS");
        } else if (!NEXT_STATUS.getOrDefault(s.getStatus(), Set.of()).isEmpty()) {
            out.add("RECORD_STATUS");
        }
        return out;
    }

    // ---- filter / sort -----------------------------------------------------------------------------------------------------------

    private static String period(String p) {
        return p == null || p.isBlank() ? "30d" : p;
    }

    private static Instant from(String period, Instant now) {
        if ("all".equals(period)) return null;
        Long days = PERIOD_DAYS.get(period);
        if (days == null) throw OrgException.invalid("period", "must be 7d, 30d, 90d or all");
        return now.minus(Duration.ofDays(days));
    }

    private List<Row> filter(List<MktSubmission> all, Lookups lk, Query q, Instant now) {
        String text = q.q() == null ? "" : q.q().trim().toLowerCase(Locale.ROOT);
        String status = blankToNull(q.status());
        if (status != null && !BUCKETS.contains(status)) throw OrgException.invalid("status", "unknown status");
        String approval = blankToNull(q.approval());
        if (approval != null && !APPROVALS.contains(approval)) throw OrgException.invalid("approval", "unknown approval state");
        String title = blankToNull(q.jobTitle());
        Instant since = from(period(q.period()), now);
        List<Row> out = new ArrayList<>();
        for (MktSubmission s : all) {
            if (since != null && s.shownAt().isBefore(since)) continue;
            if (status != null && !status.equals(bucketOf(s))) continue;
            if (approval != null && !approval.equals(s.getApprovalState())) continue;
            if (q.clientId() != null && !q.clientId().equals(s.getClientId())) continue;
            Row r = row(s, lk);
            if (title != null && !title.equalsIgnoreCase(r.job().title())) continue;
            if (!text.isEmpty() && !matches(r, text)) continue;
            out.add(r);
        }
        return out;
    }

    private static boolean matches(Row r, String text) {
        return low(r.consultant().name()).contains(text) || low(r.job().title()).contains(text) || low(r.client().name()).contains(text)
            || low(r.code()).contains(text) || low(r.job().code()).contains(text);
    }

    private static String low(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT);
    }

    private static void sort(List<Row> rows, String sort, String dir) {
        String key = sort != null && SORTS.contains(sort) ? sort : "date";
        Comparator<Row> cmp = switch (key) {
            case "consultant" -> Comparator.comparing((Row r) -> low(r.consultant().name()));
            case "jobTitle" -> Comparator.comparing((Row r) -> low(r.job().title()));
            case "client" -> Comparator.comparing((Row r) -> low(r.client().name()));
            case "approval" -> Comparator.comparing((Row r) -> r.approvalState());
            case "status" -> Comparator.comparing((Row r) -> r.status());
            case "resume" -> Comparator.comparing((Row r) -> r.resume() == null ? "" : r.resume().version(), Comparator.nullsFirst(Comparator.naturalOrder()));
            default -> Comparator.comparing((Row r) -> r.submissionDate());
        };
        boolean desc = dir == null || dir.isBlank() ? key.equals("date") : dir.equalsIgnoreCase("desc");
        rows.sort((desc ? cmp.reversed() : cmp).thenComparing(Comparator.comparing((Row r) -> r.id()).reversed()));
    }

    private static final Set<String> SORTS = Set.of("consultant", "jobTitle", "client", "date", "approval", "resume", "status");

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    // ---- KPIs, breakdown, activity -----------------------------------------------------------------------------------------------

    private Kpis kpis(List<MktSubmission> all, Map<Long, List<MktSubmissionEvent>> evs, Instant now) {
        Kpi pending = stateKpi(all, evs, now, "APPROVAL", MktSubmission.AWAITING_APPROVAL);
        Kpi review = stateKpi(all, evs, now, "STATUS", MktSubmission.CLIENT_REVIEW);
        Kpi rejected = stateKpi(all, evs, now, "STATUS", MktSubmission.REJECTED);

        Instant dayStart = LocalDate.ofInstant(now, ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
        long today = submittedBetween(all, dayStart, now.plusSeconds(1));
        Instant ySame = now.minus(Duration.ofDays(1));
        long yesterday = submittedBetween(all, dayStart.minus(Duration.ofDays(1)), ySame.plusSeconds(1));
        List<Long> daily = new ArrayList<>();
        for (int i = 7; i >= 0; i--) {
            Instant start = dayStart.minus(Duration.ofDays(i));
            daily.add(submittedBetween(all, start, i == 0 ? now.plusSeconds(1) : start.plus(Duration.ofDays(1))));
        }
        return new Kpis(pending, new Kpi(today, pct(today, yesterday), daily), review, rejected);
    }

    private static long submittedBetween(List<MktSubmission> all, Instant fromInclusive, Instant toExclusive) {
        return all.stream().filter(s -> s.getSubmittedOn() != null && !s.getSubmittedOn().isBefore(fromInclusive) && s.getSubmittedOn().isBefore(toExclusive)).count();
    }

    /** Count of rows whose {@code field} (APPROVAL or STATUS) is {@code wanted} now, against a week ago, plus eight weekly points. */
    private Kpi stateKpi(List<MktSubmission> all, Map<Long, List<MktSubmissionEvent>> evs, Instant now, String field, String wanted) {
        long current = all.stream().filter(s -> wanted.equals(field.equals("APPROVAL") ? s.getApprovalState() : s.getStatus())).count();
        List<Long> spark = new ArrayList<>();
        for (int i = 7; i >= 1; i--) spark.add(countAt(all, evs, now.minus(Duration.ofDays(7L * i)), field, wanted));
        spark.add(current);
        long weekAgo = spark.get(6);
        return new Kpi(current, pct(current, weekAgo), spark);
    }

    private static long countAt(List<MktSubmission> all, Map<Long, List<MktSubmissionEvent>> evs, Instant at, String field, String wanted) {
        long n = 0;
        for (MktSubmission s : all) if (wanted.equals(stateAt(s, evs.getOrDefault(s.getId(), List.of()), at, field))) n++;
        return n;
    }

    /** The approval state or status a record had at {@code at}, rebuilt from its events; null when it did not exist yet. Package-private for the tests. */
    static String stateAt(MktSubmission s, List<MktSubmissionEvent> evs, Instant at, String field) {
        if (s.getCreatedAt().isAfter(at)) return null;
        String v = "DRAFT";
        for (MktSubmissionEvent e : evs) {
            if (e.getOccurredAt().isAfter(at)) break;
            if (field.equals(e.getField())) v = e.getToValue();
            else if (field.equals("STATUS") && MktSubmissionEvent.APPROVAL_DECIDED.equals(e.getKind()) && "REJECTED".equals(e.getToValue())) v = "REJECTED";
        }
        return v;
    }

    static Double pct(long current, long previous) {
        if (previous == 0) return null;
        return Math.round((current - previous) * 1000.0 / previous) / 10.0;
    }

    private static Breakdown breakdown(String period, List<MktSubmission> rows) {
        Map<String, Long> counts = new LinkedHashMap<>();
        BUCKETS.forEach(b -> counts.put(b, 0L));
        for (MktSubmission s : rows) counts.merge(bucketOf(s), 1L, Long::sum);
        long total = rows.size();
        List<Bucket> out = new ArrayList<>();
        for (String b : BUCKETS) out.add(new Bucket(b, BUCKET_LABEL.get(b), counts.get(b), total == 0 ? 0 : (int) Math.round(counts.get(b) * 100.0 / total)));
        return new Breakdown(period, total, out);
    }

    private List<Activity> activity(List<MktSubmission> all, Lookups lk, Map<Long, List<MktSubmissionEvent>> evs) {
        Map<Long, MktSubmission> byId = new HashMap<>();
        all.forEach(s -> byId.put(s.getId(), s));
        List<MktSubmissionEvent> flat = new ArrayList<>();
        evs.values().forEach(flat::addAll);
        flat.sort(Comparator.comparing(MktSubmissionEvent::getOccurredAt).reversed().thenComparing(Comparator.comparing(MktSubmissionEvent::getId, Comparator.nullsLast(Comparator.naturalOrder())).reversed()));
        List<Activity> out = new ArrayList<>();
        for (MktSubmissionEvent e : flat) {
            MktSubmission s = byId.get(e.getSubmissionId());
            if (s == null) continue;
            Row r = row(s, lk);
            String name = r.consultant().name();
            String where = r.job().title() + " at " + r.client().name();
            String kind;
            String text;
            String detail = where;
            String to = e.getToValue();
            switch (e.getKind()) {
                case MktSubmissionEvent.STATUS_RECORDED -> {
                    if ("SUBMITTED".equals(to)) { kind = "SUBMITTED"; text = name + " submitted to " + r.client().name(); detail = r.job().title(); }
                    else if ("CLIENT_REVIEW".equals(to)) { kind = "CLIENT_REVIEW"; text = name + " moved to Client Review"; }
                    else if ("INTERVIEW_REQUESTED".equals(to)) { kind = "INTERVIEW"; text = name + " interview requested"; }
                    else if ("REJECTED".equals(to)) { kind = "REJECTED"; text = name + "'s submission was rejected"; }
                    else continue;
                }
                case MktSubmissionEvent.APPROVAL_REQUESTED -> { kind = "APPROVAL"; text = name + "'s package was sent for approval"; }
                case MktSubmissionEvent.APPROVAL_DECIDED -> {
                    if ("APPROVED".equals(to)) { kind = "APPROVAL"; text = name + "'s package was approved"; }
                    else { kind = "REJECTED"; text = name + "'s submission was rejected"; }
                }
                case MktSubmissionEvent.CREATED -> { kind = "DRAFT"; text = "Draft prepared for " + name; }
                default -> { continue; }
            }
            out.add(new Activity(e.getId(), s.getId(), kind, text, detail, e.getOccurredAt()));
            if (out.size() == 5) break;
        }
        return out;
    }

    private FilterOptions filterOptions(List<MktSubmission> all, Lookups lk) {
        Map<Long, ClientRef> clients = new LinkedHashMap<>();
        Set<String> titles = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (MktSubmission s : all) {
            ClientAccount a = lk.clients().get(s.getClientId());
            if (a != null) clients.putIfAbsent(a.getId(), new ClientRef(a.getId(), a.getName()));
            ClientRequirement j = lk.jobs().get(s.getRequirementId());
            if (j != null && j.getTitle() != null) titles.add(j.getTitle());
        }
        List<ClientRef> sorted = new ArrayList<>(clients.values());
        sorted.sort(Comparator.comparing(c -> low(c.name())));
        return new FilterOptions(sorted, List.copyOf(titles));
    }

    private List<SavedView> savedViews(MktScope.View view) {
        if (view.memberId() == null) return List.of();
        return views.findByOrgIdAndMemberIdOrderByNameAsc(view.orgId(), view.memberId()).stream().map(MktSubmissionsService::toView).toList();
    }

    private static SavedView toView(MktSubmissionView v) {
        return new SavedView(v.getId(), v.getName(), v.getQ(), v.getStatusFilter(), v.getApprovalFilter(), v.getClientId(), v.getJobTitle(), v.getPeriod());
    }

    // ---- write helpers -------------------------------------------------------------------------------------------------------------

    private String nextCode(Long orgId, Instant now) {
        int year = LocalDate.ofInstant(now, ZoneOffset.UTC).getYear();
        long n = submissions.countByOrgId(orgId) + 1;
        String code = String.format(Locale.ROOT, "SUB-%d-%03d", year, n);
        while (submissions.existsByOrgIdAndCode(orgId, code)) code = String.format(Locale.ROOT, "SUB-%d-%03d", year, ++n);
        return code;
    }

    /**
     * The one writer of a submission's history: the event (actor, PERSON, and what changed when it moved a field: approval state or status, from to)
     * and the submission's own updated_by (change audit). The detail note is free text and stays on the event's own column, never in {@code changes}.
     */
    private void event(MktSubmission s, String kind, String field, String from, String to, OrgMembership me, String detail, Instant at) {
        s.setUpdatedByMemberId(me.memberId());
        String changes = field == null ? null : new Changes().code(MktSubmissionEvent.FIELD_APPROVAL.equals(field) ? "approvalState" : "status", from, to).toJson();
        events.save(MktSubmissionEvent.of(s.getOrgId(), s.getId(), kind, field, from, to, me.memberId(), detail, at, changes));
    }

    private void record(OrgMembership me, String action, MktSubmission s, String details) {
        audit.record(me.orgId(), me.login(), me.role(), action, "SUBMISSION", null, String.valueOf(s.getId()), details, null, null, null, "LOW");
    }

    private static String cleanText(String field, String value, int max) {
        String t = blankToNull(value);
        if (t == null) return null;
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static OrgException state(String code, String message) {
        return new OrgException(409, code, message, Map.of());
    }
}
