package com.dossier.api.service.ent.consultants;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.dto.ent.ConsultantDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The write side of the Consultants board: add a consultant, edit availability / license / department / profile facts, assign a marketer, deactivate
 * and reactivate, create an application from the drawer, and the three bulk actions. Every write needs the key it names (404 otherwise), the
 * consultant inside the caller's reach, an organization that accepts writes, and writes exactly one audit row per changed consultant (bulk calls add
 * one CONSULTANT_BULK summary row when something changed). Free text goes through the PII scanner.
 */
@Service
public class ConsultantWriteService {

    public static final String CODE_PRECONDITION_REQUIRED = "PRECONDITION_REQUIRED";
    public static final String CODE_PRECONDITION_FAILED = "PRECONDITION_FAILED";
    public static final String CODE_CONSULTANT_EXISTS = "CONSULTANT_EXISTS";
    public static final String CODE_MARKETER_INVALID = "MARKETER_INVALID";
    public static final String CODE_CONSULTANT_INACTIVE = "CONSULTANT_INACTIVE";
    public static final String CODE_JOB_NOT_OPEN = "JOB_NOT_OPEN";
    public static final String CODE_APPLICATION_EXISTS = "APPLICATION_EXISTS";

    public static final String A_CREATE = "CONSULTANT_CREATE";
    public static final String A_UPDATE = "CONSULTANT_UPDATE";
    public static final String A_ASSIGN = "CONSULTANT_ASSIGN";
    public static final String A_DEACTIVATE = "CONSULTANT_DEACTIVATE";
    public static final String A_REACTIVATE = "CONSULTANT_REACTIVATE";
    public static final String A_BULK = "CONSULTANT_BULK";
    public static final String A_APPLICATION = "APPLICATION_CREATE";
    public static final String TARGET = "CONSULTANT";

    static final int MAX_BULK = 200;
    static final int MAX_SKILLS = 12;
    static final Pattern EMAIL = Pattern.compile("^[^\\s@<>]{1,64}@[^\\s@<>]{1,190}\\.[A-Za-z]{2,}$");
    public static final Set<String> PRIORITY = Set.of("HIGH", "MEDIUM", "LOW");
    /** The keys a single edit accepts: anything else (orgId, status, memberId...) is refused, never bound. */
    public static final Set<String> EDITABLE = Set.of(
        "jobTitle", "yearsExperience", "locationLabel", "workMode", "availabilityStatus", "availableFrom", "licenseStatus", "licenseValidUntil", "departmentGroupId"
    );

    public record CreateRequest(String displayName, String email, String jobTitle, Integer yearsExperience, String locationLabel, String workMode, List<String> skills, Long departmentGroupId) {}

    public record AssignRequest(Long marketerMemberId, Long backupMemberId, String priority) {}

    private final ConsultantProfileRepository profiles;
    private final ConsultantSkillRepository skillRepo;
    private final MarketerAssignmentRepository assignmentRepo;
    private final TalentApplicationRepository applicationRepo;
    private final TalentApplicationEventRepository eventRepo;
    private final ConsultantQueryService query;
    private final ConsultantAccess access;
    private final OrgAuditService audit;
    private final Clock clock;

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public ConsultantWriteService(
        ConsultantProfileRepository profiles,
        ConsultantSkillRepository skillRepo,
        MarketerAssignmentRepository assignmentRepo,
        TalentApplicationRepository applicationRepo,
        TalentApplicationEventRepository eventRepo,
        ConsultantQueryService query,
        ConsultantAccess access,
        OrgAuditService audit
    ) {
        this.profiles = profiles;
        this.skillRepo = skillRepo;
        this.assignmentRepo = assignmentRepo;
        this.applicationRepo = applicationRepo;
        this.eventRepo = eventRepo;
        this.query = query;
        this.access = access;
        this.audit = audit;
        this.clock = Clock.systemUTC();
    }

    /** Now, cut to the microseconds the DATETIME(6) columns keep, so a version computed before a reload equals the one after. */
    private Instant now() {
        return Instant.now(clock).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
    }

    /** The permission wall of a write: the key, an organization that accepts writes, and (for rows) the reach. Called BEFORE the Idempotency-Key check. */
    public void gate(OrgMembership me, String... keys) {
        access.reach(me); // no view key at all: the same 404
        for (String k : keys) access.require(me, k);
        access.requireWritable(me, keys);
    }

    // ---- create ---------------------------------------------------------------------------------------------------------------

    @Transactional
    public ConsultantDTO.Detail create(OrgMembership me, CreateRequest in) {
        gate(me, ConsultantAccess.EDIT);
        if (in == null) throw OrgException.invalid("body", "send the consultant's details");
        Long orgId = me.orgId();
        String name = text("displayName", in.displayName(), 2, 120, true);
        String email = email(in.email());
        String title = text("jobTitle", in.jobTitle(), 0, 120, false);
        String location = text("locationLabel", in.locationLabel(), 0, 120, false);
        String mode = workMode(in.workMode());
        Integer years = years(in.yearsExperience());
        List<String> skills = skills(in.skills());
        Long dept = in.departmentGroupId() == null ? null : department(orgId, in.departmentGroupId());
        long dup = em.createQuery("select count(c) from ConsultantProfile c where c.orgId = :o and lower(c.email) = :e", Long.class)
            .setParameter("o", orgId).setParameter("e", email).getSingleResult();
        if (dup > 0) throw OrgException.coded(409, CODE_CONSULTANT_EXISTS, "A consultant with this email already exists", Map.of("field", "email"));
        Instant now = now();
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(orgId);
        c.setDisplayName(name);
        c.setEmail(email);
        c.setJobTitle(title);
        c.setLocationLabel(location);
        c.setWorkMode(mode);
        c.setYearsExperience(years);
        c.setDepartmentGroupId(dept);
        c.setAvailabilityStatus("AVAILABLE");
        c.setAvailabilitySince(LocalDate.now(ZoneOffset.UTC));
        c.setBenchSince(LocalDate.now(ZoneOffset.UTC));
        c.setMarketingStatus("ACTIVE");
        c.setLicenseStatus("PENDING");
        c.setStatus("ACTIVE");
        c.setProfileCompleteness(completeness(!skills.isEmpty()));
        c.setCreatedAt(now);
        c.setUpdatedAt(now);
        c = profiles.saveAndFlush(c);
        int order = 0;
        for (String s : skills) {
            ConsultantSkill k = new ConsultantSkill();
            k.setOrgId(orgId);
            k.setConsultantId(c.getId());
            k.setSkill(s);
            k.setPrimarySkill(order < 2);
            k.setSortOrder(order++);
            skillRepo.save(k);
        }
        skillRepo.flush();
        audit.record(me, A_CREATE, TARGET, null, String.valueOf(c.getId()), "added a consultant");
        return query.detail(me, c.getId());
    }

    static int completeness(boolean hasSkills) {
        return 20 + (hasSkills ? 20 : 0);
    }

    // ---- edit -----------------------------------------------------------------------------------------------------------------

    /** Only the keys of {@link #EDITABLE}; a JSON null clears a nullable field. If-Match carries the version of the detail the person loaded. */
    @Transactional
    public ConsultantDTO.Detail patch(OrgMembership me, Long id, String ifMatch, Map<String, Object> body) {
        gate(me, ConsultantAccess.EDIT);
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "name at least one field to change");
        for (String key : body.keySet()) if (!EDITABLE.contains(key)) throw OrgException.invalid(key, "cannot be changed here");
        ConsultantProfile c = query.visible(me, id);
        checkVersion(c, ifMatch);
        if (!"ACTIVE".equals(c.getStatus())) throw OrgException.coded(409, CODE_CONSULTANT_INACTIVE, "Reactivate this consultant before changing them", Map.of());
        List<String> changed = applyFields(me.orgId(), c, body);
        if (!changed.isEmpty()) {
            c.setUpdatedAt(now());
            profiles.saveAndFlush(c);
            audit.record(me, A_UPDATE, TARGET, null, String.valueOf(c.getId()), "changed " + String.join(", ", changed));
        }
        return query.detail(me, c.getId());
    }

    /** Applies the keys to {@code c} and answers the names of the ones that really changed (with enum transitions spelled out). */
    private List<String> applyFields(Long orgId, ConsultantProfile c, Map<String, Object> body) {
        List<String> changed = new ArrayList<>();
        if (body.containsKey("jobTitle")) {
            String v = text("jobTitle", body.get("jobTitle"), 0, 120, false);
            if (!java.util.Objects.equals(v, c.getJobTitle())) {
                c.setJobTitle(v);
                changed.add("jobTitle");
            }
        }
        if (body.containsKey("locationLabel")) {
            String v = text("locationLabel", body.get("locationLabel"), 0, 120, false);
            if (!java.util.Objects.equals(v, c.getLocationLabel())) {
                c.setLocationLabel(v);
                changed.add("locationLabel");
            }
        }
        if (body.containsKey("workMode")) {
            String v = workMode(body.get("workMode") == null ? null : String.valueOf(body.get("workMode")));
            if (!java.util.Objects.equals(v, c.getWorkMode())) {
                c.setWorkMode(v);
                changed.add("workMode");
            }
        }
        if (body.containsKey("yearsExperience")) {
            Object raw = body.get("yearsExperience");
            Integer v = raw == null ? null : years(raw instanceof Number n ? Integer.valueOf(n.intValue()) : parseInt("yearsExperience", raw));
            if (!java.util.Objects.equals(v, c.getYearsExperience())) {
                c.setYearsExperience(v);
                changed.add("yearsExperience");
            }
        }
        if (body.containsKey("availabilityStatus")) {
            String next = enumOf("availabilityStatus", body.get("availabilityStatus"), ConsultantQueryService.AVAILABILITY);
            if (!next.equals(c.getAvailabilityStatus())) {
                changed.add("availabilityStatus " + c.getAvailabilityStatus() + " -> " + next);
                applyAvailability(c, next);
            }
        }
        if (body.containsKey("availableFrom")) {
            LocalDate from = date("availableFrom", body.get("availableFrom"));
            if ("NOTICE".equals(c.getAvailabilityStatus()) && !java.util.Objects.equals(from, c.getAvailableFrom())) {
                c.setAvailableFrom(from);
                changed.add("availableFrom");
            }
        }
        if (body.containsKey("licenseStatus")) {
            String v = enumOf("licenseStatus", body.get("licenseStatus"), ConsultantQueryService.LICENSE);
            if (!v.equals(c.getLicenseStatus())) {
                changed.add("licenseStatus " + c.getLicenseStatus() + " -> " + v);
                c.setLicenseStatus(v);
            }
        }
        if (body.containsKey("licenseValidUntil")) {
            LocalDate v = date("licenseValidUntil", body.get("licenseValidUntil"));
            if (!java.util.Objects.equals(v, c.getLicenseValidUntil())) {
                c.setLicenseValidUntil(v);
                changed.add("licenseValidUntil");
            }
        }
        if (body.containsKey("departmentGroupId")) {
            Object raw = body.get("departmentGroupId");
            Long v = raw == null ? null : department(orgId, idOf("departmentGroupId", raw));
            if (!java.util.Objects.equals(v, c.getDepartmentGroupId())) {
                c.setDepartmentGroupId(v);
                changed.add("departmentGroupId");
            }
        }
        return changed;
    }

    /** The side effects of an availability change (what the seeder does for a new row): since-date, bench date, marketing state. */
    static void applyAvailability(ConsultantProfile c, String next) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        c.setAvailabilityStatus(next);
        c.setAvailabilitySince(today);
        c.setBenchSince("AVAILABLE".equals(next) ? today : null);
        if (!"NOTICE".equals(next)) c.setAvailableFrom(null);
        c.setMarketingStatus(switch (next) {
            case "AVAILABLE" -> "ACTIVE";
            case "NOTICE" -> "PREPARING";
            case "ON_PROJECT" -> "PAUSED";
            default -> "NOT_MARKETED";
        });
    }

    // ---- marketer -------------------------------------------------------------------------------------------------------------

    @Transactional
    public ConsultantDTO.Detail assignMarketer(OrgMembership me, Long id, AssignRequest in) {
        gate(me, ConsultantAccess.ASSIGN);
        if (in == null || in.marketerMemberId() == null) throw OrgException.invalid("marketerMemberId", "choose a marketer");
        ConsultantProfile c = query.visible(me, id);
        requireActive(c);
        assignRow(me, c, in.marketerMemberId(), in.backupMemberId(), in.priority(), null);
        return query.detail(me, c.getId());
    }

    /** Creates or moves the one assignment row of the consultant; answers the previous marketer id (null when there was none). */
    private Long assignRow(OrgMembership me, ConsultantProfile c, Long marketerId, Long backupId, String priority, Set<Long> allowed) {
        Long orgId = me.orgId();
        Set<Long> reachable = allowed != null ? allowed : access.assignableSeats(me);
        validateMarketer(orgId, marketerId, reachable, "marketerMemberId");
        if (backupId != null) validateMarketer(orgId, backupId, reachable, "backupMemberId");
        if (priority != null && !PRIORITY.contains(priority.toUpperCase(Locale.ROOT))) throw OrgException.invalid("priority", "must be HIGH, MEDIUM or LOW");
        Instant now = now();
        MarketerAssignment a = query.assignmentRow(orgId, c.getId());
        Long previous = a == null ? null : a.getMarketerMemberId();
        if (a == null) {
            a = new MarketerAssignment();
            a.setOrgId(orgId);
            a.setConsultantId(c.getId());
            a.setPriority(priority == null ? "MEDIUM" : priority.toUpperCase(Locale.ROOT));
            a.setAssignedAt(now);
        } else {
            if (!marketerId.equals(a.getMarketerMemberId())) a.setAssignedAt(now);
            if (priority != null) a.setPriority(priority.toUpperCase(Locale.ROOT));
        }
        a.setMarketerMemberId(marketerId);
        if (backupId != null) a.setBackupMemberId(backupId);
        a.setStatus("ACTIVE");
        a.setAssignedByMemberId(me.memberId());
        a.setLastActivityAt(now);
        a.setUpdatedAt(now);
        assignmentRepo.saveAndFlush(a);
        if (previous == null || !previous.equals(marketerId)) audit.record(me, A_ASSIGN, TARGET, null, String.valueOf(c.getId()), previous == null ? "assigned a marketer" : "changed the marketer");
        return previous;
    }

    private void validateMarketer(Long orgId, Long memberId, Set<Long> reachable, String field) {
        if (memberId <= 0) throw OrgException.invalid(field, "must be an id");
        long ok = em.createQuery(
            "select count(k) from MarketerCapacity k, OrgMember m where k.orgId = :o and k.memberId = :m and k.status = 'ACTIVE' and m.orgId = k.orgId and m.id = k.memberId and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE",
            Long.class
        ).setParameter("o", orgId).setParameter("m", memberId).getSingleResult();
        if (ok == 0) throw OrgException.coded(422, CODE_MARKETER_INVALID, "Choose an active marketer of this organization", Map.of("field", field));
        if (reachable != null && !reachable.contains(memberId)) throw OrgException.coded(422, CODE_MARKETER_INVALID, "That marketer is outside your team", Map.of("field", field));
    }

    // ---- deactivate / reactivate ----------------------------------------------------------------------------------------------

    @Transactional
    public ConsultantDTO.Detail deactivate(OrgMembership me, Long id, String reason) {
        gate(me, ConsultantAccess.EDIT);
        ConsultantProfile c = query.visible(me, id);
        String why = reason(reason, true);
        if ("ACTIVE".equals(c.getStatus())) {
            flip(me, c, "INACTIVE", A_DEACTIVATE, why);
        }
        return query.detail(me, c.getId());
    }

    @Transactional
    public ConsultantDTO.Detail reactivate(OrgMembership me, Long id, String reason) {
        gate(me, ConsultantAccess.EDIT);
        ConsultantProfile c = query.visible(me, id);
        String why = reason(reason, false);
        if ("INACTIVE".equals(c.getStatus())) {
            flip(me, c, "ACTIVE", A_REACTIVATE, why);
        }
        return query.detail(me, c.getId());
    }

    private void flip(OrgMembership me, ConsultantProfile c, String status, String action, String why) {
        c.setStatus(status);
        c.setUpdatedAt(now());
        profiles.saveAndFlush(c);
        audit.record(me, action, TARGET, null, String.valueOf(c.getId()), why == null ? status.toLowerCase(Locale.ROOT) : why);
    }

    // ---- create an application ------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ConsultantDTO.JobOption> jobOptions(OrgMembership me, Long id) {
        gate(me, ConsultantAccess.OPPORTUNITIES);
        ConsultantProfile c = query.visible(me, id);
        List<Object[]> rows = em.createQuery(
            "select r.id, r.title, k.name, (select max(m.score) from RequirementMatch m where m.orgId = r.orgId and m.requirementId = r.id and m.consultantId = :c) " +
                "from ClientRequirement r, ClientAccount k where r.orgId = :o and r.status = 'OPEN' and k.orgId = r.orgId and k.id = r.clientId " +
                "and not exists (select 1 from TalentApplication a where a.orgId = r.orgId and a.requirementId = r.id and a.consultantId = :c) order by r.postedAt desc", Object[].class
        ).setParameter("o", me.orgId()).setParameter("c", c.getId()).setMaxResults(100).getResultList();
        List<ConsultantDTO.JobOption> out = new ArrayList<>();
        for (Object[] r : rows) out.add(new ConsultantDTO.JobOption((Long) r[0], (String) r[1], (String) r[2], (Integer) r[3]));
        return out;
    }

    @Transactional
    public ConsultantDTO.ApplicationCreated createApplication(OrgMembership me, Long id, Long requirementId) {
        gate(me, ConsultantAccess.OPPORTUNITIES);
        if (requirementId == null || requirementId <= 0) throw OrgException.invalid("requirementId", "choose a job");
        ConsultantProfile c = query.visible(me, id);
        requireActive(c);
        Long orgId = me.orgId();
        List<Object[]> jobs = em.createQuery("select r.id, r.status, r.clientId from ClientRequirement r where r.orgId = :o and r.id = :r", Object[].class)
            .setParameter("o", orgId).setParameter("r", requirementId).getResultList();
        if (jobs.isEmpty()) throw new OrgNotFoundException();
        if (!"OPEN".equals(jobs.get(0)[1])) throw OrgException.coded(422, CODE_JOB_NOT_OPEN, "That job is not open", Map.of());
        long exists = em.createQuery("select count(a) from TalentApplication a where a.orgId = :o and a.requirementId = :r and a.consultantId = :c", Long.class)
            .setParameter("o", orgId).setParameter("r", requirementId).setParameter("c", c.getId()).getSingleResult();
        if (exists > 0) throw OrgException.coded(409, CODE_APPLICATION_EXISTS, "This consultant already has an application for that job", Map.of());
        Instant now = now();
        MarketerAssignment as = query.assignmentRow(orgId, c.getId());
        TalentApplication a = new TalentApplication();
        a.setOrgId(orgId);
        a.setCode(nextCode(orgId, now));
        a.setRequirementId(requirementId);
        a.setConsultantId(c.getId());
        a.setClientId((Long) jobs.get(0)[2]);
        a.setMarketerMemberId(as == null ? me.memberId() : as.getMarketerMemberId());
        a.setStage("ASSIGNED");
        a.setAppliedOn(LocalDate.now(ZoneOffset.UTC));
        a.setSourceLabel("Consultants board");
        a.setStageChangedAt(now);
        a.setCreatedAt(now);
        a.setUpdatedAt(now);
        a.setCreatedByMemberId(me.memberId());
        a.setUpdatedByMemberId(me.memberId());
        a = applicationRepo.saveAndFlush(a);
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(orgId);
        e.setApplicationId(a.getId());
        e.setEventType("CREATED");
        e.setToStage("ASSIGNED");
        e.setActorMemberId(me.memberId());
        e.setOccurredAt(now);
        eventRepo.save(e);
        List<RequirementMatch> ms = em.createQuery("select m from RequirementMatch m where m.orgId = :o and m.requirementId = :r and m.consultantId = :c", RequirementMatch.class)
            .setParameter("o", orgId).setParameter("r", requirementId).setParameter("c", c.getId()).getResultList();
        for (RequirementMatch m : ms) {
            m.setStatus("ASSIGNED");
            m.setAssignedByMemberId(me.memberId());
            m.setAssignedAt(now);
        }
        audit.record(me, A_APPLICATION, "APPLICATION", null, String.valueOf(a.getId()), "created " + a.getCode() + " for consultant " + c.getId());
        return new ConsultantDTO.ApplicationCreated(a.getId(), a.getCode(), a.getStage());
    }

    private String nextCode(Long orgId, Instant now) {
        int year = now.atZone(ZoneOffset.UTC).getYear();
        String prefix = "APP-" + year + "-";
        List<String> codes = em.createQuery("select a.code from TalentApplication a where a.orgId = :o and a.code like :p order by a.code desc", String.class)
            .setParameter("o", orgId).setParameter("p", prefix + "%").setMaxResults(1).getResultList();
        int n = 0;
        if (!codes.isEmpty()) {
            try {
                n = Integer.parseInt(codes.get(0).substring(prefix.length()));
            } catch (NumberFormatException ignored) {
                n = 0;
            }
        }
        return prefix + String.format("%03d", n + 1);
    }

    // ---- bulk -----------------------------------------------------------------------------------------------------------------

    /** Sets the availability of many consultants. Each row is one UPDATE audit row; one CONSULTANT_BULK row summarises a call that changed something. */
    @Transactional
    public ConsultantDTO.BulkResult bulkAvailability(OrgMembership me, List<Long> ids, String availability) {
        gate(me, ConsultantAccess.EDIT);
        List<Long> list = ids(ids);
        String next = enumOf("availability", availability, ConsultantQueryService.AVAILABILITY);
        List<ConsultantDTO.RowResult> results = new ArrayList<>();
        int ok = 0;
        for (Long id : list) {
            ConsultantProfile c = peek(me, id);
            if (c == null) {
                results.add(new ConsultantDTO.RowResult(id, false, "NOT_FOUND", null));
                continue;
            }
            if (!"ACTIVE".equals(c.getStatus())) {
                results.add(new ConsultantDTO.RowResult(id, false, "INACTIVE", null));
                continue;
            }
            if (next.equals(c.getAvailabilityStatus())) {
                results.add(new ConsultantDTO.RowResult(id, false, "UNCHANGED", null));
                continue;
            }
            Map<String, Object> previous = new LinkedHashMap<>();
            previous.put("availability", c.getAvailabilityStatus());
            applyAvailability(c, next);
            c.setUpdatedAt(now());
            profiles.saveAndFlush(c);
            audit.record(me, A_UPDATE, TARGET, null, String.valueOf(c.getId()), "changed availabilityStatus " + previous.get("availability") + " -> " + next);
            results.add(new ConsultantDTO.RowResult(id, true, null, previous));
            ok++;
        }
        return summary(me, "AVAILABILITY", list.size(), ok, results);
    }

    @Transactional
    public ConsultantDTO.BulkResult bulkMarketer(OrgMembership me, List<Long> ids, Long marketerMemberId) {
        gate(me, ConsultantAccess.ASSIGN);
        List<Long> list = ids(ids);
        if (marketerMemberId == null) throw OrgException.invalid("marketerMemberId", "choose a marketer");
        Set<Long> reachable = access.assignableSeats(me);
        validateMarketer(me.orgId(), marketerMemberId, reachable, "marketerMemberId");
        List<ConsultantDTO.RowResult> results = new ArrayList<>();
        int ok = 0;
        for (Long id : list) {
            ConsultantProfile c = peek(me, id);
            if (c == null) {
                results.add(new ConsultantDTO.RowResult(id, false, "NOT_FOUND", null));
                continue;
            }
            if (!"ACTIVE".equals(c.getStatus())) {
                results.add(new ConsultantDTO.RowResult(id, false, "INACTIVE", null));
                continue;
            }
            MarketerAssignment cur = query.assignmentRow(me.orgId(), c.getId());
            if (cur != null && marketerMemberId.equals(cur.getMarketerMemberId())) {
                results.add(new ConsultantDTO.RowResult(id, false, "UNCHANGED", null));
                continue;
            }
            Long previous = assignRow(me, c, marketerMemberId, null, null, reachable);
            Map<String, Object> prev = new LinkedHashMap<>();
            prev.put("marketerMemberId", previous);
            results.add(new ConsultantDTO.RowResult(id, true, null, prev));
            ok++;
        }
        return summary(me, "MARKETER", list.size(), ok, results);
    }

    @Transactional
    public ConsultantDTO.BulkResult bulkStatus(OrgMembership me, List<Long> ids, String action, String reason) {
        gate(me, ConsultantAccess.EDIT);
        List<Long> list = ids(ids);
        String act = action == null ? "" : action.trim().toUpperCase(Locale.ROOT);
        if (!act.equals("DEACTIVATE") && !act.equals("REACTIVATE")) throw OrgException.invalid("action", "must be DEACTIVATE or REACTIVATE");
        String why = reason(reason, act.equals("DEACTIVATE"));
        String from = act.equals("DEACTIVATE") ? "ACTIVE" : "INACTIVE";
        String to = act.equals("DEACTIVATE") ? "INACTIVE" : "ACTIVE";
        List<ConsultantDTO.RowResult> results = new ArrayList<>();
        int ok = 0;
        for (Long id : list) {
            ConsultantProfile c = peek(me, id);
            if (c == null) {
                results.add(new ConsultantDTO.RowResult(id, false, "NOT_FOUND", null));
                continue;
            }
            if (!from.equals(c.getStatus())) {
                results.add(new ConsultantDTO.RowResult(id, false, "UNCHANGED", null));
                continue;
            }
            flip(me, c, to, act.equals("DEACTIVATE") ? A_DEACTIVATE : A_REACTIVATE, why);
            Map<String, Object> previous = new LinkedHashMap<>();
            previous.put("status", from);
            results.add(new ConsultantDTO.RowResult(id, true, null, previous));
            ok++;
        }
        return summary(me, act, list.size(), ok, results);
    }

    private ConsultantDTO.BulkResult summary(OrgMembership me, String action, int requested, int ok, List<ConsultantDTO.RowResult> results) {
        if (ok > 0) audit.record(me, A_BULK, TARGET, null, null, action.toLowerCase(Locale.ROOT) + ": " + ok + " of " + requested + " changed");
        return new ConsultantDTO.BulkResult(action, requested, ok, results);
    }

    /** The consultant when the caller reaches it, else null (a bulk call skips such a row instead of failing). */
    private ConsultantProfile peek(OrgMembership me, Long id) {
        try {
            return query.visible(me, id);
        } catch (OrgNotFoundException e) {
            return null;
        }
    }

    private static List<Long> ids(List<Long> raw) {
        if (raw == null || raw.isEmpty()) throw OrgException.invalid("ids", "choose at least one consultant");
        Set<Long> set = new LinkedHashSet<>();
        for (Long id : raw) {
            if (id == null || id <= 0) throw OrgException.invalid("ids", "must be ids");
            set.add(id);
        }
        if (set.size() > MAX_BULK) throw OrgException.invalid("ids", "at most " + MAX_BULK + " at a time");
        return new ArrayList<>(set);
    }

    // ---- validation -----------------------------------------------------------------------------------------------------------

    private void requireActive(ConsultantProfile c) {
        if (!"ACTIVE".equals(c.getStatus())) throw OrgException.coded(409, CODE_CONSULTANT_INACTIVE, "Reactivate this consultant first", Map.of());
    }

    private void checkVersion(ConsultantProfile c, String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) throw OrgException.coded(428, CODE_PRECONDITION_REQUIRED, "Send the version you loaded in an If-Match header", Map.of());
        String current = ConsultantQueryService.versionOf(c);
        if (!current.equals(ifMatch.trim())) throw OrgException.coded(412, CODE_PRECONDITION_FAILED, "The consultant changed since you loaded them", Map.of("currentVersion", current));
    }

    private Long department(Long orgId, Long groupId) {
        long ok = em.createQuery("select count(g) from OrgGroup g where g.orgId = :o and g.id = :g and g.kind = com.dossier.api.domain.enumeration.OrgGroupKind.DEPARTMENT", Long.class)
            .setParameter("o", orgId).setParameter("g", groupId).getSingleResult();
        if (ok == 0) throw new OrgNotFoundException(); // a group of another organization is the generic 404
        return groupId;
    }

    private static String text(String field, Object raw, int min, int max, boolean required) {
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
        if (t.length() < min) throw OrgException.invalid(field, "at least " + min + " characters");
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String email(String raw) {
        if (raw == null || raw.isBlank()) throw OrgException.invalid("email", "is required");
        String e = raw.strip().toLowerCase(Locale.ROOT);
        if (e.length() > 254 || !EMAIL.matcher(e).matches()) throw OrgException.invalid("email", "must be an email address");
        return e;
    }

    private static String workMode(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String v = raw.strip().toUpperCase(Locale.ROOT);
        if (!ConsultantQueryService.WORK_MODE.contains(v)) throw OrgException.invalid("workMode", "must be REMOTE, HYBRID or ONSITE");
        return v;
    }

    private static Integer years(Integer v) {
        if (v == null) return null;
        if (v < 0 || v > 60) throw OrgException.invalid("yearsExperience", "must be between 0 and 60");
        return v;
    }

    private static Integer parseInt(String field, Object raw) {
        try {
            return Integer.valueOf(String.valueOf(raw).trim());
        } catch (NumberFormatException e) {
            throw OrgException.invalid(field, "must be a number");
        }
    }

    private static Long idOf(String field, Object raw) {
        if (raw instanceof Number n && n.longValue() > 0) return n.longValue();
        throw OrgException.invalid(field, "must be an id or null");
    }

    private static String enumOf(String field, Object raw, Set<String> allowed) {
        if (!(raw instanceof String s) || !allowed.contains(s.strip().toUpperCase(Locale.ROOT))) throw OrgException.invalid(field, "unknown value");
        return s.strip().toUpperCase(Locale.ROOT);
    }

    private static LocalDate date(String field, Object raw) {
        if (raw == null) return null;
        try {
            return LocalDate.parse(String.valueOf(raw));
        } catch (java.time.format.DateTimeParseException e) {
            throw OrgException.invalid(field, "must be a date (yyyy-mm-dd) or null");
        }
    }

    private static List<String> skills(List<String> raw) {
        if (raw == null) return List.of();
        Set<String> seen = new LinkedHashSet<>();
        for (String s : raw) {
            String t = text("skills", s, 1, 60, false);
            if (t != null) seen.add(t);
        }
        if (seen.size() > MAX_SKILLS) throw OrgException.invalid("skills", "at most " + MAX_SKILLS + " skills");
        return new ArrayList<>(seen);
    }

    private static String reason(String raw, boolean required) {
        if (raw == null || raw.isBlank()) {
            if (required) throw OrgException.invalid("reason", "tell your team why (10 to 500 characters)");
            return null;
        }
        String t = raw.strip();
        if (t.length() < (required ? 10 : 1) || t.length() > 500) throw OrgException.invalid("reason", "must be 10 to 500 characters");
        SensitiveContent.check("reason", "reason", t);
        return t;
    }

}
