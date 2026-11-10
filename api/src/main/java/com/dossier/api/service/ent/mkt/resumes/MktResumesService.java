package com.dossier.api.service.ent.mkt.resumes;

import com.dossier.api.domain.ent.mkt.MktResumeEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.repository.ent.mkt.MktResumeEventRepository;
import com.dossier.api.repository.ent.mkt.MktResumeRepository;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto.Activity;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto.Detail;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto.Experience;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto.Kpi;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto.Page;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto.Query;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto.Row;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto.Skill;
import com.dossier.api.service.ent.resumes.OrgResumeApproval;
import com.dossier.api.service.ent.resumes.OrgResumeLinkService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing workspace Resumes board (permission {@code resumes.view_for}, scope ASSIGNED for a Marketing Specialist).
 *
 * <p>Resumes are metadata only: there are no file bytes, so Download is honestly "No file stored" (404). View is a read-only preview
 * drawn from {@code headline}, {@code summary_text}, the consultant's skills and {@code org_resume_experience}. A marketer may edit
 * the metadata ({@code resumes.edit_for}): that is a new version of the row (the schema keeps one row per resume with its current
 * {@code version_no}); an APPROVED resume that is edited goes back to PENDING because nothing a marketer wrote counts until it is approved
 * again. A marketer REQUESTS approval ({@code PENDING}); only a holder of {@code resumes.approve_request} (the org admin) approves, and
 * never the person who made the request or the edit (E1: a marketer prepares and requests; nobody approves their own work).
 *
 * <p>Every number comes from rows. "Needs update" is derived from the change log ({@code mkt_resume_event}): the latest of
 * CREATED / UPDATED / MARKED_FOR_UPDATE is MARKED_FOR_UPDATE. The list is filtered, sorted and paged in memory over the caller's scope
 * (an organization holds a few hundred resumes; the scoped read is one indexed query).
 */
@Service
public class MktResumesService {

    public static final String VIEW_KEY = "resumes.view_for";
    public static final String EDIT_KEY = "resumes.edit_for";
    public static final String APPROVE_KEY = "resumes.approve_request";

    public static final int TITLE_MAX = 200;
    public static final int HEADLINE_MAX = 120;
    public static final int SUMMARY_MAX = 1000;
    public static final int TARGET_ROLE_MAX = 120;
    public static final Set<String> EDITABLE = Set.of("title", "headline", "summary", "targetRole");
    static final int ACTIVITY_LIMIT = 5;
    static final int SPARK_WEEKS = 8;
    static final Set<String> STATUSES = Set.of(MktResumesDto.APPROVED, MktResumesDto.PENDING, MktResumesDto.NEEDS_UPDATE);
    static final Set<String> AVAILABILITY = Set.of("AVAILABLE", "ON_PROJECT", "NOTICE", "UNAVAILABLE");

    private final MktScope scope;
    private final MktResumeRepository resumes;
    private final MktResumeEventRepository events;
    private final OrgAuditService audit;
    private final AuthorizationService authorization;
    private final Clock clock;

    /** Fingerprint lookup for the approval pin (X7.4); absent in hand-wired unit tests. */
    @Autowired(required = false)
    private OrgResumeApproval approvals;

    @Autowired
    public MktResumesService(MktScope scope, MktResumeRepository resumes, MktResumeEventRepository events, OrgAuditService audit, AuthorizationService authorization) {
        this(scope, resumes, events, audit, authorization, Clock.systemUTC());
    }

    MktResumesService(MktScope scope, MktResumeRepository resumes, MktResumeEventRepository events, OrgAuditService audit, AuthorizationService authorization, Clock clock) {
        this.scope = scope;
        this.resumes = resumes;
        this.events = events;
        this.audit = audit;
        this.authorization = authorization;
        this.clock = clock;
    }

    // ---- the board -------------------------------------------------------------------------------------------------------------

    /** One resume with everything a row needs. */
    private record Item(OrgResume resume, ConsultantProfile consultant, List<ConsultantSkill> skills, List<MktResumeEvent> events, String approval) {}

    @Transactional(readOnly = true)
    public Page list(OrgMembership me, Query q) {
        MktScope.View view = scope.resolve(me, VIEW_KEY);
        Instant now = clock.instant();
        List<Item> all = load(view);
        MktScope.View edit = editViewOrNull(me);

        List<Kpi> kpis = kpis(all, now);
        Predicate<Item> filter = filter(q, now);
        List<Item> matched = all.stream().filter(filter).sorted(comparator(q.sort())).toList();
        int size = Math.max(1, Math.min(q.size() <= 0 ? 10 : q.size(), 100));
        int page = Math.max(0, q.page());
        int from = (int) Math.min((long) page * size, matched.size());
        List<Row> rows = matched.subList(from, Math.min(from + size, matched.size())).stream().map(i -> row(i, edit)).toList();

        Set<String> skills = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Item i : all) for (ConsultantSkill s : i.skills()) skills.add(s.getSkill());
        return new Page(kpis, rows, matched.size(), page, size, List.copyOf(skills), activity(all, ACTIVITY_LIMIT), me.canKey(APPROVE_KEY));
    }

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, Long id) {
        MktScope.View view = scope.resolve(me, VIEW_KEY);
        return detailOf(me, view, one(view, id));
    }

    /** Download: no file bytes are stored for an org resume, so the answer is a 404 that says so (the consultant check still comes first). */
    @Transactional(readOnly = true)
    public void download(OrgMembership me, Long id) {
        MktScope.View view = scope.resolve(me, VIEW_KEY);
        one(view, id);
        throw OrgException.coded(404, "NO_FILE_STORED", "No file is stored for this resume.", Map.of());
    }

    // ---- writes (the marketer prepares and requests; nothing here submits for a consultant) ------------------------------------

    /** Metadata edit: any of title, headline, summary, targetRole (a JSON null clears all but title). Changes nothing, writes nothing. */
    @Transactional
    public Detail edit(OrgMembership me, Long id, Map<String, Object> body) {
        MktScope.View view = writeView(me, EDIT_KEY);
        Item item = one(view, id);
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "name at least one field to change");
        for (String k : body.keySet()) if (!EDITABLE.contains(k)) throw OrgException.invalid(k, "cannot be changed here");
        OrgResume r = item.resume();
        // A resume with a Resume Builder document is edited in the builder (the directory row only mirrors it): a metadata edit here would be overwritten by the next save.
        if (r.getResumeId() != null) throw OrgException.coded(409, "EDIT_IN_BUILDER", "This resume is edited in the resume builder.", Map.of());
        List<String> changed = new ArrayList<>();
        String title = body.containsKey("title") ? text(body, "title", TITLE_MAX, false) : r.getName();
        String headline = body.containsKey("headline") ? text(body, "headline", HEADLINE_MAX, true) : r.getHeadline();
        String summary = body.containsKey("summary") ? text(body, "summary", SUMMARY_MAX, true) : r.getSummaryText();
        String target = body.containsKey("targetRole") ? text(body, "targetRole", TARGET_ROLE_MAX, true) : r.getTargetRole();
        if (!java.util.Objects.equals(title, r.getName())) changed.add("title");
        if (!java.util.Objects.equals(headline, r.getHeadline())) changed.add("headline");
        if (!java.util.Objects.equals(summary, r.getSummaryText())) changed.add("summary");
        if (!java.util.Objects.equals(target, r.getTargetRole())) changed.add("targetRole");
        if (changed.isEmpty()) return detailOf(me, view, item);

        Instant now = clock.instant();
        r.setName(title);
        r.setHeadline(headline);
        r.setSummaryText(summary);
        r.setTargetRole(target);
        r.setVersionNo(r.getVersionNo() + 1);
        r.setUpdatedAt(now);
        if (!"PENDING".equals(r.getApprovalStatus())) {
            r.setApprovalStatus("PENDING"); // the new version needs approving again; the marketer never approves it
            r.setApprovedAt(null);
            r.setApprovedByMemberId(null);
        }
        resumes.saveAndFlush(r);
        MktResumeEvent e = event(me, r, MktResumeEvent.UPDATED, "Changed " + String.join(", ", changed), now);
        audit.record(me, "MARKETER_RESUME_EDIT", OrgAuditService.TARGET_RESUME, null, String.valueOf(r.getId()), "fields=" + String.join(",", changed) + " version=" + r.getVersionNo());
        return detailOf(me, view, reload(view, item, e));
    }

    /** Ask the org admin to approve the current version. Already pending: nothing changes. */
    @Transactional
    public Detail requestApproval(OrgMembership me, Long id) {
        MktScope.View view = writeView(me, EDIT_KEY);
        Item item = one(view, id);
        OrgResume r = item.resume();
        if ("PENDING".equals(r.getApprovalStatus())) return detailOf(me, view, item);
        Instant now = clock.instant();
        r.setApprovalStatus("PENDING");
        r.setApprovedAt(null);
        r.setApprovedByMemberId(null);
        resumes.saveAndFlush(r);
        MktResumeEvent e = event(me, r, MktResumeEvent.APPROVAL_REQUESTED, null, now);
        audit.record(me, "MARKETER_APPROVAL_REQUEST", OrgAuditService.TARGET_RESUME, null, String.valueOf(r.getId()), "version=" + r.getVersionNo());
        return detailOf(me, view, reload(view, item, e));
    }

    /** Flag a resume as needing an update. Already flagged: nothing changes. Cleared by the next edit. */
    @Transactional
    public Detail markNeedsUpdate(OrgMembership me, Long id, String note) {
        MktScope.View view = writeView(me, EDIT_KEY);
        Item item = one(view, id);
        if (MktResumesDto.NEEDS_UPDATE.equals(item.approval())) return detailOf(me, view, item);
        String detail = null;
        if (note != null && !note.isBlank()) {
            detail = clean("note", note, 200);
        }
        MktResumeEvent e = event(me, item.resume(), MktResumeEvent.MARKED_FOR_UPDATE, detail, clock.instant());
        audit.record(me, "MARKETER_RESUME_FLAG", OrgAuditService.TARGET_RESUME, null, String.valueOf(item.resume().getId()), "needs update");
        return detailOf(me, view, reload(view, item, e));
    }

    /** The org admin approves a pending resume. Never the person who requested it or edited it. */
    @Transactional
    public Detail approve(OrgMembership me, Long id) {
        MktScope.View view = writeView(me, APPROVE_KEY);
        Item item = one(view, id);
        OrgResume r = item.resume();
        if (!"PENDING".equals(r.getApprovalStatus())) throw OrgException.coded(409, "NOT_PENDING", "This resume is not waiting for approval.", Map.of());
        if (OrgResumeLinkService.requiresConsultantApproval(r)) throw OrgException.coded(409, "CONSULTANT_APPROVAL_REQUIRED", "Only the consultant can approve a resume made for them.", Map.of());
        for (int i = item.events().size() - 1; i >= 0; i--) {
            MktResumeEvent e = item.events().get(i);
            if (MktResumeEvent.APPROVAL_REQUESTED.equals(e.getKind()) || MktResumeEvent.UPDATED.equals(e.getKind())) {
                if (me.memberId() != null && me.memberId().equals(e.getActorMemberId())) throw OrgException.coded(409, "SELF_APPROVAL", "You can't approve a resume you requested or edited yourself.", Map.of());
                break;
            }
        }
        Instant now = clock.instant();
        r.setApprovalStatus("APPROVED");
        r.setApprovedAt(now);
        r.setApprovedByMemberId(me.memberId());
        if (approvals != null) approvals.pin(r); else OrgResumeApproval.pin(r, null); // X7.4
        resumes.saveAndFlush(r);
        MktResumeEvent e = event(me, r, MktResumeEvent.APPROVED, null, now);
        audit.record(me, "RESUME_APPROVE", OrgAuditService.TARGET_RESUME, null, String.valueOf(r.getId()), "version=" + r.getVersionNo());
        return detailOf(me, view, reload(view, item, e));
    }

    // ---- loading ---------------------------------------------------------------------------------------------------------------

    private List<Item> load(MktScope.View view) {
        Long orgId = view.orgId();
        List<OrgResume> rows;
        if (view.all()) rows = resumes.all(orgId);
        else if (view.consultantIds().isEmpty()) return List.of();
        else rows = resumes.forConsultants(orgId, view.consultantIds());
        if (rows.isEmpty()) return List.of();
        Set<Long> consultantIds = new LinkedHashSet<>();
        for (OrgResume r : rows) consultantIds.add(r.getConsultantId());
        Map<Long, ConsultantProfile> consultants = new HashMap<>();
        for (ConsultantProfile c : view.all() ? resumes.allConsultants(orgId) : resumes.consultants(orgId, consultantIds)) consultants.put(c.getId(), c);
        Map<Long, List<ConsultantSkill>> skills = new HashMap<>();
        for (ConsultantSkill s : view.all() ? resumes.allSkills(orgId) : resumes.skills(orgId, consultantIds)) skills.computeIfAbsent(s.getConsultantId(), k -> new ArrayList<>()).add(s);
        Map<Long, List<MktResumeEvent>> byResume = new HashMap<>();
        List<Long> resumeIds = rows.stream().map(OrgResume::getId).toList();
        for (MktResumeEvent e : events.forResumes(orgId, resumeIds)) byResume.computeIfAbsent(e.getResumeId(), k -> new ArrayList<>()).add(e);
        List<Item> out = new ArrayList<>();
        for (OrgResume r : rows) {
            ConsultantProfile c = consultants.get(r.getConsultantId());
            if (c == null || !view.sees(r.getConsultantId())) continue; // a resume whose consultant is not visible never shows
            List<MktResumeEvent> evs = byResume.getOrDefault(r.getId(), List.of());
            out.add(new Item(r, c, skillsOf(skills.getOrDefault(c.getId(), List.of())), evs, approvalOf(r, evs)));
        }
        return out;
    }

    /** One resume the caller may see; anything else (missing, another tenant's, an unassigned consultant's) is the same 404. */
    private Item one(MktScope.View view, Long id) {
        OrgResume r = resumes.byId(view.orgId(), id).orElseThrow(OrgNotFoundException::new);
        scope.require(view, r.getConsultantId());
        ConsultantProfile c = resumes.consultants(view.orgId(), List.of(r.getConsultantId())).stream().findFirst().orElseThrow(OrgNotFoundException::new);
        List<MktResumeEvent> evs = events.forResumes(view.orgId(), List.of(r.getId()));
        return new Item(r, c, skillsOf(resumes.skills(view.orgId(), List.of(c.getId()))), evs, approvalOf(r, evs));
    }

    private Item reload(MktScope.View view, Item before, MktResumeEvent added) {
        List<MktResumeEvent> evs = new ArrayList<>(before.events());
        evs.add(added);
        return new Item(before.resume(), before.consultant(), before.skills(), evs, approvalOf(before.resume(), evs));
    }

    private static List<ConsultantSkill> skillsOf(List<ConsultantSkill> list) {
        List<ConsultantSkill> sorted = new ArrayList<>(list);
        sorted.sort(Comparator.comparing((ConsultantSkill s) -> !s.isPrimarySkill()).thenComparing(s -> s.getSortOrder() == null ? 0 : s.getSortOrder()));
        return sorted;
    }

    /** The write gate: the page's scope (404 for everyone outside it) and then the write-side authorization order. */
    private MktScope.View writeView(OrgMembership me, String key) {
        MktScope.View view = scope.resolve(me, key);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(key), Beneficiary.NONE, null, AuthzOperation.WRITE).withActor(me));
        return view;
    }

    private MktScope.View editViewOrNull(OrgMembership me) {
        if (!me.canKey(EDIT_KEY)) return null;
        try {
            return scope.resolve(me, EDIT_KEY);
        } catch (OrgNotFoundException e) {
            return null;
        }
    }

    // ---- derived state ---------------------------------------------------------------------------------------------------------

    /** PENDING while the row waits for the admin; else NEEDS_UPDATE when the latest CREATED/UPDATED/MARKED_FOR_UPDATE is the flag; else APPROVED. */
    static String approvalOf(OrgResume r, List<MktResumeEvent> evs) {
        if ("PENDING".equals(r.getApprovalStatus())) return MktResumesDto.PENDING;
        boolean flagged = false;
        for (MktResumeEvent e : evs) {
            if (MktResumeEvent.MARKED_FOR_UPDATE.equals(e.getKind())) flagged = true;
            else if (MktResumeEvent.UPDATED.equals(e.getKind()) || MktResumeEvent.CREATED.equals(e.getKind())) flagged = false;
        }
        return flagged ? MktResumesDto.NEEDS_UPDATE : MktResumesDto.APPROVED;
    }

    private Row row(Item i, MktScope.View edit) {
        OrgResume r = i.resume();
        ConsultantProfile c = i.consultant();
        boolean canEdit = edit != null && edit.sees(c.getId());
        return new Row(
            r.getId(), c.getId(), c.getDisplayName(), c.getJobTitle(), null, r.getName(), r.getTargetRole(), r.getVersionNo() == null ? 1 : r.getVersionNo(),
            r.getUpdatedAt(), r.isPrimaryForOrg(), c.getProfileCompleteness() == null ? 0 : c.getProfileCompleteness(), i.approval(),
            false, // no file bytes are stored for an org resume
            canEdit
        );
    }

    private Detail detailOf(OrgMembership me, MktScope.View view, Item i) {
        Long orgId = view.orgId();
        List<Experience> exp = new ArrayList<>();
        for (OrgResumeExperience x : resumes.experience(orgId, i.resume().getId())) exp.add(new Experience(x.getTitle(), x.getEmployer(), x.getStartYear(), x.getEndYear()));
        List<Skill> skills = i.skills().stream().map(s -> new Skill(s.getSkill(), s.isPrimarySkill())).toList();
        List<Activity> history = activity(List.of(i), 10);
        return new Detail(row(i, editViewOrNull(me)), i.resume().getHeadline(), i.resume().getSummaryText(), i.resume().getFileName(), i.resume().getFileSizeKb(), skills, exp, history);
    }

    // ---- KPIs, filters, sort, activity ----------------------------------------------------------------------------------------

    private List<Kpi> kpis(List<Item> all, Instant now) {
        Instant cut = now.minus(Duration.ofDays(30));
        return List.of(
            kpi("total", all, i -> true, cut, now),
            kpi("profilesReady", all, i -> MktResumesDto.APPROVED.equals(i.approval()), cut, now),
            kpi("needUpdates", all, i -> MktResumesDto.NEEDS_UPDATE.equals(i.approval()), cut, now),
            kpi("approvalsPending", all, i -> MktResumesDto.PENDING.equals(i.approval()), cut, now)
        );
    }

    /**
     * Value = rows in that state now. "vs last month" compares with the same rows that already existed 30 days ago (created_at cut, as the
     * talent foundation does: state changes are not versioned), and is null when there were none. The sparkline is the number of those
     * rows that had been created by the end of each of the last eight weeks.
     */
    private Kpi kpi(String key, List<Item> all, Predicate<Item> in, Instant cut, Instant now) {
        List<Item> set = all.stream().filter(in).toList();
        long value = set.size();
        long previous = set.stream().filter(i -> i.resume().getCreatedAt().isBefore(cut)).count();
        Double delta = previous > 0 ? Math.round((value - previous) * 1000.0 / previous) / 10.0 : null;
        List<Long> spark = new ArrayList<>();
        for (int w = SPARK_WEEKS - 1; w >= 0; w--) {
            Instant end = now.minus(Duration.ofDays(7L * w));
            spark.add(set.stream().filter(i -> !i.resume().getCreatedAt().isAfter(end)).count());
        }
        return new Kpi(key, value, delta, spark);
    }

    private Predicate<Item> filter(Query q, Instant now) {
        String needle = q.q() == null ? "" : q.q().trim().toLowerCase(Locale.ROOT);
        String skill = q.skill() == null ? "" : q.skill().trim().toLowerCase(Locale.ROOT);
        String status = norm(q.status());
        String availability = norm(q.availability());
        if (!status.isEmpty() && !STATUSES.contains(status)) throw OrgException.invalid("status", "must be one of APPROVED, PENDING, NEEDS_UPDATE");
        if (!availability.isEmpty() && !AVAILABILITY.contains(availability)) throw OrgException.invalid("availability", "unknown availability");
        Instant since = switch (q.updated() == null ? "all" : q.updated().trim().toLowerCase(Locale.ROOT)) {
            case "7d" -> now.minus(Duration.ofDays(7));
            case "30d" -> now.minus(Duration.ofDays(30));
            case "3m" -> now.minus(Duration.ofDays(91));
            case "6m" -> now.minus(Duration.ofDays(183));
            case "", "all" -> null;
            default -> throw OrgException.invalid("updated", "must be 7d, 30d, 3m, 6m or all");
        };
        return i -> {
            if (!needle.isEmpty()) {
                String hay = (nz(i.consultant().getDisplayName()) + " " + nz(i.resume().getName()) + " " + nz(i.resume().getTargetRole())).toLowerCase(Locale.ROOT);
                if (!hay.contains(needle)) return false;
            }
            if (!skill.isEmpty() && i.skills().stream().noneMatch(s -> s.getSkill() != null && s.getSkill().toLowerCase(Locale.ROOT).equals(skill))) return false;
            if (!status.isEmpty() && !status.equals(i.approval())) return false;
            if (!availability.isEmpty() && !availability.equals(nz(i.consultant().getAvailabilityStatus()))) return false;
            return since == null || !i.resume().getUpdatedAt().isBefore(since);
        };
    }

    private Comparator<Item> comparator(String sort) {
        String s = sort == null || sort.isBlank() ? "modified,desc" : sort.trim();
        String[] p = s.split(",", 2);
        boolean desc = p.length < 2 ? p[0].equals("modified") || p[0].equals("version") || p[0].equals("completeness") : !p[1].trim().equalsIgnoreCase("asc");
        Comparator<Item> c = switch (p[0].trim()) {
            case "modified" -> Comparator.comparing((Item i) -> i.resume().getUpdatedAt());
            case "consultant" -> Comparator.comparing((Item i) -> nz(i.consultant().getDisplayName()).toLowerCase(Locale.ROOT));
            case "title" -> Comparator.comparing((Item i) -> nz(i.resume().getName()).toLowerCase(Locale.ROOT));
            case "version" -> Comparator.comparing((Item i) -> i.resume().getVersionNo());
            case "completeness" -> Comparator.comparing((Item i) -> i.consultant().getProfileCompleteness() == null ? 0 : i.consultant().getProfileCompleteness());
            case "approval" -> Comparator.comparing(Item::approval);
            default -> throw OrgException.invalid("sort", "must be modified, consultant, title, version, completeness or approval");
        };
        if (desc) c = c.reversed();
        return c.thenComparing(i -> i.resume().getId());
    }

    private List<Activity> activity(List<Item> items, int limit) {
        Map<Long, Item> byResume = new LinkedHashMap<>();
        List<MktResumeEvent> all = new ArrayList<>();
        for (Item i : items) {
            byResume.put(i.resume().getId(), i);
            all.addAll(i.events());
        }
        all.sort(Comparator.comparing(MktResumeEvent::getOccurredAt).thenComparing(MktResumeEvent::getId, Comparator.nullsLast(Comparator.naturalOrder())).reversed());
        List<Activity> out = new ArrayList<>();
        for (MktResumeEvent e : all) {
            if (out.size() >= limit) break;
            Item i = byResume.get(e.getResumeId());
            if (i == null) continue;
            out.add(new Activity(e.getId(), e.getResumeId(), e.getConsultantId(), i.consultant().getDisplayName(), null, e.getKind(), activityText(e), e.getOccurredAt()));
        }
        return out;
    }

    static String activityText(MktResumeEvent e) {
        String v = e.getVersionNo() == null ? "" : " v" + e.getVersionNo();
        return switch (e.getKind()) {
            case MktResumeEvent.CREATED -> "added a new resume (" + v.trim() + ")";
            case MktResumeEvent.UPDATED -> "updated resume to" + v;
            case MktResumeEvent.APPROVAL_REQUESTED -> "resume sent for approval";
            case MktResumeEvent.APPROVED -> "resume approved";
            case MktResumeEvent.MARKED_FOR_UPDATE -> "resume marked for update";
            case "PRIMARY_SET" -> "resume made primary";
            case "DETAILS_CHANGED" -> "resume details changed";
            case "DECIDED" -> "resume decision recorded";
            default -> "resume changed";
        };
    }

    // ---- small helpers ---------------------------------------------------------------------------------------------------------

    private MktResumeEvent event(OrgMembership me, OrgResume r, String kind, String detail, Instant at) {
        MktResumeEvent e = new MktResumeEvent();
        e.setOrgId(r.getOrgId());
        e.setResumeId(r.getId());
        e.setConsultantId(r.getConsultantId());
        e.setActorMemberId(me.memberId());
        e.setKind(kind);
        e.setVersionNo(r.getVersionNo());
        e.setDetail(detail);
        e.setOccurredAt(at);
        return events.saveAndFlush(e);
    }

    private static String text(Map<String, Object> body, String key, int max, boolean nullable) {
        Object raw = body.get(key);
        if (raw == null) {
            if (nullable) return null;
            throw OrgException.invalid(key, "is required");
        }
        if (!(raw instanceof String s)) throw OrgException.invalid(key, "must be text");
        String t = s.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) {
            if (nullable) return null;
            throw OrgException.invalid(key, "is required");
        }
        return clean(key, t, max);
    }

    private static String clean(String key, String t, int max) {
        String v = t.strip();
        if (v.length() > max) throw OrgException.invalid(key, "at most " + max + " characters");
        if (v.chars().anyMatch(ch -> Character.isISOControl(ch) && ch != '\n') || v.indexOf('<') >= 0 || v.indexOf('>') >= 0) throw OrgException.invalid(key, "contains characters that are not allowed");
        SensitiveContent.check(key, key, v);
        return v;
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT).replace(' ', '_');
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

}
