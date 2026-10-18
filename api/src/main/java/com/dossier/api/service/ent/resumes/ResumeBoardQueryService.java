package com.dossier.api.service.ent.resumes;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.repository.ent.resumes.ResumeBoardSearchRepository;
import com.dossier.api.repository.ent.resumes.ResumeBoardSearchRepository.Filter;
import com.dossier.api.repository.ent.resumes.ResumeBoardSearchRepository.Hit;
import com.dossier.api.repository.ent.resumes.ResumeBoardSearchRepository.Scope;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.service.dto.ent.ResumeBoardDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The reads of the Resumes board: the paged table, the four KPI tiles (value, honest delta, weekly series), the filter options, the detail with the
 * structured preview, and the exports. Everything is bounded by the caller's reach ({@link ResumeAccess}); a resume outside it is the generic 404.
 */
@Service
public class ResumeBoardQueryService {

    public static final List<String> VISIBILITIES = List.of("INTERNAL", "PUBLIC", "PRIVATE");
    public static final List<String> APPROVALS = List.of("APPROVED", "PENDING", "REJECTED");
    public static final int MAX_PAGE_SIZE = 100;
    public static final int DEFAULT_PAGE_SIZE = 25;
    /** "Recent Updates" tab: resumes whose last change is this recent. */
    public static final int RECENT_DAYS = 30; // config-literal-ok: window of the Recent Updates tab
    public static final int SPARK_WEEKS = 8; // config-literal-ok: points of a tile sparkline

    private final ResumeBoardSearchRepository search;
    private final ResumeAccess access;
    private final OrgResumeExperienceRepository experience;
    private final ConsultantSkillRepository skills;
    private final OrgMemberDirectoryRepository directory;
    private final UserRepository users;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public ResumeBoardQueryService(
        ResumeBoardSearchRepository search,
        ResumeAccess access,
        OrgResumeExperienceRepository experience,
        ConsultantSkillRepository skills,
        OrgMemberDirectoryRepository directory,
        UserRepository users,
        OrgAuditService audit
    ) {
        this(search, access, experience, skills, directory, users, audit, Clock.systemUTC());
    }

    ResumeBoardQueryService(
        ResumeBoardSearchRepository search,
        ResumeAccess access,
        OrgResumeExperienceRepository experience,
        ConsultantSkillRepository skills,
        OrgMemberDirectoryRepository directory,
        UserRepository users,
        OrgAuditService audit,
        Clock clock
    ) {
        this.search = search;
        this.access = access;
        this.experience = experience;
        this.skills = skills;
        this.directory = directory;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    /** The parsed list query (already validated by the resource). */
    public record ListQuery(String tab, String q, Long departmentId, String visibility, String status, Boolean primary, Long ownerId, Long consultantId, Integer updatedDays, String sort, Integer page, Integer size) {}

    // ---- list ------------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ResumeBoardDTO.Page list(OrgMembership me, ListQuery q) {
        Scope scope = access.viewScope(me);
        String tab = q.tab() == null || q.tab().isBlank() ? "all" : q.tab().toLowerCase(Locale.ROOT);
        if (!Set.of("all", "pending", "recent").contains(tab)) throw OrgException.invalid("tab", "must be all, pending or recent");
        String vis = upperOrNull(q.visibility());
        if (vis != null && !VISIBILITIES.contains(vis)) throw OrgException.invalid("visibility", "must be INTERNAL, PUBLIC or PRIVATE");
        String status = upperOrNull(q.status());
        if (status != null && !APPROVALS.contains(status)) throw OrgException.invalid("status", "must be APPROVED, PENDING or REJECTED");
        String search = q.q() == null ? null : q.q().trim();
        if (search != null && !search.isEmpty() && (search.length() < 2 || search.length() > 80)) throw OrgException.invalid("q", "use 2 to 80 characters");
        int page = q.page() == null ? 0 : q.page();
        int size = q.size() == null ? DEFAULT_PAGE_SIZE : q.size();
        if (page < 0 || page > 100_000) throw OrgException.invalid("page", "out of range");
        if (size < 1 || size > MAX_PAGE_SIZE) throw OrgException.invalid("size", "1 to " + MAX_PAGE_SIZE);

        String sortKey = "modified";
        boolean asc = false;
        if (q.sort() != null && !q.sort().isBlank()) {
            String[] parts = q.sort().split(",");
            sortKey = parts[0].trim();
            asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1].trim());
            if (!ResumeBoardSearchRepository.SORTS.containsKey(sortKey) || (parts.length > 1 && !parts[1].trim().equalsIgnoreCase("asc") && !parts[1].trim().equalsIgnoreCase("desc"))) {
                throw OrgException.coded(400, "SORT_INVALID", "Sort by one of " + String.join(", ", new java.util.TreeSet<>(ResumeBoardSearchRepository.SORTS.keySet())), Map.of());
            }
        }
        Instant now = Instant.now(clock);
        Instant since = null;
        if (tab.equals("recent")) since = now.minus(Duration.ofDays(RECENT_DAYS));
        if (q.updatedDays() != null) {
            if (q.updatedDays() < 1 || q.updatedDays() > 365) throw OrgException.invalid("updated", "1 to 365 days");
            Instant s = now.minus(Duration.ofDays(q.updatedDays()));
            since = since == null || s.isAfter(since) ? s : since;
        }
        Filter f = new Filter(tab.equals("pending"), search, q.departmentId(), vis, status, q.primary(), q.ownerId(), q.consultantId(), since);
        ResumeBoardSearchRepository.PageResult res = this.search.search(me.orgId(), f, scope, sortKey, asc, page, size);
        List<ResumeBoardDTO.Row> items = rows(me.orgId(), res.hits());
        boolean hasNext = (long) (page + 1) * size < res.total();
        return new ResumeBoardDTO.Page(items, page, size, res.total(), hasNext);
    }

    // ---- tiles -----------------------------------------------------------------------------------------------------------------

    /**
     * The four tiles. Total: resumes now vs resumes created before 30 days ago. Primary: the flag is not versioned, so the previous figure is
     * null (no delta drawn). Needs Approval: pending now vs pending 30 days ago (created before then and still pending, or decided after
     * then). Updated This Week: resumes whose last change was in the last 7 days vs the 7 days before. Series: eight weekly points from the
     * same rows.
     */
    @Transactional(readOnly = true)
    public ResumeBoardDTO.Counts counts(OrgMembership me) {
        Scope scope = access.viewScope(me);
        List<Object[]> facts = search.tileFacts(me.orgId(), scope);
        Instant now = Instant.now(clock);
        Instant t30 = now.minus(Duration.ofDays(30));
        Instant w7 = now.minus(Duration.ofDays(7));
        Instant w14 = now.minus(Duration.ofDays(14));

        long total = facts.size();
        long primary = 0;
        long pending = 0;
        long updatedNow = 0;
        long updatedBefore = 0;
        long createdBefore30 = 0;
        long pendingBefore30 = 0;
        for (Object[] f : facts) {
            Instant created = (Instant) f[0];
            Instant updated = (Instant) f[1];
            if (Boolean.TRUE.equals(f[4])) primary++;
            if ("PENDING".equals(f[2])) pending++;
            if (!updated.isBefore(w7)) updatedNow++;
            else if (!updated.isBefore(w14)) updatedBefore++;
            if (created.isBefore(t30)) {
                createdBefore30++;
                if (wasPending(f, t30)) pendingBefore30++;
            }
        }
        List<Long> totalSeries = new ArrayList<>();
        List<Long> primarySeries = new ArrayList<>();
        List<Long> pendingSeries = new ArrayList<>();
        List<Long> updatedSeries = new ArrayList<>();
        for (int i = SPARK_WEEKS - 1; i >= 0; i--) {
            Instant end = now.minus(Duration.ofDays(7L * i));
            Instant start = end.minus(Duration.ofDays(7));
            long t = 0;
            long p = 0;
            long pe = 0;
            long u = 0;
            for (Object[] f : facts) {
                Instant created = (Instant) f[0];
                Instant updated = (Instant) f[1];
                if (!created.isAfter(end)) {
                    t++;
                    if (Boolean.TRUE.equals(f[4])) p++;
                    if (wasPending(f, end)) pe++;
                }
                if (updated.isAfter(start) && !updated.isAfter(end)) u++;
            }
            totalSeries.add(t);
            primarySeries.add(p);
            pendingSeries.add(pe);
            updatedSeries.add(u);
        }
        return new ResumeBoardDTO.Counts(
            now,
            scopeName(me),
            ResumeBoardDTO.Tile.of(total, createdBefore30, totalSeries),
            ResumeBoardDTO.Tile.of(primary, null, primarySeries),
            ResumeBoardDTO.Tile.of(pending, pendingBefore30, pendingSeries),
            ResumeBoardDTO.Tile.of(updatedNow, updatedBefore, updatedSeries)
        );
    }

    /** Pending at {@code at}: it existed then and either still is pending or was decided after that moment. */
    private static boolean wasPending(Object[] fact, Instant at) {
        Instant created = (Instant) fact[0];
        if (created.isAfter(at)) return false;
        if ("PENDING".equals(fact[2])) return true;
        Instant decided = (Instant) fact[3];
        return decided != null && decided.isAfter(at);
    }

    private String scopeName(OrgMembership me) {
        return me.scopeFor(ResumeAccess.VIEW).map(Enum::name).orElse("NONE");
    }

    // ---- filter options and pickers ---------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ResumeBoardDTO.FilterOptions filters(OrgMembership me) {
        Scope scope = access.viewScope(me);
        List<ResumeBoardDTO.Option> departments = new ArrayList<>();
        for (Object[] d : search.departmentsInScope(me.orgId(), scope)) departments.add(new ResumeBoardDTO.Option(String.valueOf(d[0]), String.valueOf(d[1])));
        List<Long> ownerIds = search.ownersInScope(me.orgId(), scope);
        Map<Long, String> names = names(me.orgId(), ownerIds);
        List<ResumeBoardDTO.Option> owners = new ArrayList<>();
        for (Long id : ownerIds) owners.add(new ResumeBoardDTO.Option(String.valueOf(id), names.getOrDefault(id, "Member " + id)));
        owners.sort(Comparator.comparing(o -> o.label().toLowerCase(Locale.ROOT)));
        return new ResumeBoardDTO.FilterOptions(departments, owners);
    }

    /** The consultants the caller may add a resume for (the Upload Resume form's picker). */
    @Transactional(readOnly = true)
    public List<ResumeBoardDTO.ConsultantOption> consultants(OrgMembership me, String q) {
        Scope scope = access.writeScope(me, ResumeAccess.EDIT);
        List<ResumeBoardDTO.ConsultantOption> out = new ArrayList<>();
        for (ConsultantProfile c : search.consultantsInScope(me.orgId(), scope, q, 50)) out.add(new ResumeBoardDTO.ConsultantOption(c.getId(), c.getDisplayName(), c.getEmail()));
        return out;
    }

    // ---- detail ----------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ResumeBoardDTO.Detail detail(OrgMembership me, Long resumeId) {
        Scope scope = access.viewScope(me);
        Hit hit = search.findOne(me.orgId(), resumeId, scope).orElseThrow(OrgNotFoundException::new);
        return detailOf(me, hit);
    }

    /** The detail of a resume the caller already reached (also used by the writes to answer with the fresh state). */
    public ResumeBoardDTO.Detail detailOf(OrgMembership me, Hit hit) {
        Long orgId = me.orgId();
        OrgResume r = hit.resume();
        ResumeBoardDTO.Row row = rows(orgId, List.of(hit)).get(0);
        List<String> skillNames = new ArrayList<>();
        List<ConsultantSkill> all = new ArrayList<>(skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(orgId, r.getConsultantId()));
        all.sort(Comparator.comparing((ConsultantSkill s) -> !s.isPrimarySkill()));
        for (ConsultantSkill s : all) skillNames.add(s.getSkill());
        List<ResumeBoardDTO.Experience> exp = new ArrayList<>();
        for (OrgResumeExperience e : experience.findByOrgIdAndResumeIdOrderBySortOrderAsc(orgId, r.getId())) {
            exp.add(new ResumeBoardDTO.Experience(e.getTitle(), e.getEmployer(), e.getStartYear(), e.getEndYear()));
        }
        ResumeBoardDTO.Preview preview = new ResumeBoardDTO.Preview(r.getHeadline(), r.getSummaryText(), skillNames, exp);
        return new ResumeBoardDTO.Detail(row, preview, actionsFor(me, hit));
    }

    private ResumeBoardDTO.Actions actionsFor(OrgMembership me, Hit hit) {
        Long orgId = me.orgId();
        boolean canEdit = false;
        boolean canDecide = false;
        try {
            if (access.holds(me, ResumeAccess.EDIT) && access.writable(me, ResumeAccess.EDIT)) {
                canEdit = search.findOne(orgId, hit.resume().getId(), access.scope(me, ResumeAccess.EDIT)).isPresent();
            }
            if (access.holds(me, ResumeAccess.APPROVE) && access.writable(me, ResumeAccess.APPROVE)) {
                canDecide = search.findOne(orgId, hit.resume().getId(), access.scope(me, ResumeAccess.APPROVE)).isPresent();
            }
        } catch (OrgNotFoundException ignored) {
            // holding no such key simply means no such action
        }
        boolean decidable = canDecide && !java.util.Objects.equals(hit.resume().getOwnerMemberId(), me.memberId());
        return new ResumeBoardDTO.Actions(canEdit, canEdit, decidable, true);
    }

    // ---- rows ------------------------------------------------------------------------------------------------------------------

    /** Who last changed each row ("Modified <time> by <name>"); absent in hand-wired unit tests. */
    @Autowired(required = false)
    private OrgResumeAuthors authors;

    List<ResumeBoardDTO.Row> rows(Long orgId, List<Hit> hits) {
        Map<Long, String> by = authors == null ? Map.of() : authors.modifiedBy(orgId, hits.stream().map(Hit::resume).toList());
        Set<Long> ownerIds = new HashSet<>();
        for (Hit h : hits) if (h.resume().getOwnerMemberId() != null) ownerIds.add(h.resume().getOwnerMemberId());
        Map<Long, String> names = names(orgId, ownerIds);
        List<ResumeBoardDTO.Row> out = new ArrayList<>();
        for (Hit h : hits) {
            OrgResume r = h.resume();
            ConsultantProfile c = h.consultant();
            ResumeBoardDTO.ConsultantRef cons = new ResumeBoardDTO.ConsultantRef(
                c.getId(), c.getDisplayName(), initials(c.getDisplayName()), c.getEmail(), c.getJobTitle(), c.getLocationLabel(), c.getWorkMode(), c.getAvailabilityStatus(), c.getStatus()
            );
            ResumeBoardDTO.PersonRef owner = r.getOwnerMemberId() == null ? null : new ResumeBoardDTO.PersonRef(r.getOwnerMemberId(), names.getOrDefault(r.getOwnerMemberId(), "Member " + r.getOwnerMemberId()));
            out.add(new ResumeBoardDTO.Row(
                r.getId(), cons, r.getName(), r.getFileName(), r.getTargetRole(), r.getVersionNo() == null ? 1 : r.getVersionNo(), r.isPrimaryForOrg(), r.getVisibility(),
                r.getApprovalStatus(), r.getCreatedAt(), r.getUpdatedAt(), owner, r.getFileSizeKb(), r.getResumeId(), by.get(r.getId())
            ));
        }
        return out;
    }

    private Map<Long, String> names(Long orgId, Collection<Long> memberIds) {
        Map<Long, String> out = new HashMap<>();
        if (memberIds.isEmpty()) return out;
        List<OrgMember> seats = directory.findByOrgIdAndIdIn(orgId, memberIds);
        Set<Long> userIds = new HashSet<>();
        for (OrgMember s : seats) if (s.getUserId() != null) userIds.add(s.getUserId());
        Map<Long, User> byId = new HashMap<>();
        if (!userIds.isEmpty()) for (User u : users.findAllById(userIds)) byId.put(u.getId(), u);
        for (OrgMember s : seats) out.put(s.getId(), nameOf(byId.get(s.getUserId()), s));
        return out;
    }

    static String nameOf(User u, OrgMember seat) {
        if (u != null) {
            String n = ((u.getFirstName() == null ? "" : u.getFirstName().strip()) + " " + (u.getLastName() == null ? "" : u.getLastName().strip())).strip();
            if (!n.isEmpty()) return n;
        }
        if (seat.getDisplayLabel() != null && !seat.getDisplayLabel().isBlank()) return seat.getDisplayLabel().strip();
        String email = u != null && u.getEmail() != null && !u.getEmail().isBlank() ? u.getEmail() : seat.getInviteEmail();
        if (email != null && !email.isBlank()) return email.contains("@") ? email.substring(0, email.indexOf('@')) : email;
        return "Member " + seat.getId();
    }

    static String initials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] w = name.trim().split("\\s+");
        String s = w.length == 1 ? w[0].substring(0, Math.min(2, w[0].length())) : "" + w[0].charAt(0) + w[w.length - 1].charAt(0);
        return s.toUpperCase(Locale.ROOT);
    }

    private static String upperOrNull(String s) {
        return s == null || s.isBlank() ? null : s.trim().toUpperCase(Locale.ROOT);
    }

    // ---- export ----------------------------------------------------------------------------------------------------------------

    /** An export of the structured resume: the content, its content type and a safe file name. One audit row per export. */
    public record Export(byte[] body, String contentType, String fileName) {}

    @Transactional
    public Export export(OrgMembership me, Long resumeId, String format) {
        Scope scope = access.viewScope(me);
        Hit hit = search.findOne(me.orgId(), resumeId, scope).orElseThrow(OrgNotFoundException::new);
        String fmt = format == null ? "txt" : format.toLowerCase(Locale.ROOT);
        if (!fmt.equals("txt") && !fmt.equals("html")) throw OrgException.invalid("format", "must be txt or html");
        ResumeBoardDTO.Detail d = detailOf(me, hit);
        String base = ResumeExportRenderer.baseName(d.row());
        audit.record(me.orgId(), me.login(), me.role(), "RESUME_EXPORT", OrgAuditService.TARGET_RESUME, null, String.valueOf(resumeId), "format=" + fmt + " resume=" + clip(d.row().name()), null, null, null, null);
        if (fmt.equals("html")) return new Export(ResumeExportRenderer.html(d).getBytes(java.nio.charset.StandardCharsets.UTF_8), "text/html;charset=UTF-8", base + ".html");
        return new Export(ResumeExportRenderer.text(d).getBytes(java.nio.charset.StandardCharsets.UTF_8), "text/plain;charset=UTF-8", base + ".txt");
    }

    static String clip(String s) {
        return s == null ? "" : s.length() > 120 ? s.substring(0, 120) : s;
    }
}
