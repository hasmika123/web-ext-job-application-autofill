package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.dto.TrackerDTOs.ActivityDay;
import com.dossier.api.service.dto.TrackerDTOs.EventDTO;
import com.dossier.api.service.inbox.InboxParser;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The tracker's memory (APP-E2E U6.1): the one place an {@code application_event} is written. Every
 * create, status change, note, interview and mail move on an application calls {@link #record}, which
 * also moves {@code application.last_event_at} (the ghosted clock). Events are append-only.
 *
 * <p>Sources: {@code EXTENSION} (the browser extension's writes), {@code WEB} (the user, in the app),
 * {@code INBOX} (a mail moved it), {@code SYSTEM} (migrations, the demo seed), {@code ASSISTANT}.
 *
 * <p>{@link #activity} feeds the dashboard's activity bars: events per day over the last N days.
 */
@Service
@Transactional
public class ApplicationEventService {

    private static final int SUMMARY_MAX = 200;

    private final ApplicationEventRepository events;
    private final ApplicationRepository applications;
    private final ResumeBuilderSettings settings;
    private final TrackerUsers trackerUsers;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    @Autowired
    public ApplicationEventService(
        ApplicationEventRepository events,
        ApplicationRepository applications,
        ResumeBuilderSettings settings,
        TrackerUsers trackerUsers,
        ApplicationEventPublisher publisher
    ) {
        this(events, applications, settings, trackerUsers, publisher, Clock.systemUTC());
    }

    /** No publisher: what the unit tests of the tracker use, and exactly how this service behaved before {@link ApplicationEventRecorded}. */
    ApplicationEventService(
        ApplicationEventRepository events,
        ApplicationRepository applications,
        ResumeBuilderSettings settings,
        TrackerUsers trackerUsers,
        Clock clock
    ) {
        this(events, applications, settings, trackerUsers, null, clock);
    }

    ApplicationEventService(
        ApplicationEventRepository events,
        ApplicationRepository applications,
        ResumeBuilderSettings settings,
        TrackerUsers trackerUsers,
        ApplicationEventPublisher publisher,
        Clock clock
    ) {
        this.events = events;
        this.applications = applications;
        this.settings = settings;
        this.trackerUsers = trackerUsers;
        this.publisher = publisher;
        this.clock = clock;
    }

    // ---- writing ------------------------------------------------------------

    /**
     * Record an event now. {@code app} must already be saved (it needs an id). Returns the stored event. This is the ONE writer a live change goes
     * through (creations, status changes, notes, interviews, mail moves), so it is also the ONE place an {@link ApplicationEventRecorded} is published:
     * after the save, to listeners that run only once the surrounding transaction has committed. Back-dated writes ({@link #recordAt}: the demo seed,
     * imports) publish nothing: history is not news.
     */
    public ApplicationEvent record(
        Application app,
        String kind,
        ApplicationStatus from,
        ApplicationStatus to,
        String source,
        Long refId,
        String summary
    ) {
        ApplicationEvent e = recordAt(app, kind, from, to, source, refId, summary, Instant.now(clock));
        if (publisher != null) {
            publisher.publishEvent(new ApplicationEventRecorded(app.getUser() == null ? null : app.getUser().getId(), app.getId(), kind, from, to, e.getSource()));
        }
        return e;
    }

    /** As {@link #record} at a given time (the demo seed and imports back-date history). */
    public ApplicationEvent recordAt(
        Application app,
        String kind,
        ApplicationStatus from,
        ApplicationStatus to,
        String source,
        Long refId,
        String summary,
        Instant at
    ) {
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(app.getId());
        e.setKind(kind);
        e.setFromStatus(from);
        e.setToStatus(to);
        e.setSource(source == null ? ApplicationEvent.SRC_WEB : source);
        e.setRefId(refId);
        e.setSummary(cap(summary));
        e.setCreatedAt(at);
        events.save(e);
        // The ghosted clock only moves forward: a back-dated event never makes an application look fresher.
        if (app.getLastEventAt() == null || at.isAfter(app.getLastEventAt())) {
            app.setLastEventAt(at);
        }
        return e;
    }

    /** A new application: one CREATED event carrying its first status, so "first became X" holds for it too. */
    public ApplicationEvent recordCreated(Application app, String source) {
        return record(app, ApplicationEvent.CREATED, null, app.getStatus(), source, null, "Added to your tracker");
    }

    /** A status change: one STATUS event. No event (and false) when the status did not change. */
    public boolean recordStatus(Application app, ApplicationStatus from, ApplicationStatus to, String source, Long refId, String summary) {
        if (to == null || to == from) return false;
        record(app, ApplicationEvent.STATUS, from, to, source, refId, summary != null ? summary : "Moved to " + ApplicationDerivations.statusLabel(to));
        return true;
    }

    /** Which event source a write came from, given the application payload's own {@code source} label. */
    public static String sourceOf(String payloadSource) {
        if (payloadSource == null) return ApplicationEvent.SRC_WEB;
        return switch (payloadSource.trim().toLowerCase(Locale.ROOT)) {
            case "extension" -> ApplicationEvent.SRC_EXTENSION;
            case "inbox" -> ApplicationEvent.SRC_INBOX;
            case "demo", "system" -> ApplicationEvent.SRC_SYSTEM;
            case "assistant" -> ApplicationEvent.SRC_ASSISTANT;
            default -> ApplicationEvent.SRC_WEB;
        };
    }

    /** An email moved an application: write it into the timeline (source INBOX, ref = the mail's id). */
    @EventListener
    public void onStatusChanged(InboxParser.StatusChanged e) {
        if (e.to() == null || e.applicationId() == null) return;
        applications
            .findById(e.applicationId())
            .ifPresent(app -> {
                recordStatus(app, e.from(), e.to(), ApplicationEvent.SRC_INBOX, e.messageId(), "Moved to " + ApplicationDerivations.statusLabel(e.to()) + " - from an email");
                applications.save(app);
            });
    }

    // ---- reading ------------------------------------------------------------

    /** The newest events of one application (the caller proved it is theirs), at most {@code tracker.detail.eventsMax}. */
    @Transactional(readOnly = true)
    public List<EventDTO> recent(Long applicationId) {
        int max = settings.getInt(ResumeBuilderSettingKeys.TRACKER_DETAIL_EVENTS_MAX);
        return events.findByApplicationIdOrderByCreatedAtDescIdDesc(applicationId, PageRequest.of(0, max)).stream().map(EventDTO::of).toList();
    }

    /**
     * Events per day over the last {@code days} days (default {@code tracker.activity.defaultDays}, capped at
     * {@code tracker.activity.maxDays}), oldest first, one row for every day including quiet ones, days named
     * in {@code tz} (an IANA zone; UTC when absent).
     */
    @Transactional(readOnly = true)
    public List<ActivityDay> activity(Integer days, String tz) {
        Long userId = trackerUsers.current().getId();
        int max = settings.getInt(ResumeBuilderSettingKeys.TRACKER_ACTIVITY_MAX_DAYS);
        int n = days == null ? settings.getInt(ResumeBuilderSettingKeys.TRACKER_ACTIVITY_DEFAULT_DAYS) : days;
        n = Math.max(1, Math.min(n, max));
        ZoneId zone = zone(tz);
        LocalDate today = Instant.now(clock).atZone(zone).toLocalDate();
        LocalDate first = today.minusDays(n - 1L);

        Map<LocalDate, Integer> counts = new TreeMap<>();
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) counts.put(d, 0);
        for (Instant at : events.createdAtSince(userId, first.atStartOfDay(zone).toInstant())) {
            counts.computeIfPresent(at.atZone(zone).toLocalDate(), (d, c) -> c + 1);
        }
        List<ActivityDay> out = new ArrayList<>(counts.size());
        counts.forEach((d, c) -> out.add(new ActivityDay(d.toString(), c)));
        return out;
    }

    private static ZoneId zone(String tz) {
        if (tz == null || tz.isBlank()) return ZoneId.of("UTC");
        try {
            return ZoneId.of(tz.trim());
        } catch (DateTimeException e) {
            throw TrackerException.invalid("tz", "not a time zone name (use an IANA name like America/New_York)");
        }
    }

    private static String cap(String s) {
        if (s == null) return null;
        return s.length() <= SUMMARY_MAX ? s : s.substring(0, SUMMARY_MAX - 1) + "…";
    }
}
