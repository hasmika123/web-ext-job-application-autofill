package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.dto.AnalyticsDTOs.Analytics;
import com.dossier.api.service.dto.AnalyticsDTOs.AnalyticsBucket;
import com.dossier.api.service.dto.AnalyticsDTOs.AnalyticsCompany;
import com.dossier.api.service.dto.AnalyticsDTOs.AnalyticsStats;
import com.dossier.api.service.dto.AnalyticsDTOs.AnalyticsStatusCount;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The analytics page (APP-E2E U12.1) over {@code application_event}. The rule that keeps every number honest is
 * "first became X": an application counts once, at the first time it reached a stage, however many times it
 * moved afterwards (a status changed back and forth never double-counts, and an archived application is out).
 *
 * <ul>
 *   <li><b>applied</b>: first became APPLIED or anything after it (a job saved and then dragged straight to
 *       Interview was applied to);</li>
 *   <li><b>replies</b>: first moved to IN_REVIEW, INTERVIEW, OFFER or REJECTED;</li>
 *   <li><b>interviews</b>: first became INTERVIEW or OFFER; <b>offers</b>: first became OFFER;</li>
 *   <li><b>response rate</b>: of the applications first applied in the range, how many have had any reply since
 *       (a cohort, so a quiet last week does not drag it to zero).</li>
 * </ul>
 *
 * An application with no event for a stage it is in (history older than the event table) falls back to its own
 * dates. Days are the user's days: the caller passes an IANA zone.
 */
@Service
@Transactional(readOnly = true)
public class ProfileAnalyticsService {

    private static final Set<ApplicationStatus> APPLIED_OR_LATER = EnumSet.of(
        ApplicationStatus.APPLIED,
        ApplicationStatus.IN_REVIEW,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED
    );
    private static final Set<ApplicationStatus> REPLIED = EnumSet.of(
        ApplicationStatus.IN_REVIEW,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED
    );
    private static final Set<ApplicationStatus> INTERVIEWED = EnumSet.of(ApplicationStatus.INTERVIEW, ApplicationStatus.OFFER);
    private static final Set<ApplicationStatus> OFFERED = EnumSet.of(ApplicationStatus.OFFER);

    /** The order the status breakdown lists, earliest stage first. */
    private static final List<ApplicationStatus> STATUS_ORDER = List.of(
        ApplicationStatus.DRAFT,
        ApplicationStatus.SAVED,
        ApplicationStatus.APPLIED,
        ApplicationStatus.IN_REVIEW,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.REJECTED,
        ApplicationStatus.WITHDRAWN
    );

    /** The first moment each stage was reached by one application; null when it never was. */
    private record Reached(Application app, Instant applied, Instant replied, Instant interviewed, Instant offered) {}

    private final ApplicationRepository applications;
    private final ApplicationEventRepository events;
    private final ResumeBuilderSettings settings;
    private final TrackerUsers trackerUsers;
    private final Clock clock;

    @Autowired
    public ProfileAnalyticsService(
        ApplicationRepository applications,
        ApplicationEventRepository events,
        ResumeBuilderSettings settings,
        TrackerUsers trackerUsers
    ) {
        this(applications, events, settings, trackerUsers, Clock.systemUTC());
    }

    ProfileAnalyticsService(
        ApplicationRepository applications,
        ApplicationEventRepository events,
        ResumeBuilderSettings settings,
        TrackerUsers trackerUsers,
        Clock clock
    ) {
        this.applications = applications;
        this.events = events;
        this.settings = settings;
        this.trackerUsers = trackerUsers;
        this.clock = clock;
    }

    /**
     * @param range days to cover, ending today (default {@code analytics.defaultRangeDays}, clamped to
     *              {@code [7, analytics.maxRangeDays]})
     * @param tz an IANA zone naming the user's days (UTC when absent; 422 TRACKER_INVALID when unknown)
     */
    public Analytics analytics(Integer range, String tz) {
        Long userId = trackerUsers.current().getId();
        int max = settings.getInt(ResumeBuilderSettingKeys.ANALYTICS_MAX_RANGE_DAYS);
        int days = range == null ? settings.getInt(ResumeBuilderSettingKeys.ANALYTICS_DEFAULT_RANGE_DAYS) : range;
        days = Math.max(7, Math.min(days, max));
        ZoneId zone = zone(tz);
        Instant now = Instant.now(clock);
        LocalDate today = now.atZone(zone).toLocalDate();
        Instant from = today.minusDays(days - 1L).atStartOfDay(zone).toInstant();
        Instant prevFrom = today.minusDays(2L * days - 1L).atStartOfDay(zone).toInstant();

        List<Application> live = applications.findByUserId(userId).stream().filter(a -> !Boolean.TRUE.equals(a.getArchived())).toList();
        Map<Long, List<ApplicationEvent>> byApp = new HashMap<>();
        boolean inboxSeen = false;
        for (ApplicationEvent e : events.findAllByUser(userId)) {
            byApp.computeIfAbsent(e.getApplicationId(), k -> new ArrayList<>()).add(e);
        }
        List<Reached> reached = new ArrayList<>(live.size());
        for (Application a : live) {
            List<ApplicationEvent> evs = byApp.getOrDefault(a.getId(), List.of());
            for (ApplicationEvent e : evs) {
                if (ApplicationEvent.SRC_INBOX.equals(e.getSource()) && e.getToStatus() != null) inboxSeen = true;
            }
            reached.add(reach(a, evs));
        }

        boolean real = reached.stream().anyMatch(r -> r.applied() != null);

        int applied = 0, appliedPrev = 0, replies = 0, interviews = 0, offers = 0, cohortReplied = 0;
        for (Reached r : reached) {
            if (in(r.applied(), from, now)) {
                applied++;
                if (r.replied() != null) cohortReplied++;
            }
            if (in(r.applied(), prevFrom, from)) appliedPrev++;
            if (in(r.replied(), from, now)) replies++;
            if (in(r.interviewed(), from, now)) interviews++;
            if (in(r.offered(), from, now)) offers++;
        }
        Integer rate = applied == 0 ? null : (int) Math.round(100.0 * cohortReplied / applied);

        boolean monthly = days > settings.getInt(ResumeBuilderSettingKeys.ANALYTICS_MONTHLY_FROM_DAYS);
        List<AnalyticsBucket> overTime = buckets(reached, from, now, today, zone, monthly);

        Map<ApplicationStatus, Integer> status = new EnumMap<>(ApplicationStatus.class);
        for (Application a : live) {
            Instant touched = a.getLastEventAt() != null ? a.getLastEventAt() : a.getUpdatedAt() != null ? a.getUpdatedAt() : a.getCreatedAt();
            if (touched != null && !touched.isBefore(from) && a.getStatus() != null) status.merge(a.getStatus(), 1, Integer::sum);
        }
        List<AnalyticsStatusCount> byStatus = new ArrayList<>();
        for (ApplicationStatus s : STATUS_ORDER) {
            Integer n = status.get(s);
            if (n != null) byStatus.add(new AnalyticsStatusCount(s, ApplicationDerivations.statusLabel(s), n));
        }

        List<AnalyticsCompany> byCompany = inboxSeen ? responseByCompany(reached, from, now) : List.of();

        return new Analytics(days, monthly ? "month" : "week", real, new AnalyticsStats(applied, appliedPrev, replies, interviews, offers, rate), overTime, byStatus, inboxSeen, byCompany);
    }

    // ---- first became X -----------------------------------------------------

    static Reached reach(Application a, List<ApplicationEvent> evs) {
        Instant applied = first(evs, APPLIED_OR_LATER);
        Instant replied = first(evs, REPLIED);
        Instant interviewed = first(evs, INTERVIEWED);
        Instant offered = first(evs, OFFERED);
        // History older than the event table: the row's own dates stand in for the stage it is in now.
        ApplicationStatus now = a.getStatus();
        Instant own = a.getAppliedAt() != null ? a.getAppliedAt() : a.getUpdatedAt() != null ? a.getUpdatedAt() : a.getCreatedAt();
        if (applied == null && APPLIED_OR_LATER.contains(now)) applied = own;
        if (replied == null && REPLIED.contains(now)) replied = own;
        if (interviewed == null && INTERVIEWED.contains(now)) interviewed = own;
        if (offered == null && OFFERED.contains(now)) offered = own;
        return new Reached(a, applied, replied, interviewed, offered);
    }

    private static Instant first(List<ApplicationEvent> evs, Set<ApplicationStatus> stages) {
        Instant best = null;
        for (ApplicationEvent e : evs) {
            if (e.getToStatus() == null || !stages.contains(e.getToStatus())) continue;
            Instant at = e.getCreatedAt();
            if (at != null && (best == null || at.isBefore(best))) best = at;
        }
        return best;
    }

    private static boolean in(Instant at, Instant from, Instant to) {
        return at != null && !at.isBefore(from) && at.isBefore(to.plusMillis(1));
    }

    // ---- shaping ------------------------------------------------------------

    private static List<AnalyticsBucket> buckets(List<Reached> reached, Instant from, Instant now, LocalDate today, ZoneId zone, boolean monthly) {
        LocalDate firstDay = from.atZone(zone).toLocalDate();
        LocalDate start = monthly ? firstDay.withDayOfMonth(1) : firstDay.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Map<LocalDate, int[]> counts = new TreeMap<>();
        for (LocalDate d = start; !d.isAfter(today); d = monthly ? d.plusMonths(1) : d.plusWeeks(1)) counts.put(d, new int[3]);
        for (Reached r : reached) {
            add(counts, r.applied(), 0, from, now, zone, monthly);
            add(counts, r.interviewed(), 1, from, now, zone, monthly);
            add(counts, r.offered(), 2, from, now, zone, monthly);
        }
        List<AnalyticsBucket> out = new ArrayList<>(counts.size());
        counts.forEach((d, c) -> out.add(new AnalyticsBucket(d.toString(), c[0], c[1], c[2])));
        return out;
    }

    private static void add(Map<LocalDate, int[]> counts, Instant at, int slot, Instant from, Instant now, ZoneId zone, boolean monthly) {
        if (!in(at, from, now)) return;
        LocalDate day = at.atZone(zone).toLocalDate();
        LocalDate key = monthly ? day.withDayOfMonth(1) : day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        int[] c = counts.get(key);
        if (c != null) c[slot]++;
    }

    private List<AnalyticsCompany> responseByCompany(List<Reached> reached, Instant from, Instant now) {
        Map<String, int[]> perCompany = new LinkedHashMap<>();
        Map<String, String> display = new HashMap<>();
        for (Reached r : reached) {
            String company = r.app().getCompany();
            if (company == null || company.isBlank() || !in(r.applied(), from, now)) continue;
            String key = company.trim().toLowerCase(Locale.ROOT);
            display.putIfAbsent(key, company.trim());
            int[] c = perCompany.computeIfAbsent(key, k -> new int[2]);
            c[0]++;
            if (r.replied() != null) c[1]++;
        }
        int top = settings.getInt(ResumeBuilderSettingKeys.ANALYTICS_TOP_COMPANIES);
        return perCompany
            .entrySet()
            .stream()
            .sorted(Comparator.<Map.Entry<String, int[]>>comparingInt(e -> -e.getValue()[0]).thenComparingInt(e -> -e.getValue()[1]).thenComparing(Map.Entry::getKey))
            .limit(top)
            .map(e -> new AnalyticsCompany(display.get(e.getKey()), e.getValue()[0], e.getValue()[1]))
            .toList();
    }

    private static ZoneId zone(String tz) {
        if (tz == null || tz.isBlank()) return ZoneId.of("UTC");
        try {
            return ZoneId.of(tz.trim());
        } catch (DateTimeException e) {
            throw TrackerException.invalid("tz", "not a time zone name (use an IANA name like America/New_York)");
        }
    }
}
