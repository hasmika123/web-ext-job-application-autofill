package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationNoteRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.dto.TrackerDTOs.ApplicationDetailDTO;
import com.dossier.api.service.dto.TrackerDTOs.ApplicationListPage;
import com.dossier.api.service.dto.TrackerDTOs.InterviewDTO;
import com.dossier.api.service.dto.TrackerDTOs.NoteDTO;
import com.dossier.api.service.dto.TrackerDTOs.Suggestion;
import com.dossier.api.service.inbox.MailClassifier;
import com.dossier.api.service.inbox.MailMatcher;
import com.dossier.api.service.mapper.ApplicationMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The applications list v2 (APP-E2E U6.2): filters, sorting, paging and the per-tab counts, in the shared
 * list shape {@code {items, total, page, size, summary}}, plus the detail view and the derived fields the
 * v2 endpoints add to {@link ApplicationDTO} (ghosted, next step, note / interview / mail counts).
 *
 * <p>Everything is scoped to the signed-in user by id. Page size, the size cap, the search length, the
 * ghosted window and the number of timeline events are settings ({@code tracker.*}), never literals.
 */
@Service
@Transactional(readOnly = true)
public class ApplicationListService {

    /** The fields {@code sort} may name (SORT_INVALID otherwise). */
    public static final List<String> SORTABLE = List.of("updatedAt", "createdAt", "appliedAt", "lastEventAt", "nextActionAt", "company", "roleTitle", "status");

    /** The summary's keys, in display order. */
    static final List<String> SUMMARY_KEYS = List.of("ALL", "DRAFT", "SAVED", "APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN", "GHOSTED", "ARCHIVED");

    private static final Set<ApplicationStatus> GHOSTABLE = EnumSet.of(ApplicationStatus.APPLIED, ApplicationStatus.IN_REVIEW);

    /** What the request asked for; every field optional. {@code status} is a comma-separated list of statuses. */
    public record Query(String status, String q, String company, String archived, Boolean ghosted, String sort, Integer page, Integer size) {}

    private final ApplicationRepository applications;
    private final ApplicationMapper mapper;
    private final EntityManager em;
    private final TrackerUsers trackerUsers;
    private final ResumeBuilderSettings settings;
    private final ApplicationEventService eventService;
    private final ApplicationNoteRepository noteRepository;
    private final InterviewRepository interviewRepository;
    private final InboxMessageRepository inboxMessages;
    private final Clock clock;

    @Autowired
    public ApplicationListService(
        ApplicationRepository applications,
        ApplicationMapper mapper,
        EntityManager em,
        TrackerUsers trackerUsers,
        ResumeBuilderSettings settings,
        ApplicationEventService eventService,
        ApplicationNoteRepository noteRepository,
        InterviewRepository interviewRepository,
        InboxMessageRepository inboxMessages
    ) {
        this(applications, mapper, em, trackerUsers, settings, eventService, noteRepository, interviewRepository, inboxMessages, Clock.systemUTC());
    }

    ApplicationListService(
        ApplicationRepository applications,
        ApplicationMapper mapper,
        EntityManager em,
        TrackerUsers trackerUsers,
        ResumeBuilderSettings settings,
        ApplicationEventService eventService,
        ApplicationNoteRepository noteRepository,
        InterviewRepository interviewRepository,
        InboxMessageRepository inboxMessages,
        Clock clock
    ) {
        this.applications = applications;
        this.mapper = mapper;
        this.em = em;
        this.trackerUsers = trackerUsers;
        this.settings = settings;
        this.eventService = eventService;
        this.noteRepository = noteRepository;
        this.interviewRepository = interviewRepository;
        this.inboxMessages = inboxMessages;
        this.clock = clock;
    }

    // ---- the list -----------------------------------------------------------

    public ApplicationListPage list(Query query) {
        User user = trackerUsers.current();
        Filter f = parse(query);
        Instant now = Instant.now(clock);
        Instant ghostCutoff = now.minus(Duration.ofDays(settings.getInt(ResumeBuilderSettingKeys.TRACKER_GHOSTED_AFTER_DAYS)));

        Specification<Application> spec = (root, cq, cb) -> {
            if (cq != null && cq.getResultType() != Long.class && cq.getResultType() != long.class) {
                root.fetch("resume", JoinType.LEFT);
                root.fetch("user", JoinType.LEFT);
            }
            List<Predicate> p = base(cb, root, user.getId(), f.q(), f.company());
            p.add(archivedPredicate(cb, root, f.archived()));
            if (!f.statuses().isEmpty()) p.add(root.get("status").in(f.statuses()));
            if (f.ghosted()) p.addAll(ghostedPredicates(cb, root, ghostCutoff));
            return cb.and(p.toArray(new Predicate[0]));
        };
        Page<Application> page = applications.findAll(spec, PageRequest.of(f.page(), f.size(), f.sort()));

        List<ApplicationDTO> items = enrich(page.getContent(), user, now);
        return new ApplicationListPage(items, page.getTotalElements(), f.page(), f.size(), summary(user.getId(), f.q(), f.company(), ghostCutoff));
    }

    /** Tab counts: respect the search text and company, never the status or archived filters of the page itself. */
    private Map<String, Long> summary(Long userId, String q, String company, Instant ghostCutoff) {
        Map<String, Long> out = new LinkedHashMap<>();
        for (String k : SUMMARY_KEYS) out.put(k, 0L);

        CriteriaBuilder cb = em.getCriteriaBuilder();
        CriteriaQuery<Tuple> cq = cb.createTupleQuery();
        Root<Application> r = cq.from(Application.class);
        List<Predicate> p = base(cb, r, userId, q, company);
        p.add(archivedPredicate(cb, r, "false"));
        cq.multiselect(r.get("status"), cb.count(r)).where(p.toArray(new Predicate[0])).groupBy(r.get("status"));
        long all = 0;
        for (Tuple t : em.createQuery(cq).getResultList()) {
            ApplicationStatus s = t.get(0, ApplicationStatus.class);
            long n = t.get(1, Long.class);
            out.put(s.name(), n);
            all += n;
        }
        out.put("ALL", all);
        out.put("GHOSTED", count(userId, q, company, "false", true, ghostCutoff));
        out.put("ARCHIVED", count(userId, q, company, "true", false, ghostCutoff));
        return out;
    }

    private long count(Long userId, String q, String company, String archived, boolean ghosted, Instant ghostCutoff) {
        CriteriaBuilder cb = em.getCriteriaBuilder();
        CriteriaQuery<Long> cq = cb.createQuery(Long.class);
        Root<Application> r = cq.from(Application.class);
        List<Predicate> p = base(cb, r, userId, q, company);
        p.add(archivedPredicate(cb, r, archived));
        if (ghosted) p.addAll(ghostedPredicates(cb, r, ghostCutoff));
        cq.select(cb.count(r)).where(p.toArray(new Predicate[0]));
        return em.createQuery(cq).getSingleResult();
    }

    private static List<Predicate> base(CriteriaBuilder cb, Root<Application> r, Long userId, String q, String company) {
        List<Predicate> p = new ArrayList<>();
        p.add(cb.equal(r.get("user").get("id"), userId));
        if (q != null && !q.isEmpty()) {
            String like = "%" + escapeLike(q.toLowerCase(Locale.ROOT)) + "%";
            p.add(
                cb.or(
                    cb.like(cb.lower(r.get("company")), like, '\\'),
                    cb.like(cb.lower(r.get("roleTitle")), like, '\\'),
                    cb.like(cb.lower(r.get("location")), like, '\\')
                )
            );
        }
        if (company != null && !company.isEmpty()) p.add(cb.equal(cb.lower(r.get("company")), company.toLowerCase(Locale.ROOT)));
        return p;
    }

    private static Predicate archivedPredicate(CriteriaBuilder cb, Root<Application> r, String mode) {
        return switch (mode) {
            case "true" -> cb.isTrue(r.get("archived"));
            case "all" -> cb.conjunction();
            default -> cb.or(cb.isNull(r.get("archived")), cb.isFalse(r.get("archived")));
        };
    }

    private static List<Predicate> ghostedPredicates(CriteriaBuilder cb, Root<Application> r, Instant cutoff) {
        List<Predicate> p = new ArrayList<>();
        p.add(r.get("status").in(GHOSTABLE));
        p.add(cb.or(cb.isNull(r.get("archived")), cb.isFalse(r.get("archived"))));
        p.add(cb.lessThan(cb.<Instant>coalesce(r.get("lastEventAt"), r.get("updatedAt")), cutoff));
        return p;
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    // ---- request parsing ----------------------------------------------------

    private record Filter(Set<ApplicationStatus> statuses, String q, String company, String archived, boolean ghosted, Sort sort, int page, int size) {}

    private Filter parse(Query query) {
        Set<ApplicationStatus> statuses = EnumSet.noneOf(ApplicationStatus.class);
        if (query.status() != null && !query.status().isBlank()) {
            for (String token : query.status().split(",")) {
                String t = token.trim().toUpperCase(Locale.ROOT);
                if (t.isEmpty()) continue;
                try {
                    statuses.add(ApplicationStatus.valueOf(t));
                } catch (IllegalArgumentException e) {
                    throw TrackerException.invalid("status", "'" + token.trim() + "' is not a status");
                }
            }
        }
        int maxChars = settings.getInt(ResumeBuilderSettingKeys.TRACKER_SEARCH_MAX_CHARS);
        String q = clean(query.q(), maxChars);
        String company = clean(query.company(), 200);

        String archived = query.archived() == null || query.archived().isBlank() ? "false" : query.archived().trim().toLowerCase(Locale.ROOT);
        if (!Set.of("true", "false", "all").contains(archived)) {
            throw TrackerException.invalid("archived", "use true, false or all");
        }

        int max = settings.getInt(ResumeBuilderSettingKeys.TRACKER_LIST_MAX_SIZE);
        int defaultSize = Math.min(settings.getInt(ResumeBuilderSettingKeys.TRACKER_LIST_DEFAULT_SIZE), max);
        int size = query.size() == null || query.size() < 1 ? defaultSize : Math.min(query.size(), max);
        int page = query.page() == null || query.page() < 0 ? 0 : query.page();

        return new Filter(statuses, q, company, archived, Boolean.TRUE.equals(query.ghosted()), sort(query.sort()), page, size);
    }

    private static String clean(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        if (t.length() > max) t = t.substring(0, max);
        return t.isEmpty() ? null : t;
    }

    /** {@code field[,asc|desc]}, field whitelisted ({@link #SORTABLE}); the id breaks ties so paging is stable. */
    static Sort sort(String raw) {
        String field = "updatedAt";
        Sort.Direction dir = Sort.Direction.DESC;
        if (raw != null && !raw.isBlank()) {
            String[] parts = raw.split(",");
            field = parts[0].trim();
            if (!SORTABLE.contains(field) || parts.length > 2) throw TrackerException.sortInvalid(raw, SORTABLE);
            if (parts.length == 2) {
                String d = parts[1].trim().toLowerCase(Locale.ROOT);
                if (d.equals("asc")) dir = Sort.Direction.ASC;
                else if (d.equals("desc")) dir = Sort.Direction.DESC;
                else throw TrackerException.sortInvalid(raw, SORTABLE);
            } else {
                dir = Sort.Direction.ASC; // "company" alone reads naturally as A to Z
            }
        }
        return Sort.by(new Sort.Order(dir, field), new Sort.Order(Sort.Direction.DESC, "id"));
    }

    // ---- derived fields -----------------------------------------------------

    /** The DTOs of {@code apps} with ghosted, next step and the note / interview / mail counts filled in. */
    public List<ApplicationDTO> enrich(List<Application> apps, User user, Instant now) {
        if (apps.isEmpty()) return List.of();
        List<Long> ids = apps.stream().map(Application::getId).toList();
        Map<Long, Integer> notes = counts(noteRepository.countByApplicationIds(ids));
        Map<Long, Integer> interviews = counts(interviewRepository.countByApplicationIds(ids));
        Map<Long, Integer> mail = counts(inboxMessages.countByApplicationIds(user.getId(), ids));
        Map<Long, Object[]> next = new HashMap<>();
        for (Object[] row : interviewRepository.upcomingFor(ids, now)) next.putIfAbsent((Long) row[0], row); // soonest first
        int ghostDays = settings.getInt(ResumeBuilderSettingKeys.TRACKER_GHOSTED_AFTER_DAYS);

        List<ApplicationDTO> out = new ArrayList<>(apps.size());
        for (Application a : apps) {
            ApplicationDTO dto = mapper.toDto(a);
            Object[] n = next.get(a.getId());
            dto.setGhosted(ApplicationDerivations.isGhosted(a, now, ghostDays));
            dto.setNextStep(
                ApplicationDerivations.nextStep(a.getStatus(), a.getNextAction(), a.getNextActionAt(), n == null ? null : (Instant) n[1], n == null ? null : (String) n[2])
            );
            dto.setNotesCount(notes.getOrDefault(a.getId(), 0));
            dto.setInterviewsCount(interviews.getOrDefault(a.getId(), 0));
            dto.setMailCount(mail.getOrDefault(a.getId(), 0));
            out.add(dto);
        }
        return out;
    }

    public ApplicationDTO enrichOne(Application app, User user) {
        return enrich(List.of(app), user, Instant.now(clock)).get(0);
    }

    private static Map<Long, Integer> counts(List<Object[]> rows) {
        Map<Long, Integer> m = new HashMap<>();
        for (Object[] r : rows) m.put((Long) r[0], ((Number) r[1]).intValue());
        return m;
    }

    // ---- the detail ---------------------------------------------------------

    /** One application with its timeline, notes, interviews, mail count and inbox suggestions; 404 if not the user's. */
    public ApplicationDetailDTO detail(Long id) {
        User user = trackerUsers.current();
        Application app = trackerUsers.application(user, id);
        ApplicationDetailDTO out = new ApplicationDetailDTO();
        BeanUtils.copyProperties(enrichOne(app, user), out);
        out.setEvents(eventService.recent(id));
        out.setNotes(noteRepository.findByApplicationIdOrderByPinnedDescCreatedAtDescIdDesc(id).stream().map(NoteDTO::of).toList());
        out.setInterviews(
            interviewRepository
                .findByApplicationIdAndUserIdOrderByStartsAtAscIdAsc(id, user.getId())
                .stream()
                .map(i -> InterviewDTO.of(i, app.getCompany(), app.getRoleTitle()))
                .toList()
        );
        out.setSuggestions(suggestions(user, app));
        return out;
    }

    /**
     * Inbox readings that would have moved an <em>archived</em> application (mail never moves an archived
     * entry, so the Emails tab offers them as "would have moved to ...").
     */
    private List<Suggestion> suggestions(User user, Application app) {
        if (!Boolean.TRUE.equals(app.getArchived())) return List.of();
        List<Suggestion> out = new ArrayList<>();
        for (InboxMessage m : inboxMessages.findByUserIdAndApplicationIdOrderBySentAtDesc(user.getId(), app.getId())) {
            if (!InboxMessage.IN.equals(m.getDirection()) || m.getCategory() == null) continue;
            MailClassifier.Category c;
            try {
                c = MailClassifier.Category.valueOf(m.getCategory());
            } catch (IllegalArgumentException e) {
                continue;
            }
            ApplicationStatus to = MailMatcher.next(app.getStatus(), c);
            if (to != null) out.add(new Suggestion(m.getId(), to, m.getSubject(), m.getSentAt()));
            if (out.size() >= 5) break;
        }
        return out;
    }

}
