package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.dto.ListPage;
import com.dossier.api.service.tracker.ChangeActor;
import com.dossier.api.service.tracker.ChangeActors;
import com.dossier.api.service.tracker.Changes;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.dto.TrackerDTOs.ActivityDay;
import com.dossier.api.service.dto.TrackerDTOs.EventDTO;
import com.dossier.api.service.inbox.InboxParser;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
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
    private final ChangeActors actors;
    private final Clock clock;

    @Autowired
    public ApplicationEventService(
        ApplicationEventRepository events,
        ApplicationRepository applications,
        ResumeBuilderSettings settings,
        TrackerUsers trackerUsers,
        ApplicationEventPublisher publisher,
        ChangeActors actors
    ) {
        this(events, applications, settings, trackerUsers, publisher, actors, Clock.systemUTC());
    }

    /** No publisher: what the unit tests of the tracker use, and exactly how this service behaved before {@link ApplicationEventRecorded}. */
    ApplicationEventService(
        ApplicationEventRepository events,
        ApplicationRepository applications,
        ResumeBuilderSettings settings,
        TrackerUsers trackerUsers,
        ChangeActors actors,
        Clock clock
    ) {
        this(events, applications, settings, trackerUsers, null, actors, clock);
    }

    ApplicationEventService(
        ApplicationEventRepository events,
        ApplicationRepository applications,
        ResumeBuilderSettings settings,
        TrackerUsers trackerUsers,
        ApplicationEventPublisher publisher,
        ChangeActors actors,
        Clock clock
    ) {
        this.events = events;
        this.applications = applications;
        this.settings = settings;
        this.trackerUsers = trackerUsers;
        this.publisher = publisher;
        this.actors = actors;
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
        String summary,
        ChangeActor.Actor actor,
        Changes changes
    ) {
        Instant now = Instant.now(clock);
        ApplicationEvent e = recordAt(app, kind, from, to, source, refId, summary, now, actor, changes);
        stampHead(app, kind, actor, now);
        if (publisher != null) {
            publisher.publishEvent(new ApplicationEventRecorded(app.getUser() == null ? null : app.getUser().getId(), app.getId(), kind, from, to, e.getSource()));
        }
        return e;
    }

    /**
     * As {@link #record} at a given time (the demo seed and imports back-date history). A back-dated row stamps the event only: the application's own
     * {@code updated_at} / {@code updated_by_*} describe the latest LIVE change and history is not news.
     */
    public ApplicationEvent recordAt(
        Application app,
        String kind,
        ApplicationStatus from,
        ApplicationStatus to,
        String source,
        Long refId,
        String summary,
        Instant at,
        ChangeActor.Actor actor,
        Changes changes
    ) {
        ChangeActor.Actor who = actor == null ? ChangeActor.system() : actor;
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(app.getId());
        e.setKind(kind);
        e.setFromStatus(from);
        e.setToStatus(to);
        e.setSource(source == null ? ApplicationEvent.SRC_WEB : source);
        e.setRefId(refId);
        e.setSummary(cap(summary));
        e.setCreatedAt(at);
        e.setActorKind(who.kind());
        e.setActorUserId(who.userId());
        e.setActorLogin(who.login());
        e.setOnBehalfOfUserId(who.onBehalfOfUserId());
        e.setChanges(changes == null ? null : changes.toJson());
        events.save(e);
        // The ghosted clock only moves forward: a back-dated event never makes an application look fresher.
        if (app.getLastEventAt() == null || at.isAfter(app.getLastEventAt())) {
            app.setLastEventAt(at);
        }
        return e;
    }

    /**
     * The live write also stamps the application it describes: {@code updated_at} is the event's time and {@code updated_by_*} is the actor (a person; null
     * for the extension, the inbox, the assistant and the platform, whose kind is then read from the newest event). A CREATED event also stamps
     * {@code created_by_*} when it is still empty.
     */
    private void stampHead(Application app, String kind, ChangeActor.Actor actor, Instant at) {
        if (app.getUpdatedAt() == null || !at.isBefore(app.getUpdatedAt())) app.setUpdatedAt(at);
        Long userId = actor != null && actor.isPerson() ? actor.userId() : null;
        String login = actor != null && actor.isPerson() ? actor.login() : null;
        app.setUpdatedByUserId(userId);
        app.setUpdatedByLogin(login);
        if (ApplicationEvent.CREATED.equals(kind) && app.getCreatedByUserId() == null && app.getCreatedByLogin() == null) {
            app.setCreatedByUserId(userId);
            app.setCreatedByLogin(login);
        }
    }

    /** A new application: one CREATED event carrying its first status, so "first became X" holds for it too. */
    public ApplicationEvent recordCreated(Application app, String source, ChangeActor.Actor actor) {
        return record(app, ApplicationEvent.CREATED, null, app.getStatus(), source, null, "Added to your tracker", actor, null);
    }

    /** A status change: one STATUS event. No event (and false) when the status did not change. */
    public boolean recordStatus(
        Application app,
        ApplicationStatus from,
        ApplicationStatus to,
        String source,
        Long refId,
        String summary,
        ChangeActor.Actor actor
    ) {
        if (to == null || to == from) return false;
        record(
            app,
            ApplicationEvent.STATUS,
            from,
            to,
            source,
            refId,
            summary != null ? summary : "Moved to " + ApplicationDerivations.statusLabel(to),
            actor,
            new Changes().enumValue("status", from, to)
        );
        return true;
    }

    /**
     * True when {@code actor} already edited this note a moment ago: an autosave burst is one history row, not one per keystroke pause
     * ({@code tracker.history.noteEditWindowSeconds}; 0 records every save).
     */
    @Transactional(readOnly = true)
    public boolean isRepeatNoteEdit(Application app, Long noteId, ChangeActor.Actor actor) {
        int window = settings.getInt(ResumeBuilderSettingKeys.TRACKER_HISTORY_NOTE_EDIT_WINDOW_SECONDS);
        if (window <= 0 || app.getId() == null || actor == null) return false;
        List<ApplicationEvent> newest = events.findByApplicationIdOrderByCreatedAtDescIdDesc(app.getId(), PageRequest.of(0, 1));
        if (newest.isEmpty()) return false;
        ApplicationEvent e = newest.get(0);
        return (
            ApplicationEvent.NOTE.equals(e.getKind()) &&
            noteId != null &&
            noteId.equals(e.getRefId()) &&
            NOTE_EDITED.equals(e.getSummary()) &&
            Objects.equals(e.getActorKind(), actor.kind()) &&
            Objects.equals(e.getActorUserId(), actor.userId()) &&
            e.getCreatedAt() != null &&
            !e.getCreatedAt().isBefore(Instant.now(clock).minusSeconds(window))
        );
    }

    /** The summary of a note-edit row: also how {@link #isRepeatNoteEdit} recognises one. */
    public static final String NOTE_EDITED = "Note edited";

    /** Stamps an application's head with its owner when nothing else has (the demo seed's back-dated rows leave the head alone). */
    public void stampOwner(Application app, User owner) {
        if (owner == null) return;
        if (app.getCreatedByUserId() == null && app.getCreatedByLogin() == null) {
            app.setCreatedByUserId(owner.getId());
            app.setCreatedByLogin(owner.getLogin());
        }
        if (app.getUpdatedByUserId() == null && app.getUpdatedByLogin() == null) {
            app.setUpdatedByUserId(owner.getId());
            app.setUpdatedByLogin(owner.getLogin());
        }
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
                recordStatus(
                    app,
                    e.from(),
                    e.to(),
                    ApplicationEvent.SRC_INBOX,
                    e.messageId(),
                    "Moved to " + ApplicationDerivations.statusLabel(e.to()) + " - from an email",
                    ChangeActor.mail()
                );
                applications.save(app);
            });
    }

    // ---- reading ------------------------------------------------------------

    /** The newest events of one application (the caller proved it is theirs), at most {@code tracker.detail.eventsMax}. */
    @Transactional(readOnly = true)
    public List<EventDTO> recent(Long applicationId) {
        int max = settings.getInt(ResumeBuilderSettingKeys.TRACKER_DETAIL_EVENTS_MAX);
        return markUndoable(actors.events(events.findByApplicationIdOrderByCreatedAtDescIdDesc(applicationId, PageRequest.of(0, max))));
    }

    /** The summary of the row an undo writes: also how {@link #markUndoable} recognises that an inbox change was undone already. */
    public static final String UNDONE = "Undone by you";

    /** The latest inbox status change of an application that was not undone: its event id and whether it is still inside the undo window. */
    public record InboxUndoState(Long eventId, boolean undoable) {}

    /**
     * The same rule {@link #markUndoable} applies to timeline rows, for one application: the newest INBOX status-change row that no "Undone by you"
     * row refers to, with {@code undoable} true while it is inside {@code inbox.undo_window_days}. Null when the inbox never moved the application
     * (or every move was undone). The caller proved the application is theirs. Reads raw rows, no actor lookup.
     */
    @Transactional(readOnly = true)
    public InboxUndoState inboxUndo(Long applicationId) {
        int max = settings.getInt(ResumeBuilderSettingKeys.TRACKER_DETAIL_EVENTS_MAX);
        List<ApplicationEvent> rows = events.findByApplicationIdOrderByCreatedAtDescIdDesc(applicationId, PageRequest.of(0, max));
        java.util.Set<Long> undone = new java.util.HashSet<>();
        for (ApplicationEvent r : rows) if (UNDONE.equals(r.getSummary()) && r.getRefId() != null) undone.add(r.getRefId());
        int days = settings.getInt(AdminSettingKeys.INBOX_UNDO_WINDOW_DAYS);
        Instant cutoff = Instant.now(clock).minusSeconds(Math.max(days, 0) * 86400L);
        for (ApplicationEvent r : rows) {
            if (!EventDTO.isInboxStatus(r) || undone.contains(r.getId())) continue;
            return new InboxUndoState(r.getId(), days > 0 && r.getCreatedAt() != null && !r.getCreatedAt().isBefore(cutoff));
        }
        return null;
    }

    /**
     * Inbox status changes still inside the undo window ({@code inbox.undo_window_days}) and not undone yet carry {@code undoable} so the page can show
     * Undo. An undone change is recognised by the row the undo wrote (kind STATUS, ref = the changed row's id, summary {@link #UNDONE}); newest-first
     * pages hold that row ahead of the one it undid.
     */
    private List<EventDTO> markUndoable(List<EventDTO> rows) {
        if (rows.stream().noneMatch(r -> r.inboxEventId() != null)) return rows;
        int days = settings.getInt(AdminSettingKeys.INBOX_UNDO_WINDOW_DAYS);
        if (days <= 0) return rows;
        Instant cutoff = Instant.now(clock).minusSeconds(days * 86400L);
        java.util.Set<Long> undone = new java.util.HashSet<>();
        for (EventDTO r : rows) if (UNDONE.equals(r.summary()) && r.refId() != null) undone.add(r.refId());
        List<EventDTO> out = new ArrayList<>(rows.size());
        for (EventDTO r : rows) {
            boolean ok = r.inboxEventId() != null && !undone.contains(r.inboxEventId()) && r.createdAt() != null && !r.createdAt().isBefore(cutoff);
            out.add(ok ? r.withUndoable(true) : r);
        }
        return out;
    }

    /**
     * The full history of one of the caller's applications, newest first (id breaks a tie so paging is stable); 404 when it is not theirs. The page
     * size is {@code tracker.history.pageDefaultSize} unless the request names one, clamped to {@code tracker.history.pageMaxSize}.
     */
    @Transactional(readOnly = true)
    public ListPage<EventDTO> history(Long applicationId, Integer page, Integer size) {
        User user = trackerUsers.current();
        trackerUsers.application(user, applicationId);
        int max = settings.getInt(ResumeBuilderSettingKeys.TRACKER_HISTORY_PAGE_MAX_SIZE);
        int def = Math.min(settings.getInt(ResumeBuilderSettingKeys.TRACKER_HISTORY_PAGE_DEFAULT_SIZE), max);
        int n = size == null || size < 1 ? def : Math.min(size, max);
        int p = page == null || page < 0 ? 0 : page;
        List<EventDTO> items = markUndoable(actors.events(events.findByApplicationIdOrderByCreatedAtDescIdDesc(applicationId, PageRequest.of(p, n))));
        return new ListPage<>(items, events.countByApplicationId(applicationId), p, n, null);
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
