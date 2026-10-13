package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.service.dto.ent.JobDTO;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of the Jobs page: the filtered, sorted, paged list; the KPI tiles with their facets; and one job's drawer. Every query names
 * the organization of the caller's seat (the path id was already matched to it by the interceptor), and a job id of another tenant is the
 * generic 404. Filtering is done in SQL; the aggregates a row needs (submissions, best match) are grouped per organization and the page
 * is cut in memory, which is fine at the size of one organization's job board (tens to a few hundred rows).
 */
@Service
public class JobBoardService {

    public static final List<String> STATUSES = List.of("OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED");
    public static final List<String> WORK_MODES = List.of("REMOTE", "HYBRID", "ON_SITE");
    public static final List<String> EMPLOYMENT = List.of("CONTRACT", "FTE", "C2C");
    public static final List<String> EXPERIENCE = List.of("JUNIOR", "MID", "SENIOR", "LEAD");
    public static final List<String> SORTS = List.of("posted", "title", "client", "status", "submissions", "match");
    public static final int MAX_SIZE = 100;
    public static final int DEFAULT_SIZE = 10;
    static final int ACTIVITY_LIMIT = 30;
    static final int SUBMISSION_LIMIT = 50;

    /** The list call's filters; every list field is "any of". */
    public record ListQuery(
        String q,
        List<String> status,
        List<Long> clientId,
        List<String> location,
        List<String> workMode,
        List<String> skill,
        List<String> employment,
        List<String> experience,
        Integer minMatch,
        String sort,
        String dir,
        Integer page,
        Integer size
    ) {}

    private final ClientRequirementRepository jobs;
    private final ClientAccountRepository clients;
    private final ClientContactRepository contacts;
    private final RequirementSkillRepository skills;
    private final RequirementMatchRepository matches;
    private final OrgAuditEventRepository audit;
    private final UserRepository users;
    private final JobAccess access;
    private final Clock clock = Clock.systemUTC();

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public JobBoardService(
        ClientRequirementRepository jobs,
        ClientAccountRepository clients,
        ClientContactRepository contacts,
        RequirementSkillRepository skills,
        RequirementMatchRepository matches,
        OrgAuditEventRepository audit,
        UserRepository users,
        JobAccess access
    ) {
        this.jobs = jobs;
        this.clients = clients;
        this.contacts = contacts;
        this.skills = skills;
        this.matches = matches;
        this.audit = audit;
        this.users = users;
        this.access = access;
    }

    // ---- list ---------------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public JobDTO.Page list(OrgMembership me, ListQuery q) {
        access.requireView(me);
        Long orgId = me.orgId();
        int size = q.size() == null ? DEFAULT_SIZE : q.size();
        int page = q.page() == null ? 0 : q.page();
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "between 1 and " + MAX_SIZE);
        if (page < 0) throw OrgException.invalid("page", "0 or more");
        String sort = q.sort() == null || q.sort().isBlank() ? "posted" : q.sort();
        if (!SORTS.contains(sort)) throw OrgException.coded(400, "SORT_INVALID", "Sort by one of " + SORTS, Map.of());
        if (q.dir() != null && !q.dir().isBlank() && !"asc".equalsIgnoreCase(q.dir()) && !"desc".equalsIgnoreCase(q.dir())) throw OrgException.invalid("dir", "asc or desc");
        boolean desc = q.dir() == null || q.dir().isBlank() ? sortDefaultDesc(sort) : "desc".equalsIgnoreCase(q.dir());

        List<ClientRequirement> found = filtered(orgId, q);
        Map<Long, String> clientNames = clientNames(orgId);
        Map<Long, Long> submissions = submissionCounts(orgId);
        Map<Long, List<RequirementMatch>> liveMatches = liveMatchesByJob(orgId);

        Comparator<ClientRequirement> cmp = switch (sort) {
            case "title" -> Comparator.comparing((ClientRequirement r) -> r.getTitle().toLowerCase(Locale.ROOT));
            case "client" -> Comparator.comparing((ClientRequirement r) -> clientNames.getOrDefault(r.getClientId(), "").toLowerCase(Locale.ROOT));
            case "status" -> Comparator.comparing((ClientRequirement r) -> STATUSES.indexOf(r.getStatus()));
            case "submissions" -> Comparator.comparing((ClientRequirement r) -> submissions.getOrDefault(r.getId(), 0L));
            case "match" -> Comparator.comparing((ClientRequirement r) -> bestOf(liveMatches.get(r.getId())));
            default -> Comparator.comparing(ClientRequirement::getPostedAt);
        };
        if (desc) cmp = cmp.reversed();
        cmp = cmp.thenComparing(ClientRequirement::getId, Comparator.reverseOrder());
        found.sort(cmp);

        long total = found.size();
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min((long) from + size, total);
        List<ClientRequirement> slice = found.subList(from, to);

        Map<Long, List<String>> skillsOf = skillsOf(orgId, slice.stream().map(ClientRequirement::getId).toList());
        Set<Long> consultantIds = new HashSet<>();
        for (ClientRequirement r : slice) for (RequirementMatch m : top(liveMatches.get(r.getId()), 3)) consultantIds.add(m.getConsultantId());
        Map<Long, ConsultantProfile> people = consultants(orgId, consultantIds);

        List<JobDTO.Row> rows = new ArrayList<>();
        for (ClientRequirement r : slice) {
            List<RequirementMatch> live = liveMatches.getOrDefault(r.getId(), List.of());
            List<JobDTO.MatchChip> chips = new ArrayList<>();
            for (RequirementMatch m : top(live, 3)) {
                ConsultantProfile c = people.get(m.getConsultantId());
                chips.add(new JobDTO.MatchChip(m.getConsultantId(), c == null ? "Consultant" : c.getDisplayName(), m.getScore()));
            }
            rows.add(
                new JobDTO.Row(
                    r.getId(), r.getTitle(), new JobDTO.ClientRef(r.getClientId(), clientNames.getOrDefault(r.getClientId(), "")), r.getLocation(), r.getWorkMode(),
                    r.getEmploymentLabel(), r.getExperienceLevel(), r.getStatus(), r.getPostedAt(), skillsOf.getOrDefault(r.getId(), List.of()),
                    submissions.getOrDefault(r.getId(), 0L).intValue(), new JobDTO.MatchSummary(live.size(), live.isEmpty() ? null : live.get(0).getScore(), chips),
                    r.getPositions(), r.getFilled()
                )
            );
        }
        return new JobDTO.Page(rows, page, size, total, to < total);
    }

    private static boolean sortDefaultDesc(String sort) {
        return !(sort.equals("title") || sort.equals("client") || sort.equals("status"));
    }

    private static int bestOf(List<RequirementMatch> live) {
        return live == null || live.isEmpty() ? -1 : live.get(0).getScore();
    }

    private static List<RequirementMatch> top(List<RequirementMatch> live, int n) {
        return live == null ? List.of() : live.subList(0, Math.min(n, live.size()));
    }

    @SuppressWarnings("unchecked")
    private List<ClientRequirement> filtered(Long orgId, ListQuery q) {
        StringBuilder jpql = new StringBuilder("select r from ClientRequirement r where r.orgId = :orgId");
        Map<String, Object> params = new HashMap<>();
        params.put("orgId", orgId);
        String text = q.q() == null ? "" : q.q().trim();
        if (!text.isEmpty()) {
            if (text.length() < 2 || text.length() > 80) throw OrgException.invalid("q", "2 to 80 characters");
            jpql.append(" and (lower(r.title) like :q escape '!' or lower(coalesce(r.location, '')) like :q escape '!'")
                .append(" or exists (select 1 from RequirementSkill s where s.orgId = r.orgId and s.requirementId = r.id and lower(s.skill) like :q escape '!')")
                .append(" or exists (select 1 from ClientAccount c where c.orgId = r.orgId and c.id = r.clientId and lower(c.name) like :q escape '!'))");
            params.put("q", "%" + escapeLike(text.toLowerCase(Locale.ROOT)) + "%");
        }
        addIn(jpql, params, "r.status", "status", checked("status", q.status(), STATUSES));
        addIn(jpql, params, "r.clientId", "clientId", q.clientId());
        addIn(jpql, params, "r.location", "location", q.location());
        addIn(jpql, params, "r.workMode", "workMode", checked("workMode", q.workMode(), WORK_MODES));
        addIn(jpql, params, "r.employmentLabel", "employment", checked("employment", q.employment(), EMPLOYMENT));
        addIn(jpql, params, "r.experienceLevel", "experience", checked("experience", q.experience(), EXPERIENCE));
        if (q.skill() != null && !q.skill().isEmpty()) {
            jpql.append(" and exists (select 1 from RequirementSkill s2 where s2.orgId = r.orgId and s2.requirementId = r.id and lower(s2.skill) in :skills)");
            params.put("skills", q.skill().stream().map(s -> s.trim().toLowerCase(Locale.ROOT)).toList());
        }
        if (q.minMatch() != null) {
            if (q.minMatch() < 0 || q.minMatch() > 100) throw OrgException.invalid("minMatch", "0 to 100");
            jpql.append(" and exists (select 1 from RequirementMatch m where m.orgId = r.orgId and m.requirementId = r.id and m.status <> 'DISMISSED' and m.score >= :minMatch)");
            params.put("minMatch", q.minMatch());
        }
        jakarta.persistence.Query query = em.createQuery(jpql.toString());
        params.forEach(query::setParameter);
        return new ArrayList<>(query.getResultList());
    }

    private static void addIn(StringBuilder jpql, Map<String, Object> params, String field, String name, Collection<?> values) {
        if (values == null || values.isEmpty()) return;
        jpql.append(" and ").append(field).append(" in :").append(name);
        params.put(name, values);
    }

    private static List<String> checked(String field, List<String> values, List<String> allowed) {
        if (values == null) return null;
        List<String> out = new ArrayList<>();
        for (String v : values) {
            if (v == null || v.isBlank()) continue;
            String u = v.trim().toUpperCase(Locale.ROOT);
            if (!allowed.contains(u)) throw OrgException.invalid(field, "one of " + allowed);
            out.add(u);
        }
        return out;
    }

    private static String escapeLike(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    // ---- summary ------------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public JobDTO.Summary summary(OrgMembership me) {
        access.requireView(me);
        Long orgId = me.orgId();
        Instant now = Instant.now(clock);
        List<ClientRequirement> all = jobs.findByOrgId(orgId);
        List<RequirementMatch> allMatches = matches.findByOrgId(orgId);
        JobKpis.Tiles t = JobKpis.compute(all, allMatches, now);

        Map<Long, String> clientNames = clientNames(orgId);
        Map<String, Integer> status = new LinkedHashMap<>();
        STATUSES.forEach(s -> status.put(s, 0));
        Map<Long, Integer> byClient = new HashMap<>();
        Map<String, Integer> byLocation = new TreeMap<>();
        Map<String, Integer> byMode = new LinkedHashMap<>();
        Map<String, Integer> byEmployment = new LinkedHashMap<>();
        Map<String, Integer> byExperience = new LinkedHashMap<>();
        for (ClientRequirement r : all) {
            status.merge(r.getStatus(), 1, Integer::sum);
            byClient.merge(r.getClientId(), 1, Integer::sum);
            if (r.getLocation() != null && !r.getLocation().isBlank()) byLocation.merge(r.getLocation(), 1, Integer::sum);
            if (r.getWorkMode() != null) byMode.merge(r.getWorkMode(), 1, Integer::sum);
            if (r.getEmploymentLabel() != null) byEmployment.merge(r.getEmploymentLabel(), 1, Integer::sum);
            if (r.getExperienceLevel() != null) byExperience.merge(r.getExperienceLevel(), 1, Integer::sum);
        }
        Map<String, Integer> bySkill = new HashMap<>();
        Map<String, String> skillLabel = new HashMap<>();
        for (RequirementSkill s : skills.findByOrgId(orgId)) {
            String k = s.getSkill().toLowerCase(Locale.ROOT);
            skillLabel.putIfAbsent(k, s.getSkill());
            bySkill.merge(k, 1, Integer::sum);
        }
        List<JobDTO.Facet> skillFacets = bySkill.entrySet().stream()
            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
            .limit(40)
            .map(e -> new JobDTO.Facet(skillLabel.get(e.getKey()), skillLabel.get(e.getKey()), e.getValue()))
            .toList();
        List<JobDTO.Facet> clientFacets = byClient.entrySet().stream()
            .map(e -> new JobDTO.Facet(String.valueOf(e.getKey()), clientNames.getOrDefault(e.getKey(), ""), e.getValue()))
            .sorted(Comparator.comparing(f -> f.label().toLowerCase(Locale.ROOT)))
            .toList();
        JobDTO.Facets facets = new JobDTO.Facets(
            status.entrySet().stream().map(e -> new JobDTO.Facet(e.getKey(), e.getKey(), e.getValue())).toList(),
            clientFacets,
            byLocation.entrySet().stream().map(e -> new JobDTO.Facet(e.getKey(), e.getKey(), e.getValue())).toList(),
            facetsOf(byMode, WORK_MODES), facetsOf(byEmployment, EMPLOYMENT), facetsOf(byExperience, EXPERIENCE), skillFacets
        );
        List<JobDTO.ClientOption> options = new ArrayList<>();
        if (access.access(me).canCreate()) {
            Map<Long, List<JobDTO.Contact>> contactsOf = new HashMap<>();
            for (ClientContact c : contacts.findByOrgId(orgId)) {
                if (!"ACTIVE".equals(c.getStatus())) continue;
                contactsOf.computeIfAbsent(c.getClientId(), k -> new ArrayList<>()).add(new JobDTO.Contact(c.getId(), c.getName(), c.getTitle(), c.getWorkEmail()));
            }
            for (ClientAccount c : clients.findByOrgIdOrderByNameAsc(orgId)) {
                if ("ARCHIVED".equals(c.getStatus())) continue;
                options.add(new JobDTO.ClientOption(c.getId(), c.getName(), contactsOf.getOrDefault(c.getId(), List.of())));
            }
        }
        return new JobDTO.Summary(t.open(), t.fresh(), t.assigned(), t.high(), now, facets, options, access.access(me));
    }

    private static List<JobDTO.Facet> facetsOf(Map<String, Integer> counts, List<String> order) {
        List<JobDTO.Facet> out = new ArrayList<>();
        for (String k : order) if (counts.containsKey(k)) out.add(new JobDTO.Facet(k, k, counts.get(k)));
        return out;
    }

    // ---- detail -------------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public JobDTO.Detail detail(OrgMembership me, Long jobId) {
        access.requireView(me);
        ClientRequirement r = jobs.findByOrgIdAndId(me.orgId(), jobId).orElseThrow(OrgNotFoundException::new);
        return detailOf(me, r);
    }

    JobDTO.Detail detailOf(OrgMembership me, ClientRequirement r) {
        Long orgId = me.orgId();
        Optional<ClientAccount> client = clients.findByOrgIdAndId(orgId, r.getClientId());
        JobDTO.Contact contact = null;
        if (r.getContactId() != null) {
            contact = contacts.findByOrgIdAndId(orgId, r.getContactId()).map(c -> new JobDTO.Contact(c.getId(), c.getName(), c.getTitle(), c.getWorkEmail())).orElse(null);
        }
        List<RequirementMatch> live = new ArrayList<>(matches.findByOrgIdAndRequirementIdOrderByScoreDesc(orgId, r.getId()));
        List<TalentApplication> apps = applicationsOf(orgId, r.getId());
        Set<Long> consultantIds = new HashSet<>();
        live.forEach(m -> consultantIds.add(m.getConsultantId()));
        apps.forEach(a -> consultantIds.add(a.getConsultantId()));
        Map<Long, ConsultantProfile> people = consultants(orgId, consultantIds);
        Map<Long, String> codeByConsultant = new HashMap<>();
        apps.forEach(a -> codeByConsultant.put(a.getConsultantId(), a.getCode()));

        List<JobDTO.TopMatch> top = new ArrayList<>();
        for (RequirementMatch m : live) {
            ConsultantProfile c = people.get(m.getConsultantId());
            top.add(
                new JobDTO.TopMatch(
                    m.getId(), m.getConsultantId(), c == null ? "Consultant" : c.getDisplayName(), c == null ? null : c.getJobTitle(),
                    c == null ? null : c.getAvailabilityStatus(), c == null ? null : c.getLocationLabel(), m.getScore(), m.getReason(), m.getStatus(),
                    codeByConsultant.get(m.getConsultantId())
                )
            );
        }
        List<JobDTO.Submission> subs = apps.stream().limit(SUBMISSION_LIMIT).map(a -> {
            ConsultantProfile c = people.get(a.getConsultantId());
            return new JobDTO.Submission(a.getId(), a.getCode(), a.getConsultantId(), c == null ? "Consultant" : c.getDisplayName(), a.getStage(), a.getClosedReason(), a.getAppliedOn());
        }).toList();
        List<String> skillList = skillsOf(orgId, List.of(r.getId())).getOrDefault(r.getId(), List.of());
        JobDTO.Rate rate = r.getRateMinMinor() == null && r.getRateMaxMinor() == null
            ? null
            : new JobDTO.Rate(r.getRateMinMinor() == null ? null : r.getRateMinMinor() / 100, r.getRateMaxMinor() == null ? null : r.getRateMaxMinor() / 100, r.getRateUnit(), r.getCurrency());
        return new JobDTO.Detail(
            r.getId(), r.getTitle(), new JobDTO.ClientRef(r.getClientId(), client.map(ClientAccount::getName).orElse("")), client.map(ClientAccount::getIndustry).orElse(null),
            contact, r.getDescriptionText(), r.getLocation(), r.getWorkMode(), r.getEmploymentLabel(), r.getDurationLabel(), r.getExperienceLevel(), rate, r.getPositions(),
            r.getFilled(), r.getStatus(), r.getPostedAt(), r.getClosedAt(), skillList, top, subs, apps.size(), activityOf(orgId, r, apps, people), versionOf(r), access.access(me)
        );
    }

    /** The ETag the PATCH expects as If-Match: the job's last-change instant. */
    public static String versionOf(ClientRequirement r) {
        return String.valueOf(r.getUpdatedAt() == null ? 0L : r.getUpdatedAt().toEpochMilli());
    }

    @SuppressWarnings("unchecked")
    private List<TalentApplication> applicationsOf(Long orgId, Long jobId) {
        return em.createQuery("select a from TalentApplication a where a.orgId = :o and a.requirementId = :j order by a.createdAt desc, a.id desc")
            .setParameter("o", orgId).setParameter("j", jobId).getResultList();
    }

    @SuppressWarnings("unchecked")
    private List<JobDTO.ActivityItem> activityOf(Long orgId, ClientRequirement r, List<TalentApplication> apps, Map<Long, ConsultantProfile> people) {
        List<JobDTO.ActivityItem> items = new ArrayList<>();
        Map<Long, TalentApplication> appById = new HashMap<>();
        apps.forEach(a -> appById.put(a.getId(), a));
        Set<Long> actorIds = new HashSet<>();
        List<TalentApplicationEvent> events = List.of();
        if (!appById.isEmpty()) {
            events = em.createQuery("select e from TalentApplicationEvent e where e.orgId = :o and e.applicationId in :ids order by e.occurredAt desc")
                .setParameter("o", orgId).setParameter("ids", appById.keySet()).setMaxResults(ACTIVITY_LIMIT).getResultList();
            events.forEach(e -> {
                if (e.getActorMemberId() != null) actorIds.add(e.getActorMemberId());
            });
        }
        Map<Long, String> actors = memberNames(orgId, actorIds);
        for (TalentApplicationEvent e : events) {
            TalentApplication a = appById.get(e.getApplicationId());
            ConsultantProfile c = a == null ? null : people.get(a.getConsultantId());
            String who = c == null ? "A consultant" : c.getDisplayName();
            String code = a == null ? "" : " (" + a.getCode() + ")";
            String text = switch (e.getEventType()) {
                case "CREATED" -> who + " was assigned" + code;
                case "STAGE_CHANGE" -> who + " moved from " + label(e.getFromStage()) + " to " + label(e.getToStage()) + code;
                case "NOTE" -> "Note added for " + who + code;
                default -> who + ": " + e.getEventType().toLowerCase(Locale.ROOT) + code;
            };
            items.add(new JobDTO.ActivityItem(e.getOccurredAt(), "application", text, e.getActorMemberId() == null ? null : actors.get(e.getActorMemberId())));
        }
        List<OrgAuditEvent> rows = audit
            .findByOrgIdAndTargetTypeAndTargetId(orgId, "JOB", String.valueOf(r.getId()), PageRequest.of(0, ACTIVITY_LIMIT, org.springframework.data.domain.Sort.by("createdAt").descending()))
            .getContent();
        Set<String> logins = new HashSet<>();
        rows.forEach(a -> logins.add(a.getActorLogin()));
        Map<String, String> loginNames = new HashMap<>();
        if (!logins.isEmpty()) for (User u : users.findAllByLoginIn(logins)) loginNames.put(u.getLogin(), fullName(u));
        for (OrgAuditEvent a : rows) {
            items.add(new JobDTO.ActivityItem(a.getCreatedAt(), "job", auditText(a), loginNames.get(a.getActorLogin())));
        }
        items.sort(Comparator.comparing(JobDTO.ActivityItem::at).reversed());
        return items.size() > ACTIVITY_LIMIT ? new ArrayList<>(items.subList(0, ACTIVITY_LIMIT)) : items;
    }

    private static String auditText(OrgAuditEvent a) {
        String d = a.getDetails() == null ? "" : a.getDetails();
        return switch (a.getAction()) {
            case "JOB_CREATE" -> "Job created";
            case "JOB_STATUS" -> d.isBlank() ? "Status changed" : "Status changed: " + d;
            case "JOB_UPDATE" -> d.isBlank() ? "Details edited" : "Edited " + d;
            case "JOB_ASSIGN" -> d.isBlank() ? "Consultant assigned" : "Assigned " + d;
            case "JOB_MATCH_DISMISS" -> d.isBlank() ? "Match dismissed" : "Dismissed match " + d;
            case "JOB_MATCH_RESTORE" -> d.isBlank() ? "Match restored" : "Restored match " + d;
            default -> a.getAction().toLowerCase(Locale.ROOT).replace('_', ' ');
        };
    }

    static String label(String stage) {
        return stage == null ? "none" : stage.toLowerCase(Locale.ROOT).replace('_', ' ');
    }

    private static String fullName(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last = u.getLastName() == null ? "" : u.getLastName().trim();
        String full = (first + " " + last).trim();
        return full.isEmpty() ? null : full;
    }

    // ---- helpers shared with the write side ---------------------------------------------------------------------------------------

    Map<Long, String> clientNames(Long orgId) {
        Map<Long, String> out = new HashMap<>();
        for (ClientAccount c : clients.findByOrgId(orgId)) out.put(c.getId(), c.getName());
        return out;
    }

    @SuppressWarnings("unchecked")
    Map<Long, Long> submissionCounts(Long orgId) {
        Map<Long, Long> out = new HashMap<>();
        List<Object[]> rows = em.createQuery("select a.requirementId, count(a) from TalentApplication a where a.orgId = :o group by a.requirementId").setParameter("o", orgId).getResultList();
        for (Object[] row : rows) out.put((Long) row[0], (Long) row[1]);
        return out;
    }

    /** Live (not dismissed) matches per job, best score first. */
    Map<Long, List<RequirementMatch>> liveMatchesByJob(Long orgId) {
        Map<Long, List<RequirementMatch>> out = new HashMap<>();
        for (RequirementMatch m : matches.findByOrgId(orgId)) {
            if ("DISMISSED".equals(m.getStatus())) continue;
            out.computeIfAbsent(m.getRequirementId(), k -> new ArrayList<>()).add(m);
        }
        out.values().forEach(l -> l.sort(Comparator.comparing(RequirementMatch::getScore).reversed().thenComparing(RequirementMatch::getId)));
        return out;
    }

    Map<Long, List<String>> skillsOf(Long orgId, Collection<Long> jobIds) {
        Map<Long, List<String>> out = new HashMap<>();
        if (jobIds.isEmpty()) return out;
        List<RequirementSkill> rows = new ArrayList<>(skills.findByOrgIdAndRequirementIdIn(orgId, jobIds));
        rows.sort(Comparator.comparing(RequirementSkill::getSortOrder).thenComparing(RequirementSkill::getId));
        for (RequirementSkill s : rows) out.computeIfAbsent(s.getRequirementId(), k -> new ArrayList<>()).add(s.getSkill());
        return out;
    }

    @SuppressWarnings("unchecked")
    Map<Long, ConsultantProfile> consultants(Long orgId, Collection<Long> ids) {
        Map<Long, ConsultantProfile> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        List<ConsultantProfile> rows = em.createQuery("select c from ConsultantProfile c where c.orgId = :o and c.id in :ids").setParameter("o", orgId).setParameter("ids", ids).getResultList();
        for (ConsultantProfile c : rows) out.put(c.getId(), c);
        return out;
    }

    @SuppressWarnings("unchecked")
    Map<Long, String> memberNames(Long orgId, Collection<Long> memberIds) {
        Map<Long, String> out = new HashMap<>();
        if (memberIds.isEmpty()) return out;
        List<Object[]> rows = em.createQuery("select m.id, u.firstName, u.lastName from OrgMember m, User u where m.orgId = :o and m.id in :ids and u.id = m.userId")
            .setParameter("o", orgId).setParameter("ids", memberIds).getResultList();
        for (Object[] row : rows) {
            String full = ((row[1] == null ? "" : row[1]) + " " + (row[2] == null ? "" : row[2])).trim();
            out.put((Long) row[0], full.isEmpty() ? null : full);
        }
        return out;
    }
}
