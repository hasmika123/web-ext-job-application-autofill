package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.ApplicationNote;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationNoteRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.dto.ChangeActorDTO;
import com.dossier.api.service.dto.TrackerDTOs.EventDTO;
import com.dossier.api.service.tracker.ChangeActor;
import com.dossier.api.service.tracker.ChangeActors;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What the tracker stores beside the application row (events, notes, interviews) as far as account
 * lifecycle goes (APP-E2E U6.1): erased with the account, included in the data export, and seeded for the
 * demo account. The DB cascades would remove these rows with their applications anyway; the erasure is
 * explicit so it is self-contained and testable, like the other data services.
 */
@Service
public class TrackerDataService {

    private final ApplicationEventRepository events;
    private final ApplicationNoteRepository notes;
    private final InterviewRepository interviews;
    private final ApplicationEventService eventService;
    private final ApplicationRepository applications;
    private final ChangeActors actors;

    public TrackerDataService(
        ApplicationEventRepository events,
        ApplicationNoteRepository notes,
        InterviewRepository interviews,
        ApplicationEventService eventService,
        ApplicationRepository applications,
        ChangeActors actors
    ) {
        this.events = events;
        this.notes = notes;
        this.interviews = interviews;
        this.eventService = eventService;
        this.applications = applications;
        this.actors = actors;
    }

    /** Erase every event, note and interview of the user. Call before their applications are deleted. */
    @Transactional
    public void deleteAllForUser(Long userId) {
        interviews.deleteByUser(userId);
        notes.deleteByUser(userId);
        events.deleteByUser(userId);
    }

    /** Events, notes and interviews of the user, as plain maps for the account export. */
    @Transactional(readOnly = true)
    public Map<String, List<Map<String, Object>>> exportForUser(Long userId) {
        Map<String, List<Map<String, Object>>> out = new LinkedHashMap<>();
        // Who did each change is resolved NOW, to a label: the export never carries another person's user id or an enterprise login (docs/change-audit/README.md 4.2).
        List<ApplicationEvent> rows = events.findAllByUser(userId);
        List<EventDTO> resolved = actors.events(rows);
        List<Map<String, Object>> eventMaps = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) eventMaps.add(toExport(rows.get(i), resolved.get(i)));
        out.put("applicationEvents", eventMaps);
        out.put("applicationNotes", notes.findAllByUser(userId).stream().map(TrackerDataService::toExport).toList());
        out.put("interviews", interviews.findByUserIdOrderByStartsAtAscIdAsc(userId).stream().map(TrackerDataService::toExport).toList());
        return out;
    }

    /**
     * The applications of the account export with "added by" and "last changed by" as LABELS (a name, "Kiwiply", "a deleted account", "a former member"),
     * resolved at export time. The user id and the organization seat are dropped: the export is the owner's, and it names people, never accounts.
     */
    @Transactional(readOnly = true)
    public List<ApplicationDTO> withActorLabels(List<ApplicationDTO> dtos, Long userId) {
        List<Application> heads = applications.findByUserId(userId);
        Map<Long, ChangeActorDTO> updatedBy = actors.updatedBy(heads);
        Map<Long, ChangeActorDTO> createdBy = actors.createdBy(heads);
        for (ApplicationDTO dto : dtos) {
            dto.setUpdatedBy(labelOnly(updatedBy.get(dto.getId())));
            dto.setCreatedBy(labelOnly(createdBy.get(dto.getId())));
        }
        return dtos;
    }

    private static ChangeActorDTO labelOnly(ChangeActorDTO a) {
        return a == null ? null : new ChangeActorDTO(null, null, a.label(), null, a.kind());
    }

    // ---- the demo account's history -----------------------------------------

    /**
     * Give a freshly seeded demo application the history it would have had: CREATED, then APPLIED, then
     * the move to its current status, each back-dated, so the timeline, ghosted flag and dashboard activity
     * are real for the demo (the same service real traffic uses, no SQL fixtures).
     *
     * @param createdAt when it was added; {@code appliedAt} when it was applied (null: never);
     *                  {@code movedAt} when it reached its current status after being applied (null: it did not move)
     */
    @Transactional
    public void seedDemoHistory(Application app, Instant createdAt, Instant appliedAt, Instant movedAt) {
        eventService.recordAt(app, ApplicationEvent.CREATED, null, app.getStatus() == ApplicationStatus.SAVED ? ApplicationStatus.SAVED : ApplicationStatus.DRAFT, ApplicationEvent.SRC_SYSTEM, null, "Added to your tracker", createdAt, ChangeActor.system(), null);
        eventService.stampOwner(app, app.getUser());
        if (appliedAt != null) {
            eventService.recordAt(app, ApplicationEvent.STATUS, ApplicationStatus.DRAFT, ApplicationStatus.APPLIED, ApplicationEvent.SRC_EXTENSION, null, "Applied", appliedAt, ChangeActor.forSource(ApplicationEvent.SRC_EXTENSION, app.getUser()), null);
        }
        if (movedAt != null && app.getStatus() != ApplicationStatus.APPLIED) {
            eventService.recordAt(
                app,
                ApplicationEvent.STATUS,
                ApplicationStatus.APPLIED,
                app.getStatus(),
                ApplicationEvent.SRC_INBOX,
                null,
                "Moved to " + ApplicationDerivations.statusLabel(app.getStatus()) + " - from an email",
                movedAt,
                ChangeActor.mail(),
                null
            );
        }
    }

    /** A demo note on an application. */
    @Transactional
    public ApplicationNote seedDemoNote(Application app, String body, boolean pinned, Instant at) {
        ApplicationNote n = new ApplicationNote();
        n.setApplicationId(app.getId());
        n.setBody(body);
        n.setPinned(pinned);
        n.setCreatedAt(at);
        n.setUpdatedAt(at);
        notes.save(n);
        eventService.recordAt(app, ApplicationEvent.NOTE, null, null, ApplicationEvent.SRC_SYSTEM, n.getId(), "Note added", at, ChangeActor.forOwner(app.getUser()), null);
        return n;
    }

    /** A demo interview on an application ({@code outcome} null = pending). */
    @Transactional
    public Interview seedDemoInterview(Application app, String kind, Instant startsAt, int minutes, String tz, String location, String interviewer, String outcome) {
        Interview i = new Interview();
        i.setApplicationId(app.getId());
        i.setUserId(app.getUser().getId());
        i.setKind(kind);
        i.setStartsAt(startsAt);
        i.setEndsAt(startsAt.plusSeconds(minutes * 60L));
        i.setTz(tz);
        i.setLocation(location);
        i.setInterviewer(interviewer);
        i.setOutcome(outcome == null ? Interview.PENDING : outcome);
        i.setSource(Interview.SRC_WEB);
        interviews.save(i);
        // "Logged" three days before it, but never in the future: history is not back-dated forwards.
        Instant now = Instant.now();
        Instant logged = startsAt.minusSeconds(3 * 24 * 3600L);
        eventService.recordAt(app, ApplicationEvent.INTERVIEW, null, null, ApplicationEvent.SRC_SYSTEM, i.getId(), "Interview logged", logged.isAfter(now) ? now.minusSeconds(3600) : logged, ChangeActor.forOwner(app.getUser()), null);
        return i;
    }

    private static Map<String, Object> toExport(ApplicationEvent e, EventDTO resolved) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("applicationId", e.getApplicationId());
        m.put("kind", e.getKind());
        m.put("fromStatus", e.getFromStatus());
        m.put("toStatus", e.getToStatus());
        m.put("source", e.getSource());
        m.put("summary", e.getSummary());
        m.put("createdAt", e.getCreatedAt());
        m.put("actorKind", e.getActorKind());
        m.put("actor", resolved.actor() == null ? null : resolved.actor().label());
        m.put("onBehalfOf", resolved.onBehalfOf() == null ? null : resolved.onBehalfOf().label());
        m.put("changes", resolved.changes());
        return m;
    }

    private static Map<String, Object> toExport(ApplicationNote n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", n.getId());
        m.put("applicationId", n.getApplicationId());
        m.put("body", n.getBody());
        m.put("pinned", n.isPinned());
        m.put("createdAt", n.getCreatedAt());
        m.put("updatedAt", n.getUpdatedAt());
        return m;
    }

    private static Map<String, Object> toExport(Interview i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", i.getId());
        m.put("applicationId", i.getApplicationId());
        m.put("kind", i.getKind());
        m.put("startsAt", i.getStartsAt());
        m.put("endsAt", i.getEndsAt());
        m.put("tz", i.getTz());
        m.put("location", i.getLocation());
        m.put("interviewer", i.getInterviewer());
        m.put("notes", i.getNotes());
        m.put("outcome", i.getOutcome());
        m.put("source", i.getSource());
        m.put("createdAt", i.getCreatedAt());
        m.put("updatedAt", i.getUpdatedAt());
        return m;
    }
}
