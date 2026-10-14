package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.dto.ent.JobDTO;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The write side of the Jobs page: create a job, edit one (autosave, one field family at a time), change the status of several at once,
 * assign a consultant from Top Matches (which opens an application), and dismiss or restore a suggested match. Order of refusals, in every
 * method: (1) the permission and the organization's state (404), (2) the row inside this organization (404), (3) the version
 * ({@code If-Match}: 428, 412), (4) validation (422), (5) state (409). Free text is checked by the sensitive-data scanner; nothing here ever
 * stores an identity document, bank, tax or birth value. Every change writes one audit row ({@code JOB_*}, target type {@code JOB}).
 */
@Service
public class JobWriteService {

    public static final String JOB_CREATE = "JOB_CREATE";
    public static final String JOB_UPDATE = "JOB_UPDATE";
    public static final String JOB_STATUS = "JOB_STATUS";
    public static final String JOB_BULK = "JOB_BULK";
    public static final String JOB_ASSIGN = "JOB_ASSIGN";
    public static final String JOB_MATCH_DISMISS = "JOB_MATCH_DISMISS";
    public static final String JOB_MATCH_RESTORE = "JOB_MATCH_RESTORE";
    public static final String TARGET = "JOB";

    public static final String CODE_PRECONDITION_REQUIRED = "PRECONDITION_REQUIRED";
    public static final String CODE_PRECONDITION_FAILED = "PRECONDITION_FAILED";
    public static final String CODE_JOB_NOT_OPEN = "JOB_NOT_OPEN";
    public static final String CODE_MATCH_STATE = "MATCH_STATE";
    public static final String CODE_CONSULTANT_UNAVAILABLE = "CONSULTANT_UNAVAILABLE";

    static final int TITLE_MAX = 300;
    static final int DESCRIPTION_MAX = 4000;
    static final int LOCATION_MAX = 300;
    static final int DURATION_MAX = 40;
    static final int SKILL_MAX = 60;
    static final int SKILLS_MAX = 15;
    static final long RATE_MAX = 10_000_000L;
    static final int POSITIONS_MAX = 500;

    /** The only keys a PATCH accepts: anything else (orgId, clientId, postedAt...) is refused, never bound. */
    public static final Set<String> EDITABLE = Set.of(
        "title", "description", "location", "workMode", "employment", "durationLabel", "experienceLevel", "rateMin", "rateMax", "rateUnit", "positions", "filled", "status", "contactId", "skills"
    );
    static final Set<String> CREATE_STATUSES = Set.of("OPEN", "IN_REVIEW", "ON_HOLD");
    static final Set<String> BULK_STATUSES = Set.of("OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED");
    static final Set<String> RATE_UNITS = Set.of("HOUR", "YEAR");

    private final ClientRequirementRepository jobs;
    private final ClientAccountRepository clients;
    private final ClientContactRepository contacts;
    private final RequirementSkillRepository skillRepo;
    private final RequirementMatchRepository matchRepo;
    private final TalentApplicationRepository applications;
    private final TalentApplicationEventRepository events;
    private final MarketerAssignmentRepository assignments;
    private final OrgResumeRepository resumes;
    private final OrgAuditService audit;
    private final JobAccess access;
    private final JobBoardService board;

    @PersistenceContext
    private EntityManager em;

    public JobWriteService(
        ClientRequirementRepository jobs,
        ClientAccountRepository clients,
        ClientContactRepository contacts,
        RequirementSkillRepository skillRepo,
        RequirementMatchRepository matchRepo,
        TalentApplicationRepository applications,
        TalentApplicationEventRepository events,
        MarketerAssignmentRepository assignments,
        OrgResumeRepository resumes,
        OrgAuditService audit,
        JobAccess access,
        JobBoardService board
    ) {
        this.jobs = jobs;
        this.clients = clients;
        this.contacts = contacts;
        this.skillRepo = skillRepo;
        this.matchRepo = matchRepo;
        this.applications = applications;
        this.events = events;
        this.assignments = assignments;
        this.resumes = resumes;
        this.audit = audit;
        this.access = access;
        this.board = board;
    }

    // ---- create -------------------------------------------------------------------------------------------------------------------

    @Transactional
    public JobDTO.Detail create(OrgMembership me, JobDTO.CreateRequest req) {
        access.requireWrite(me, JobAccess.KEY_MANAGE);
        Long orgId = me.orgId();
        if (req == null) throw OrgException.invalid("body", "send a job");
        if (req.clientId() == null) throw OrgException.invalid("clientId", "choose a client");
        ClientAccount client = clients.findByOrgIdAndId(orgId, req.clientId()).orElseThrow(OrgNotFoundException::new);
        ClientContact contact = null;
        if (req.contactId() != null) {
            contact = contacts.findByOrgIdAndId(orgId, req.contactId()).orElseThrow(OrgNotFoundException::new);
            if (!contact.getClientId().equals(client.getId())) throw OrgException.invalid("contactId", "that contact belongs to another client");
        }
        String title = text("title", req.title(), TITLE_MAX, true);
        if (title.length() < 2) throw OrgException.invalid("title", "at least 2 characters");
        String status = req.status() == null ? "OPEN" : req.status().trim().toUpperCase(Locale.ROOT);
        if (!CREATE_STATUSES.contains(status)) throw OrgException.invalid("status", "one of " + CREATE_STATUSES);

        ClientRequirement r = new ClientRequirement();
        r.setOrgId(orgId);
        r.setClientId(client.getId());
        r.setContactId(contact == null ? null : contact.getId());
        r.setTitle(title);
        r.setDescriptionText(text("description", req.description(), DESCRIPTION_MAX, false));
        r.setLocation(text("location", req.location(), LOCATION_MAX, false));
        r.setWorkMode(oneOf("workMode", req.workMode(), JobBoardService.WORK_MODES));
        r.setEmploymentLabel(oneOf("employment", req.employment(), JobBoardService.EMPLOYMENT));
        r.setDurationLabel(text("durationLabel", req.durationLabel(), DURATION_MAX, false));
        r.setExperienceLevel(oneOf("experienceLevel", req.experienceLevel(), JobBoardService.EXPERIENCE));
        applyRate(r, req.rateMin() != null, req.rateMin(), req.rateMax() != null, req.rateMax(), req.rateUnit() != null, req.rateUnit());
        int positions = req.positions() == null ? 1 : req.positions();
        if (positions < 1 || positions > POSITIONS_MAX) throw OrgException.invalid("positions", "between 1 and " + POSITIONS_MAX);
        r.setPositions(positions);
        r.setStatus(status);
        r.setSource("MANUAL");
        r.setOwnerMemberId(me.memberId());
        Instant now = Instant.now();
        r.setPostedAt(now);
        r.setCreatedAt(now);
        r.setUpdatedAt(now);
        List<String> skills = cleanSkills(req.skills());
        r = jobs.save(r);
        replaceSkills(orgId, r.getId(), skills);
        audit.record(me, JOB_CREATE, TARGET, null, String.valueOf(r.getId()), "title: " + title);
        em.flush();
        em.clear();
        return board.detailOf(me, jobs.findByOrgIdAndId(orgId, r.getId()).orElseThrow());
    }

    // ---- edit ---------------------------------------------------------------------------------------------------------------------

    @Transactional
    public JobDTO.Detail patch(OrgMembership me, Long jobId, String ifMatch, Map<String, Object> body) {
        access.requireWrite(me, JobAccess.KEY_MANAGE);
        Long orgId = me.orgId();
        ClientRequirement r = jobs.findByOrgIdAndId(orgId, jobId).orElseThrow(OrgNotFoundException::new);
        checkVersion(ifMatch, JobBoardService.versionOf(r));
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "name at least one field to change");
        for (String key : body.keySet()) if (!EDITABLE.contains(key)) throw OrgException.invalid(key, "cannot be changed here");

        List<String> changed = new ArrayList<>();
        String fromStatus = r.getStatus();
        if (body.containsKey("title")) {
            String v = text("title", body.get("title"), TITLE_MAX, true);
            if (v.length() < 2) throw OrgException.invalid("title", "at least 2 characters");
            if (!v.equals(r.getTitle())) { r.setTitle(v); changed.add("title"); }
        }
        if (body.containsKey("description")) {
            String v = text("description", body.get("description"), DESCRIPTION_MAX, false);
            if (!java.util.Objects.equals(v, r.getDescriptionText())) { r.setDescriptionText(v); changed.add("description"); }
        }
        if (body.containsKey("location")) {
            String v = text("location", body.get("location"), LOCATION_MAX, false);
            if (!java.util.Objects.equals(v, r.getLocation())) { r.setLocation(v); changed.add("location"); }
        }
        if (body.containsKey("workMode")) {
            String v = oneOf("workMode", body.get("workMode"), JobBoardService.WORK_MODES);
            if (!java.util.Objects.equals(v, r.getWorkMode())) { r.setWorkMode(v); changed.add("work mode"); }
        }
        if (body.containsKey("employment")) {
            String v = oneOf("employment", body.get("employment"), JobBoardService.EMPLOYMENT);
            if (!java.util.Objects.equals(v, r.getEmploymentLabel())) { r.setEmploymentLabel(v); changed.add("job type"); }
        }
        if (body.containsKey("durationLabel")) {
            String v = text("durationLabel", body.get("durationLabel"), DURATION_MAX, false);
            if (!java.util.Objects.equals(v, r.getDurationLabel())) { r.setDurationLabel(v); changed.add("duration"); }
        }
        if (body.containsKey("experienceLevel")) {
            String v = oneOf("experienceLevel", body.get("experienceLevel"), JobBoardService.EXPERIENCE);
            if (!java.util.Objects.equals(v, r.getExperienceLevel())) { r.setExperienceLevel(v); changed.add("experience level"); }
        }
        if (body.containsKey("rateMin") || body.containsKey("rateMax") || body.containsKey("rateUnit")) {
            Long oldMin = r.getRateMinMinor(), oldMax = r.getRateMaxMinor();
            String oldUnit = r.getRateUnit();
            applyRate(r, body.containsKey("rateMin"), whole("rateMin", body.get("rateMin")), body.containsKey("rateMax"), whole("rateMax", body.get("rateMax")), body.containsKey("rateUnit"), (String) strOrNull("rateUnit", body.get("rateUnit")));
            if (!java.util.Objects.equals(oldMin, r.getRateMinMinor()) || !java.util.Objects.equals(oldMax, r.getRateMaxMinor()) || !java.util.Objects.equals(oldUnit, r.getRateUnit())) changed.add("compensation");
        }
        if (body.containsKey("positions")) {
            Long v = whole("positions", body.get("positions"));
            if (v == null || v < 1 || v > POSITIONS_MAX) throw OrgException.invalid("positions", "between 1 and " + POSITIONS_MAX);
            if (v.intValue() != r.getPositions()) { r.setPositions(v.intValue()); changed.add("positions"); }
        }
        if (body.containsKey("filled")) {
            Long v = whole("filled", body.get("filled"));
            int positions = r.getPositions();
            if (v == null || v < 0 || v > positions) throw OrgException.invalid("filled", "between 0 and the number of positions");
            if (v.intValue() != r.getFilled()) { r.setFilled(v.intValue()); changed.add("filled"); }
        }
        if (body.containsKey("contactId")) {
            Long cid = whole("contactId", body.get("contactId"));
            if (cid != null) {
                ClientContact c = contacts.findByOrgIdAndId(orgId, cid).orElseThrow(OrgNotFoundException::new);
                if (!c.getClientId().equals(r.getClientId())) throw OrgException.invalid("contactId", "that contact belongs to another client");
            }
            if (!java.util.Objects.equals(cid, r.getContactId())) { r.setContactId(cid); changed.add("client contact"); }
        }
        boolean skillsChanged = false;
        List<String> newSkills = null;
        if (body.containsKey("skills")) {
            newSkills = cleanSkills(body.get("skills"));
            List<String> old = board.skillsOf(orgId, List.of(r.getId())).getOrDefault(r.getId(), List.of());
            skillsChanged = !old.equals(newSkills);
            if (skillsChanged) changed.add("skills");
        }
        boolean statusChanged = false;
        if (body.containsKey("status")) {
            String v = oneOf("status", body.get("status"), JobBoardService.STATUSES);
            if (v == null) throw OrgException.invalid("status", "choose a status");
            if (!v.equals(r.getStatus())) {
                setStatus(r, v);
                statusChanged = true;
            }
        }
        if (changed.isEmpty() && !statusChanged) return board.detailOf(me, r);

        r.setUpdatedAt(Instant.now());
        r = jobs.save(r);
        if (skillsChanged) replaceSkills(orgId, r.getId(), newSkills);
        if (statusChanged) audit.record(me, JOB_STATUS, TARGET, null, String.valueOf(r.getId()), statusWords(fromStatus) + " to " + statusWords(r.getStatus()));
        if (!changed.isEmpty()) audit.record(me, JOB_UPDATE, TARGET, null, String.valueOf(r.getId()), String.join(", ", changed));
        em.flush();
        em.clear();
        return board.detailOf(me, jobs.findByOrgIdAndId(orgId, r.getId()).orElseThrow());
    }

    // ---- bulk status --------------------------------------------------------------------------------------------------------------

    @Transactional
    public JobDTO.BulkResult bulkStatus(OrgMembership me, JobDTO.BulkStatusRequest req) {
        access.requireWrite(me, JobAccess.KEY_MANAGE);
        Long orgId = me.orgId();
        if (req == null || req.ids() == null || req.ids().isEmpty()) throw OrgException.invalid("ids", "name at least one job");
        if (req.ids().size() > JobDTO.BULK_MAX) throw OrgException.invalid("ids", "at most " + JobDTO.BULK_MAX + " jobs at a time");
        String status = req.status() == null ? "" : req.status().trim().toUpperCase(Locale.ROOT);
        if (!BULK_STATUSES.contains(status)) throw OrgException.invalid("status", "one of " + BULK_STATUSES);
        List<JobDTO.Skipped> skipped = new ArrayList<>();
        List<JobDTO.RowResult> results = new ArrayList<>();
        int ok = 0;
        Set<Long> seen = new LinkedHashSet<>(req.ids());
        for (Long id : seen) {
            Optional<ClientRequirement> found = id == null ? Optional.empty() : jobs.findByOrgIdAndId(orgId, id);
            if (found.isEmpty()) {
                skipped.add(new JobDTO.Skipped(id, "NOT_FOUND"));
                results.add(new JobDTO.RowResult(id, false, "NOT_FOUND", Map.of()));
                continue;
            }
            ClientRequirement r = found.get();
            if (r.getStatus().equals(status)) {
                skipped.add(new JobDTO.Skipped(id, "UNCHANGED"));
                results.add(new JobDTO.RowResult(id, false, "UNCHANGED", Map.of("status", r.getStatus())));
                continue;
            }
            String from = r.getStatus();
            setStatus(r, status);
            r.setUpdatedAt(Instant.now());
            jobs.save(r);
            audit.record(me, JOB_STATUS, TARGET, null, String.valueOf(id), statusWords(from) + " to " + statusWords(status));
            results.add(new JobDTO.RowResult(id, true, null, Map.of("status", from)));
            ok++;
        }
        audit.record(me, JOB_BULK, TARGET, null, null, "status " + statusWords(status) + ": " + ok + " of " + seen.size());
        return new JobDTO.BulkResult("status", seen.size(), ok, skipped, results);
    }

    // ---- assign / dismiss a match -------------------------------------------------------------------------------------------------

    @Transactional
    public JobDTO.AssignResult assign(OrgMembership me, Long jobId, Long matchId) {
        access.requireWrite(me, JobAccess.KEY_ASSIGN);
        Long orgId = me.orgId();
        ClientRequirement job = jobs.findByOrgIdAndId(orgId, jobId).orElseThrow(OrgNotFoundException::new);
        RequirementMatch match = matchRepo.findByOrgIdAndId(orgId, matchId).orElseThrow(OrgNotFoundException::new);
        if (!match.getRequirementId().equals(job.getId())) throw new OrgNotFoundException();
        ConsultantProfile consultant = board.consultants(orgId, List.of(match.getConsultantId())).get(match.getConsultantId());
        if (consultant == null) throw new OrgNotFoundException();
        if (!access.mayAssign(me, consultant.getId())) throw new OrgNotFoundException();

        Optional<TalentApplication> existing = applications.findByOrgIdAndConsultantId(orgId, consultant.getId()).stream().filter(a -> a.getRequirementId().equals(job.getId())).findFirst();
        if ("ASSIGNED".equals(match.getStatus()) && existing.isPresent()) {
            return new JobDTO.AssignResult(board.detailOf(me, job), existing.get().getId(), existing.get().getCode(), true);
        }
        if (!"OPEN".equals(job.getStatus()) && !"IN_REVIEW".equals(job.getStatus())) {
            throw OrgException.coded(409, CODE_JOB_NOT_OPEN, "This job is not taking assignments right now", Map.of("status", job.getStatus()));
        }
        if ("DISMISSED".equals(match.getStatus())) {
            throw OrgException.coded(409, CODE_MATCH_STATE, "Restore this match before assigning it", Map.of("status", match.getStatus()));
        }
        if (!"ACTIVE".equals(consultant.getStatus())) {
            throw OrgException.coded(409, CODE_CONSULTANT_UNAVAILABLE, "This consultant is not active", Map.of());
        }

        Instant now = Instant.now();
        TalentApplication app = existing.orElseGet(TalentApplication::new);
        if (app.getId() == null) {
            app.setOrgId(orgId);
            app.setRequirementId(job.getId());
            app.setConsultantId(consultant.getId());
            app.setClientId(job.getClientId());
            app.setCode(nextCode(orgId, now));
            app.setStage("ASSIGNED");
            app.setAppliedOn(LocalDate.ofInstant(now, ZoneOffset.UTC));
            app.setSourceLabel("Jobs board");
            app.setStageChangedAt(now);
            app.setCreatedAt(now);
            app.setUpdatedAt(now);
            Optional<MarketerAssignment> ma = assignments.findByOrgIdAndConsultantId(orgId, consultant.getId());
            app.setMarketerMemberId(ma.map(MarketerAssignment::getMarketerMemberId).orElse(null));
            app.setResumeId(primaryResume(orgId, consultant.getId()));
            app = applications.save(app);
            TalentApplicationEvent ev = new TalentApplicationEvent();
            ev.setOrgId(orgId);
            ev.setApplicationId(app.getId());
            ev.setEventType("CREATED");
            ev.setToStage("ASSIGNED");
            ev.setActorMemberId(me.memberId());
            ev.setDetail("Assigned from the Jobs board");
            ev.setOccurredAt(now);
            events.save(ev);
        }
        match.setStatus("ASSIGNED");
        match.setAssignedByMemberId(me.memberId());
        match.setAssignedAt(now);
        matchRepo.save(match);
        audit.record(me, JOB_ASSIGN, TARGET, null, String.valueOf(job.getId()), consultant.getDisplayName() + " (" + app.getCode() + ")");
        em.flush();
        em.clear();
        ClientRequirement fresh = jobs.findByOrgIdAndId(orgId, job.getId()).orElseThrow();
        return new JobDTO.AssignResult(board.detailOf(me, fresh), app.getId(), app.getCode(), false);
    }

    @Transactional
    public JobDTO.Detail setMatchStatus(OrgMembership me, Long jobId, Long matchId, String status) {
        access.requireWrite(me, JobAccess.KEY_ASSIGN);
        Long orgId = me.orgId();
        ClientRequirement job = jobs.findByOrgIdAndId(orgId, jobId).orElseThrow(OrgNotFoundException::new);
        RequirementMatch match = matchRepo.findByOrgIdAndId(orgId, matchId).orElseThrow(OrgNotFoundException::new);
        if (!match.getRequirementId().equals(job.getId())) throw new OrgNotFoundException();
        if (!access.mayAssign(me, match.getConsultantId())) throw new OrgNotFoundException();
        String next = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!next.equals("DISMISSED") && !next.equals("SUGGESTED")) throw OrgException.invalid("status", "DISMISSED or SUGGESTED");
        if ("ASSIGNED".equals(match.getStatus())) {
            throw OrgException.coded(409, CODE_MATCH_STATE, "This consultant is already assigned", Map.of("status", match.getStatus()));
        }
        if (!match.getStatus().equals(next)) {
            match.setStatus(next);
            matchRepo.save(match);
            ConsultantProfile c = board.consultants(orgId, List.of(match.getConsultantId())).get(match.getConsultantId());
            audit.record(me, next.equals("DISMISSED") ? JOB_MATCH_DISMISS : JOB_MATCH_RESTORE, TARGET, null, String.valueOf(job.getId()), c == null ? "consultant" : c.getDisplayName());
        }
        em.flush();
        em.clear();
        return board.detailOf(me, jobs.findByOrgIdAndId(orgId, jobId).orElseThrow());
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------------

    private String nextCode(Long orgId, Instant now) {
        int year = now.atZone(ZoneOffset.UTC).getYear();
        String prefix = "APP-" + year + "-";
        Number count = (Number) em.createQuery("select count(a) from TalentApplication a where a.orgId = :o and a.code like :p").setParameter("o", orgId).setParameter("p", prefix + "%").getSingleResult();
        int n = count.intValue() + 1;
        while (applications.findByOrgIdAndCode(orgId, String.format("%s%03d", prefix, n)).isPresent()) n++;
        return String.format("%s%03d", prefix, n);
    }

    private Long primaryResume(Long orgId, Long consultantId) {
        List<OrgResume> list = resumes.findByOrgIdAndConsultantId(orgId, consultantId);
        for (OrgResume r : list) if (r.isPrimaryForOrg()) return r.getId();
        return list.isEmpty() ? null : list.get(0).getId();
    }

    private void replaceSkills(Long orgId, Long jobId, List<String> skills) {
        skillRepo.deleteAll(skillRepo.findByOrgIdAndRequirementIdIn(orgId, List.of(jobId)));
        em.flush();
        int i = 0;
        for (String s : skills) {
            RequirementSkill rs = new RequirementSkill();
            rs.setOrgId(orgId);
            rs.setRequirementId(jobId);
            rs.setSkill(s);
            rs.setSortOrder(i++);
            skillRepo.save(rs);
        }
    }

    /** FILLED and CLOSED stamp {@code closed_at}; reopening clears it. */
    private static void setStatus(ClientRequirement r, String status) {
        r.setStatus(status);
        if (status.equals("FILLED") || status.equals("CLOSED")) {
            if (r.getClosedAt() == null) r.setClosedAt(Instant.now());
        } else {
            r.setClosedAt(null);
        }
    }

    static String statusWords(String status) {
        return status.toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    private static void applyRate(ClientRequirement r, boolean minGiven, Long min, boolean maxGiven, Long max, boolean unitGiven, String unit) {
        Long newMin = minGiven ? min : (r.getRateMinMinor() == null ? null : r.getRateMinMinor() / 100);
        Long newMax = maxGiven ? max : (r.getRateMaxMinor() == null ? null : r.getRateMaxMinor() / 100);
        String newUnit = unitGiven ? (unit == null ? null : unit.trim().toUpperCase(Locale.ROOT)) : r.getRateUnit();
        if (newMin != null && (newMin < 0 || newMin > RATE_MAX)) throw OrgException.invalid("rateMin", "between 0 and " + RATE_MAX);
        if (newMax != null && (newMax < 0 || newMax > RATE_MAX)) throw OrgException.invalid("rateMax", "between 0 and " + RATE_MAX);
        if (newMin != null && newMax != null && newMin > newMax) throw OrgException.invalid("rateMax", "at least the minimum");
        if (newUnit != null && !RATE_UNITS.contains(newUnit)) throw OrgException.invalid("rateUnit", "one of " + RATE_UNITS);
        if ((newMin != null || newMax != null) && newUnit == null) throw OrgException.invalid("rateUnit", "choose per hour or per year");
        r.setRateMinMinor(newMin == null ? null : newMin * 100);
        r.setRateMaxMinor(newMax == null ? null : newMax * 100);
        r.setRateUnit(newMin == null && newMax == null ? null : newUnit);
    }

    private static Object strOrNull(String field, Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text");
        return s;
    }

    /** A JSON whole number (or null). Text, booleans and objects are refused, never coerced. */
    private static Long whole(String field, Object raw) {
        if (raw == null) return null;
        if (raw instanceof Integer || raw instanceof Long || raw instanceof Short) return ((Number) raw).longValue();
        throw OrgException.invalid(field, "must be a whole number");
    }

    private static String text(String field, Object raw, int max, boolean required) {
        if (raw == null) {
            if (required) throw OrgException.invalid(field, "is required");
            return null;
        }
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text");
        String t = s.strip();
        if (t.isEmpty()) {
            if (required) throw OrgException.invalid(field, "is required");
            return null;
        }
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        boolean multiline = field.equals("description");
        if (t.chars().anyMatch(ch -> Character.isISOControl(ch) && !(multiline && (ch == '\n' || ch == '\r' || ch == '\t')))) throw OrgException.invalid(field, "contains characters that are not allowed");
        if (t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String oneOf(String field, Object raw, List<String> allowed) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text");
        if (s.isBlank()) return null;
        String u = s.trim().toUpperCase(Locale.ROOT);
        if (!allowed.contains(u)) throw OrgException.invalid(field, "one of " + allowed);
        return u;
    }

    /** At most {@link #SKILLS_MAX} distinct skills (case-insensitive), each trimmed and checked. */
    static List<String> cleanSkills(Object raw) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) throw OrgException.invalid("skills", "must be a list");
        Map<String, String> byKey = new LinkedHashMap<>();
        for (Object o : list) {
            if (!(o instanceof String s)) throw OrgException.invalid("skills", "each skill must be text");
            String t = s.strip();
            if (t.isEmpty()) continue;
            if (t.length() > SKILL_MAX) throw OrgException.invalid("skills", "each skill is at most " + SKILL_MAX + " characters");
            if (t.indexOf('<') >= 0 || t.indexOf('>') >= 0 || t.chars().anyMatch(Character::isISOControl)) throw OrgException.invalid("skills", "contains characters that are not allowed");
            SensitiveContent.check("skills", "skill", t);
            byKey.putIfAbsent(t.toLowerCase(Locale.ROOT), t);
        }
        if (byKey.size() > SKILLS_MAX) throw OrgException.invalid("skills", "at most " + SKILLS_MAX + " skills");
        return new ArrayList<>(byKey.values());
    }

    private static void checkVersion(String header, String current) {
        if (header == null || header.isBlank()) {
            throw OrgException.coded(428, CODE_PRECONDITION_REQUIRED, "Send the version you loaded in an If-Match header", Map.of());
        }
        if (!normalise(header).equals(normalise(current))) {
            throw OrgException.coded(412, CODE_PRECONDITION_FAILED, "This job changed since you loaded it", Map.of("currentVersion", current));
        }
    }

    private static String normalise(String etag) {
        String v = etag.strip();
        if (v.startsWith("W/")) v = v.substring(2);
        return v.replace("\"", "");
    }
}
