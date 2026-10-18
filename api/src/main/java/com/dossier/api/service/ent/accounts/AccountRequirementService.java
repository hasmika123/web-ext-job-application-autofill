package com.dossier.api.service.ent.accounts;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.dto.ent.JobDTO;
import com.dossier.api.service.dto.ent.RequirementDTO;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.OrgStateRules;
import com.dossier.api.service.ent.clients.ClientsSettings;
import com.dossier.api.service.ent.jobs.JobAccess;
import com.dossier.api.service.ent.jobs.JobBoardService;
import com.dossier.api.service.ent.jobs.JobWriteService;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.jobs.UrlKeys;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Account Manager's Requirements page (X10.2): list with filters, the Home figures, one requirement, intake (manual, a pasted client text, or a
 * posting link), edit, and putting a requirement in front of a consultant. A requirement is the same {@code client_requirement} row the Jobs page
 * works on; creating and editing the core fields delegate to {@link JobWriteService} (one set of validation and sensitive-data rules), and this class adds
 * what intake needs on top: priority, due date, source, the duplicate check and the status workflow.
 *
 * <p>Gates: view needs {@code clients.view} or {@code pipeline.view} (as the Jobs board); create, edit and assign need {@code requirements.manage}; a closed
 * organization cannot be written. Everything that fails is the generic 404, never 403. Assigning only RECORDS that a requirement was put in front of a consultant
 * ({@link OpportunityAssignmentService}, the one place that does it): the consultant decides and applies, and nobody submits for them (E1).
 * Closing or filling a requirement closes the opportunities that were still open on it.
 */
@Service
public class AccountRequirementService {

    public static final String KEY_MANAGE = JobAccess.KEY_MANAGE;
    public static final String AUDIT_INTAKE = "REQUIREMENT_INTAKE";
    public static final String AUDIT_ASSIGN = "REQUIREMENT_ASSIGN";
    public static final String AUDIT_CLOSE = "REQUIREMENT_CLOSE";
    public static final String TARGET = "JOB";
    public static final String CODE_REQUIREMENT_EXISTS = "REQUIREMENT_EXISTS";
    public static final String CODE_PRECONDITION_REQUIRED = "PRECONDITION_REQUIRED";
    public static final String CODE_PRECONDITION_FAILED = "PRECONDITION_FAILED";

    public static final List<String> PRIORITIES = List.of("LOW", "NORMAL", "HIGH", "URGENT");
    public static final List<String> SOURCES = List.of("MANUAL", "PASTED_TEXT", "LINK");
    /** The statuses a requirement can be moved to by hand (IN_REVIEW is the Jobs board's extra step and stays readable). */
    public static final List<String> STATUSES = List.of("OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED");
    static final Set<String> OPEN_LIKE = Set.of("OPEN", "IN_REVIEW");
    static final Set<String> LIVE = Set.of("OPEN", "IN_REVIEW", "ON_HOLD");
    static final Set<String> CLOSING = Set.of("FILLED", "CLOSED");
    static final Set<String> PATCH_OWN = Set.of("priority", "dueOn");
    static final List<String> SORTS = List.of("posted", "due", "priority", "title", "client", "status", "age");
    static final int MAX_PAGE = 100;
    static final int DEFAULT_PAGE = 10;
    static final int MAX_DETAIL_ASSIGNEES = 50;

    /** The filters of the list. Repeatable ones arrive as lists; {@code assigned} is ANY or NONE; {@code aging} limits to open requirements past the aging days. */
    public record ListQuery(
        String q, List<String> status, List<String> priority, List<String> workMode, Long clientId, String assigned, boolean aging, String sort, String dir, Integer page, Integer size
    ) {}

    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final ClientContactRepository contacts;
    private final RequirementSkillRepository skillRepo;
    private final RequirementMatchRepository matchRepo;
    private final ConsultantProfileRepository consultantRepo;
    private final TalentApplicationRepository applications;
    private final JobAccess jobAccess;
    private final JobWriteService jobWrite;
    private final OpportunityAssignmentService assignment;
    private final ClientsSettings settings;
    private final OrgAuditService audit;

    @PersistenceContext
    private EntityManager em;

    public AccountRequirementService(
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        ClientContactRepository contacts,
        RequirementSkillRepository skillRepo,
        RequirementMatchRepository matchRepo,
        ConsultantProfileRepository consultantRepo,
        TalentApplicationRepository applications,
        JobAccess jobAccess,
        JobWriteService jobWrite,
        OpportunityAssignmentService assignment,
        ClientsSettings settings,
        OrgAuditService audit
    ) {
        this.requirements = requirements;
        this.clients = clients;
        this.contacts = contacts;
        this.skillRepo = skillRepo;
        this.matchRepo = matchRepo;
        this.consultantRepo = consultantRepo;
        this.applications = applications;
        this.jobAccess = jobAccess;
        this.jobWrite = jobWrite;
        this.assignment = assignment;
        this.settings = settings;
        this.audit = audit;
    }

    // ---- access -------------------------------------------------------------------------------------------------------------------

    private RequirementDTO.Access access(OrgMembership me) {
        boolean writable = OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(KEY_MANAGE));
        boolean can = me.canKey(KEY_MANAGE) && writable;
        return new RequirementDTO.Access(can, can, can);
    }

    // ---- read ---------------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public RequirementDTO.Page list(OrgMembership me, ListQuery q) {
        jobAccess.requireView(me);
        Long orgId = me.orgId();
        List<String> statuses = checked("status", q.status(), STATUSES);
        List<String> priorities = checked("priority", q.priority(), PRIORITIES);
        List<String> modes = checked("workMode", q.workMode(), JobBoardService.WORK_MODES);
        String assigned = q.assigned() == null || q.assigned().isBlank() ? null : q.assigned().trim().toUpperCase(Locale.ROOT);
        if (assigned != null && !Set.of("ANY", "NONE").contains(assigned)) throw OrgException.invalid("assigned", "ANY or NONE");
        String sort = q.sort() == null || q.sort().isBlank() ? "posted" : q.sort().trim();
        if (!SORTS.contains(sort)) throw OrgException.coded(400, "SORT_INVALID", "Sort by one of " + SORTS, Map.of("allowed", SORTS));
        boolean asc = q.dir() == null || q.dir().isBlank() ? sortDefaultAsc(sort) : "asc".equalsIgnoreCase(q.dir().trim());
        String needle = null;
        if (q.q() != null && !q.q().isBlank()) {
            needle = q.q().strip().toLowerCase(Locale.ROOT);
            if (needle.length() < 2 || needle.length() > 80) throw OrgException.invalid("q", "2 to 80 characters");
        }
        int page = q.page() == null ? 0 : q.page();
        int size = q.size() == null ? DEFAULT_PAGE : q.size();
        if (page < 0) throw OrgException.invalid("page", "from 0");
        if (size < 1 || size > MAX_PAGE) throw OrgException.invalid("size", "1 to " + MAX_PAGE);

        Context ctx = context(orgId);
        int agingDays = settings.requirementAgingDays(orgId);
        Instant agingBefore = Instant.now().minus(agingDays, ChronoUnit.DAYS);
        List<ClientRequirement> all = requirements.findByOrgId(orgId);
        List<ClientRequirement> kept = new ArrayList<>();
        for (ClientRequirement r : all) {
            if (!statuses.isEmpty() && !statuses.contains(r.getStatus())) continue;
            if (!priorities.isEmpty() && !priorities.contains(r.getPriority())) continue;
            if (!modes.isEmpty() && !modes.contains(r.getWorkMode())) continue;
            if (q.clientId() != null && !q.clientId().equals(r.getClientId())) continue;
            if ("NONE".equals(assigned) && ctx.assignedCount(r.getId()) > 0) continue;
            if ("ANY".equals(assigned) && ctx.assignedCount(r.getId()) == 0) continue;
            if (q.aging() && !(OPEN_LIKE.contains(r.getStatus()) && r.getPostedAt() != null && !r.getPostedAt().isAfter(agingBefore))) continue;
            if (needle != null && !matches(r, ctx, needle)) continue;
            kept.add(r);
        }
        Comparator<ClientRequirement> cmp = comparator(sort, ctx);
        kept.sort(asc ? cmp : cmp.reversed());
        long total = kept.size();
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min(from + (long) size, total);
        List<RequirementDTO.Row> items = new ArrayList<>();
        for (ClientRequirement r : kept.subList(from, to)) items.add(row(r, ctx));
        return new RequirementDTO.Page(items, page, size, total, to < total);
    }

    @Transactional(readOnly = true)
    public RequirementDTO.Summary summary(OrgMembership me) {
        jobAccess.requireView(me);
        Long orgId = me.orgId();
        Context ctx = context(orgId);
        int agingDays = settings.requirementAgingDays(orgId);
        Instant agingBefore = Instant.now().minus(agingDays, ChronoUnit.DAYS);
        long open = 0, unassigned = 0, aging = 0, hold = 0;
        for (ClientRequirement r : requirements.findByOrgId(orgId)) {
            if (OPEN_LIKE.contains(r.getStatus())) {
                open++;
                if (ctx.assignedCount(r.getId()) == 0) unassigned++;
                if (r.getPostedAt() != null && !r.getPostedAt().isAfter(agingBefore)) aging++;
            } else if ("ON_HOLD".equals(r.getStatus())) {
                hold++;
            }
        }
        long contactCount = contacts.findByOrgId(orgId).stream().filter(c -> "ACTIVE".equals(c.getStatus())).count();
        List<RequirementDTO.ClientOption> options = new ArrayList<>();
        Map<Long, List<ClientContact>> byClient = contacts.findByOrgId(orgId).stream().filter(c -> "ACTIVE".equals(c.getStatus())).collect(Collectors.groupingBy(ClientContact::getClientId));
        for (ClientAccount c : clients.findByOrgIdOrderByNameAsc(orgId)) {
            if (c.getArchivedAt() != null || "INACTIVE".equals(c.getStatus())) continue;
            List<RequirementDTO.ContactOption> cs = byClient.getOrDefault(c.getId(), List.of()).stream().sorted(Comparator.comparing(ClientContact::getName, String.CASE_INSENSITIVE_ORDER)).map(x -> new RequirementDTO.ContactOption(x.getId(), x.getName())).toList();
            options.add(new RequirementDTO.ClientOption(c.getId(), c.getName(), cs));
        }
        return new RequirementDTO.Summary(open, unassigned, aging, hold, contactCount, agingDays, Instant.now(), options, access(me));
    }

    @Transactional(readOnly = true)
    public RequirementDTO.Detail detail(OrgMembership me, Long id) {
        jobAccess.requireView(me);
        ClientRequirement r = requirements.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        return detailOf(me, r);
    }

    // ---- intake -------------------------------------------------------------------------------------------------------------------

    @Transactional
    public RequirementDTO.Detail create(OrgMembership me, RequirementDTO.CreateRequest req) {
        jobAccess.requireWrite(me, KEY_MANAGE);
        Long orgId = me.orgId();
        if (req == null) throw OrgException.invalid("body", "send a requirement");
        String source = req.source() == null || req.source().isBlank() ? "MANUAL" : req.source().trim().toUpperCase(Locale.ROOT);
        if (!SOURCES.contains(source)) throw OrgException.invalid("source", "one of " + SOURCES);
        String priority = oneOf("priority", req.priority(), PRIORITIES, "NORMAL");
        LocalDate due = dueDate(req.dueOn());
        if (req.clientId() == null) throw OrgException.invalid("clientId", "choose a client");
        ClientAccount client = clients.findByOrgIdAndId(orgId, req.clientId()).orElseThrow(OrgNotFoundException::new);
        if ("PASTED_TEXT".equals(source) && (req.description() == null || req.description().isBlank())) throw OrgException.invalid("description", "paste the client's text");
        UrlKeys.Key urlKey = null;
        String url = null;
        if ("LINK".equals(source)) {
            url = req.sourceUrl() == null ? null : req.sourceUrl().strip();
            UrlKeys.requireAllowed(url);
            SensitiveContent.check("sourceUrl", "sourceUrl", url);
            urlKey = UrlKeys.of(url, null);
            if (urlKey != null) {
                var hit = requirements.findByOrgIdAndUrlKeyHash(orgId, urlKey.hash());
                if (hit.isPresent()) throw exists(hit.get());
            }
        } else if (req.sourceUrl() != null && !req.sourceUrl().isBlank()) {
            throw OrgException.invalid("sourceUrl", "only for a requirement taken from a link");
        }
        String title = req.title() == null ? "" : req.title().strip();
        for (ClientRequirement other : requirements.findByOrgId(orgId)) {
            if (!other.getClientId().equals(client.getId()) || !LIVE.contains(other.getStatus())) continue;
            if (norm(other.getTitle()).equals(norm(title)) && norm(other.getLocation()).equals(norm(req.location()))) throw exists(other);
        }
        JobDTO.CreateRequest base = new JobDTO.CreateRequest(
            req.title(), req.clientId(), req.contactId(), req.description(), req.location(), req.workMode(), req.employment(), req.durationLabel(), req.experienceLevel(),
            req.rateMin(), req.rateMax(), req.rateUnit(), req.positions(), req.status(), req.skills()
        );
        Long newId = jobWrite.create(me, base).id();
        ClientRequirement r = requirements.findByOrgIdAndId(orgId, newId).orElseThrow(OrgNotFoundException::new);
        r.setPriority(priority);
        r.setDueOn(due);
        r.setSource(source);
        if (url != null) {
            r.setJobUrl(url);
            if (urlKey != null) {
                r.setUrlKey(urlKey.key());
                r.setUrlKeyHash(urlKey.hash());
            }
        }
        r.setCaptureMethod("MANUAL_ENTRY");
        r.setCapturedByMemberId(me.memberId());
        requirements.saveAndFlush(r);
        audit.record(me, AUDIT_INTAKE, TARGET, null, String.valueOf(r.getId()), "source: " + source + ", priority: " + priority);
        em.flush();
        em.clear();
        return detailOf(me, requirements.findByOrgIdAndId(orgId, newId).orElseThrow());
    }

    @Transactional
    public RequirementDTO.Detail patch(OrgMembership me, Long id, String ifMatch, Map<String, Object> body) {
        jobAccess.requireWrite(me, KEY_MANAGE);
        Long orgId = me.orgId();
        ClientRequirement r = requirements.findByOrgIdAndId(orgId, id).orElseThrow(OrgNotFoundException::new);
        checkVersion(ifMatch, JobBoardService.versionOf(r));
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "name at least one field to change");
        Map<String, Object> core = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : body.entrySet()) {
            if (PATCH_OWN.contains(e.getKey())) continue;
            if (!JobWriteService.EDITABLE.contains(e.getKey())) throw OrgException.invalid(e.getKey(), "cannot be changed here");
            core.put(e.getKey(), e.getValue());
        }
        String fromStatus = r.getStatus();
        String newPriority = null;
        boolean priorityGiven = body.containsKey("priority");
        if (priorityGiven) {
            Object raw = body.get("priority");
            if (raw == null) throw OrgException.invalid("priority", "choose a priority");
            newPriority = oneOf("priority", raw, PRIORITIES, null);
            if (newPriority == null) throw OrgException.invalid("priority", "choose a priority");
        }
        boolean dueGiven = body.containsKey("dueOn");
        LocalDate newDue = null;
        if (dueGiven) {
            Object raw = body.get("dueOn");
            if (raw != null) {
                if (!(raw instanceof String s)) throw OrgException.invalid("dueOn", "a date such as 2026-12-31");
                try {
                    newDue = LocalDate.parse(s.strip());
                } catch (java.time.format.DateTimeParseException ex) {
                    throw OrgException.invalid("dueOn", "a date such as 2026-12-31");
                }
                if (!Objects.equals(newDue, r.getDueOn())) newDue = dueDate(newDue);
            }
        }
        if (!core.isEmpty()) {
            // The Jobs write service owns the core fields (and their rules); the version just checked is passed on unchanged.
            jobWrite.patch(me, id, ifMatch, core);
            em.flush();
            em.clear();
            r = requirements.findByOrgIdAndId(orgId, id).orElseThrow(OrgNotFoundException::new);
        }
        List<String> changed = new ArrayList<>();
        if (priorityGiven && !newPriority.equals(r.getPriority())) {
            r.setPriority(newPriority);
            changed.add("priority " + newPriority.toLowerCase(Locale.ROOT));
        }
        if (dueGiven && !Objects.equals(newDue, r.getDueOn())) {
            r.setDueOn(newDue);
            changed.add(newDue == null ? "due date cleared" : "due " + newDue);
        }
        if (!changed.isEmpty()) {
            r.setUpdatedAt(Instant.now());
            requirements.saveAndFlush(r);
            audit.record(me, JobWriteService.JOB_UPDATE, TARGET, null, String.valueOf(r.getId()), String.join(", ", changed));
        }
        boolean closing = CLOSING.contains(r.getStatus()) && !CLOSING.contains(fromStatus);
        if (closing) {
            int closed = assignment.closeForJob(new AccountsScope(orgId), me, r.getId());
            audit.record(me, AUDIT_CLOSE, TARGET, null, String.valueOf(r.getId()), closed + " open " + (closed == 1 ? "assignment" : "assignments") + " closed");
        }
        em.flush();
        em.clear();
        return detailOf(me, requirements.findByOrgIdAndId(orgId, id).orElseThrow());
    }

    // ---- assign -------------------------------------------------------------------------------------------------------------------

    /** The consultants this requirement can be put in front of: active ones only, name, title and availability, best skill overlap first. */
    @Transactional(readOnly = true)
    public List<RequirementDTO.Candidate> candidates(OrgMembership me, Long id, String q) {
        jobAccess.requireWrite(me, KEY_MANAGE);
        Long orgId = me.orgId();
        requirements.findByOrgIdAndId(orgId, id).orElseThrow(OrgNotFoundException::new);
        Map<Long, RequirementMatch> byConsultant = new HashMap<>();
        for (RequirementMatch m : matchRepo.findByOrgIdAndRequirementIdOrderByScoreDesc(orgId, id)) byConsultant.put(m.getConsultantId(), m);
        String needle = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        List<RequirementDTO.Candidate> out = new ArrayList<>();
        for (ConsultantProfile c : consultantRepo.findByOrgId(orgId)) {
            if (!"ACTIVE".equals(c.getStatus())) continue;
            String hay = (c.getDisplayName() + " " + (c.getJobTitle() == null ? "" : c.getJobTitle())).toLowerCase(Locale.ROOT);
            if (!needle.isEmpty() && !hay.contains(needle)) continue;
            RequirementMatch m = byConsultant.get(c.getId());
            out.add(new RequirementDTO.Candidate(c.getId(), c.getDisplayName(), c.getJobTitle(), c.getAvailabilityStatus(), m == null ? null : m.getScore(), m == null ? null : m.getStatus(), OpportunityAssignmentService.pausedReason(c)));
        }
        out.sort(Comparator.comparing(RequirementDTO.Candidate::score, Comparator.nullsLast(Comparator.<Integer>reverseOrder())).thenComparing(RequirementDTO.Candidate::name, String.CASE_INSENSITIVE_ORDER));
        return out.stream().limit(MAX_PAGE).toList();
    }

    @Transactional
    public RequirementDTO.AssignResult assign(OrgMembership me, Long id, RequirementDTO.AssignRequest req) {
        jobAccess.requireWrite(me, KEY_MANAGE);
        Long orgId = me.orgId();
        if (req == null || req.consultantId() == null) throw OrgException.invalid("consultantId", "choose a consultant");
        ClientRequirement r = requirements.findByOrgIdAndId(orgId, id).orElseThrow(OrgNotFoundException::new);
        Long consultantId = req.consultantId();
        consultantRepo.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        OpportunityAssignmentService.Result result = assignment.assign(
            new AccountsScope(orgId), me, r, consultantId,
            OpportunityAssignmentService.Options.none()
                .withNewMatch(() -> overlapScore(orgId, id, consultantId), "Put forward by an account manager", "MANUAL")
                .withAudit(new OpportunityAssignmentService.Audit(AUDIT_ASSIGN, TARGET, String.valueOf(id), x -> "{\"consultantId\":" + consultantId + ",\"created\":" + x.created() + "}"))
        );
        if (OpportunityAssignmentService.CONSULTANT_PAUSED.equals(result.reason())) {
            throw OrgException.coded(409, OpportunityAssignmentService.CONSULTANT_PAUSED, "This consultant is on a project and their marketing is paused, so nothing can be assigned.", Map.of());
        }
        if (result.refused()) throw new OrgNotFoundException();
        em.flush();
        em.clear();
        // the match was inserted in a transaction of its own, committed after this one's snapshot (REPEATABLE READ): a plain read does not list it
        RequirementMatch fresh = result.matchId() == null ? null : assignment.readMatchFresh(orgId, result.matchId()).orElse(null);
        return new RequirementDTO.AssignResult(detailOf(me, requirements.findByOrgIdAndId(orgId, id).orElseThrow(), fresh), consultantId, result.created(), result.existing());
    }

    private int overlapScore(Long orgId, Long jobId, Long consultantId) {
        Set<String> need = skillRepo.findByOrgIdAndRequirementIdIn(orgId, List.of(jobId)).stream().map(s -> s.getSkill().trim().toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        if (need.isEmpty()) return 0;
        Set<String> have = new java.util.HashSet<>();
        for (Object s : em.createQuery("select s.skill from ConsultantSkill s where s.orgId = :o and s.consultantId = :c").setParameter("o", orgId).setParameter("c", consultantId).getResultList()) {
            have.add(String.valueOf(s).trim().toLowerCase(Locale.ROOT));
        }
        long hit = need.stream().filter(have::contains).count();
        return (int) Math.round(hit * 100d / need.size());
    }

    // ---- mapping ------------------------------------------------------------------------------------------------------------------

    /** Everything a page of rows needs, read once per request (a consultancy has hundreds of requirements, not millions). */
    private final class Context {

        final Map<Long, String> clientNames = new HashMap<>();
        final Map<Long, List<String>> skills = new HashMap<>();
        final Map<Long, List<RequirementMatch>> assigned = new HashMap<>();
        final Map<Long, ClientContact> contactById = new HashMap<>();

        int assignedCount(Long requirementId) {
            return assigned.getOrDefault(requirementId, List.of()).size();
        }
    }

    private Context context(Long orgId) {
        Context ctx = new Context();
        for (ClientAccount c : clients.findByOrgId(orgId)) ctx.clientNames.put(c.getId(), c.getName());
        List<RequirementSkill> all = skillRepo.findByOrgId(orgId);
        all.stream().sorted(Comparator.comparing((RequirementSkill s) -> s.getSortOrder() == null ? 0 : s.getSortOrder())).forEach(s -> ctx.skills.computeIfAbsent(s.getRequirementId(), k -> new ArrayList<>()).add(s.getSkill()));
        for (RequirementMatch m : matchRepo.findByOrgId(orgId)) if ("ASSIGNED".equals(m.getStatus())) ctx.assigned.computeIfAbsent(m.getRequirementId(), k -> new ArrayList<>()).add(m);
        for (ClientContact c : contacts.findByOrgId(orgId)) ctx.contactById.put(c.getId(), c);
        return ctx;
    }

    private RequirementDTO.Row row(ClientRequirement r, Context ctx) {
        Long min = r.getRateMinMinor() == null ? null : r.getRateMinMinor() / 100;
        Long max = r.getRateMaxMinor() == null ? null : r.getRateMaxMinor() / 100;
        RequirementDTO.Rate rate = min == null && max == null ? null : new RequirementDTO.Rate(min, max, r.getRateUnit(), r.getCurrency());
        int age = r.getPostedAt() == null ? 0 : (int) Math.max(0, ChronoUnit.DAYS.between(r.getPostedAt(), Instant.now()));
        return new RequirementDTO.Row(
            r.getId(), r.getTitle(), new RequirementDTO.ClientRef(r.getClientId(), ctx.clientNames.getOrDefault(r.getClientId(), "")), r.getLocation(), r.getWorkMode(),
            r.getPriority(), r.getStatus(), r.getPositions(), r.getFilled(), rate, ctx.skills.getOrDefault(r.getId(), List.of()), r.getDueOn(), r.getPostedAt(), age,
            ctx.assignedCount(r.getId()), r.getSource()
        );
    }

    private RequirementDTO.Detail detailOf(OrgMembership me, ClientRequirement r) {
        return detailOf(me, r, null);
    }

    /** {@code justAssigned}: a match committed by a nested transaction after this snapshot began; it is counted and listed even though a plain read misses it. */
    private RequirementDTO.Detail detailOf(OrgMembership me, ClientRequirement r, RequirementMatch justAssigned) {
        Long orgId = me.orgId();
        Context ctx = context(orgId);
        if (justAssigned != null && "ASSIGNED".equals(justAssigned.getStatus()) && r.getId().equals(justAssigned.getRequirementId())) {
            List<RequirementMatch> seen = ctx.assigned.computeIfAbsent(r.getId(), k -> new ArrayList<>());
            if (seen.stream().noneMatch(m -> justAssigned.getConsultantId().equals(m.getConsultantId()))) seen.add(justAssigned);
        }
        List<RequirementDTO.Assignee> assignees = new ArrayList<>();
        Map<Long, ConsultantProfile> people = consultantRepo.findByOrgId(orgId).stream().collect(Collectors.toMap(ConsultantProfile::getId, c -> c, (a, b) -> a));
        Map<Long, String> stages = new HashMap<>();
        for (TalentApplication a : applications.findByOrgId(orgId)) if (r.getId().equals(a.getRequirementId())) stages.put(a.getConsultantId(), a.getStage());
        for (RequirementMatch m : ctx.assigned.getOrDefault(r.getId(), List.of())) {
            ConsultantProfile c = people.get(m.getConsultantId());
            if (c == null) continue;
            assignees.add(new RequirementDTO.Assignee(c.getId(), c.getDisplayName(), c.getJobTitle(), m.getStatus(), stages.get(c.getId()), m.getAssignedAt()));
            if (assignees.size() >= MAX_DETAIL_ASSIGNEES) break;
        }
        assignees.sort(Comparator.comparing(RequirementDTO.Assignee::name, String.CASE_INSENSITIVE_ORDER));
        ClientContact contact = r.getContactId() == null ? null : ctx.contactById.get(r.getContactId());
        return new RequirementDTO.Detail(
            row(r, ctx), r.getDescriptionText(), r.getEmploymentLabel(), r.getDurationLabel(), r.getExperienceLevel(),
            contact == null ? null : new RequirementDTO.Contact(contact.getId(), contact.getName(), contact.getTitle()), r.getJobUrl(), assignees, JobBoardService.versionOf(r), access(me)
        );
    }

    // ---- filters and helpers ------------------------------------------------------------------------------------------------------

    private static boolean matches(ClientRequirement r, Context ctx, String needle) {
        if (r.getTitle() != null && r.getTitle().toLowerCase(Locale.ROOT).contains(needle)) return true;
        if (r.getLocation() != null && r.getLocation().toLowerCase(Locale.ROOT).contains(needle)) return true;
        if (ctx.clientNames.getOrDefault(r.getClientId(), "").toLowerCase(Locale.ROOT).contains(needle)) return true;
        return ctx.skills.getOrDefault(r.getId(), List.of()).stream().anyMatch(s -> s.toLowerCase(Locale.ROOT).contains(needle));
    }

    private static boolean sortDefaultAsc(String sort) {
        return switch (sort) {
            case "due", "title", "client" -> true;
            default -> false;
        };
    }

    private static Comparator<ClientRequirement> comparator(String sort, Context ctx) {
        Comparator<ClientRequirement> byId = Comparator.comparing(ClientRequirement::getId);
        Comparator<ClientRequirement> main = switch (sort) {
            case "due" -> Comparator.comparing(ClientRequirement::getDueOn, Comparator.nullsLast(Comparator.<LocalDate>naturalOrder()));
            case "priority" -> Comparator.comparingInt(r -> PRIORITIES.indexOf(r.getPriority()));
            case "title" -> Comparator.comparing(r -> r.getTitle() == null ? "" : r.getTitle().toLowerCase(Locale.ROOT));
            case "client" -> Comparator.comparing(r -> ctx.clientNames.getOrDefault(r.getClientId(), "").toLowerCase(Locale.ROOT));
            case "status" -> Comparator.comparingInt(r -> STATUSES.indexOf(r.getStatus()));
            case "age" -> Comparator.comparing(ClientRequirement::getPostedAt, Comparator.nullsLast(Comparator.<Instant>naturalOrder())).reversed();
            default -> Comparator.comparing(ClientRequirement::getPostedAt, Comparator.nullsFirst(Comparator.<Instant>naturalOrder()));
        };
        return main.thenComparing(byId);
    }

    private static List<String> checked(String field, List<String> raw, List<String> allowed) {
        if (raw == null || raw.isEmpty()) return List.of();
        List<String> out = new ArrayList<>();
        for (String v : raw) {
            if (v == null || v.isBlank()) continue;
            String u = v.strip().toUpperCase(Locale.ROOT);
            if (!allowed.contains(u)) throw OrgException.invalid(field, "one of " + allowed);
            out.add(u);
        }
        return out;
    }

    private static String oneOf(String field, Object raw, List<String> allowed, String fallback) {
        if (raw == null) return fallback;
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text");
        if (s.isBlank()) return fallback;
        String u = s.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(u)) throw OrgException.invalid(field, "one of " + allowed);
        return u;
    }

    /** A due date from yesterday to five years ahead (a date already long gone is a typo). */
    private static LocalDate dueDate(LocalDate d) {
        if (d == null) return null;
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        if (d.isBefore(today.minusDays(1)) || d.isAfter(today.plusYears(5))) throw OrgException.invalid("dueOn", "a date from today to five years ahead");
        return d;
    }

    /** Lower-case words only, so "Sr. Java  Developer" and "sr java developer" are the same requirement ("+" and "#" stay: C++ and C# are different roles). */
    static String norm(String s) {
        if (s == null) return "";
        return s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9+#]+", " ").strip();
    }

    private static OrgException exists(ClientRequirement other) {
        return OrgException.coded(409, CODE_REQUIREMENT_EXISTS, "This client already has an open requirement like this one", Map.of("existingId", other.getId()));
    }

    private static void checkVersion(String header, String current) {
        if (header == null || header.isBlank()) {
            throw OrgException.coded(428, CODE_PRECONDITION_REQUIRED, "Send the version you loaded in an If-Match header", Map.of());
        }
        String v = header.strip();
        if (v.startsWith("W/")) v = v.substring(2);
        if (!v.replace("\"", "").equals(current)) {
            throw OrgException.coded(412, CODE_PRECONDITION_FAILED, "This requirement changed since you loaded it", Map.of("currentVersion", current));
        }
    }
}
