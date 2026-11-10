package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.dto.TrackerDTOs.BulkFailure;
import com.dossier.api.service.dto.TrackerDTOs.BulkRequest;
import com.dossier.api.service.dto.TrackerDTOs.BulkResult;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.tracker.ChangeActor;
import com.dossier.api.service.tracker.ChangeRecorder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The user's own changes to a tracked application (APP-E2E U6.2): {@code PATCH} (status, next action,
 * star, archive, resume, offer outcome) and the bulk actions. Every real change writes its timeline event
 * (source WEB) through {@link ApplicationEventService}; the free text of a next action is checked for
 * never-collected values like every other write. A field absent from the body is left alone; a field sent
 * as {@code null} clears it (where clearing makes sense).
 *
 * <p>{@code outcome} is how an offer ended: {@code ACCEPTED} also stamps {@code acceptedAt} (the "Did you
 * accept?" chip), {@code DECLINED} clears it, {@code null} reopens the offer.
 */
@Service
@Transactional
public class ApplicationPatchService {

    /** The longest next action; the column's width, not a business number. */
    static final int NEXT_ACTION_MAX = 160;

    public static final Set<String> BULK_ACTIONS = Set.of("ARCHIVE", "UNARCHIVE", "STATUS", "STAR", "UNSTAR");
    public static final Set<String> OUTCOMES = Set.of("ACCEPTED", "DECLINED");

    private final TrackerUsers trackerUsers;
    private final ApplicationRepository applications;
    private final ApplicationEventService eventService;
    private final ApplicationListService listService;
    private final ResumeBuilderSettings settings;
    private final Clock clock;

    @Autowired
    public ApplicationPatchService(
        TrackerUsers trackerUsers,
        ApplicationRepository applications,
        ApplicationEventService eventService,
        ApplicationListService listService,
        ResumeBuilderSettings settings
    ) {
        this(trackerUsers, applications, eventService, listService, settings, Clock.systemUTC());
    }

    ApplicationPatchService(
        TrackerUsers trackerUsers,
        ApplicationRepository applications,
        ApplicationEventService eventService,
        ApplicationListService listService,
        ResumeBuilderSettings settings,
        Clock clock
    ) {
        this.trackerUsers = trackerUsers;
        this.applications = applications;
        this.eventService = eventService;
        this.listService = listService;
        this.settings = settings;
        this.clock = clock;
    }

    /** Apply {@code body} to one of the user's applications; 404 if it is not theirs. */
    public ApplicationDTO patch(Long id, ObjectNode body) {
        User user = trackerUsers.current();
        Application app = trackerUsers.application(user, id);
        apply(user, app, body, Instant.now(clock));
        return listService.enrichOne(applications.save(app), user);
    }

    /** One action over up to {@code tracker.bulk.maxIds} of the user's applications; an id that is not theirs is reported, not fatal. */
    public BulkResult bulk(BulkRequest req) {
        User user = trackerUsers.current();
        if (req == null || req.ids() == null || req.ids().isEmpty()) throw TrackerException.invalid("ids", "name at least one application");
        int max = settings.getInt(ResumeBuilderSettingKeys.TRACKER_BULK_MAX_IDS);
        Set<Long> ids = new LinkedHashSet<>(req.ids());
        ids.remove(null);
        if (ids.size() > max) throw TrackerException.limit("A bulk action takes at most " + max + " applications", max);
        String action = req.action() == null ? "" : req.action().trim().toUpperCase(Locale.ROOT);
        if (!BULK_ACTIONS.contains(action)) throw TrackerException.invalid("action", "use ARCHIVE, UNARCHIVE, STATUS, STAR or UNSTAR");
        if (action.equals("STATUS") && req.status() == null) throw TrackerException.invalid("status", "a STATUS action needs a status");

        ObjectNode patch = JsonNodeFactory.instance.objectNode();
        switch (action) {
            case "ARCHIVE" -> patch.put("archived", true);
            case "UNARCHIVE" -> patch.put("archived", false);
            case "STAR" -> patch.put("starred", true);
            case "UNSTAR" -> patch.put("starred", false);
            default -> patch.put("status", req.status().name());
        }

        List<Long> done = new ArrayList<>();
        List<BulkFailure> failed = new ArrayList<>();
        Instant now = Instant.now(clock);
        for (Long id : ids) {
            // Looked up directly (not through TrackerUsers): a miss here is a per-id result, not an exception.
            Optional<Application> app = applications.findOneByIdAndUserId(id, user.getId());
            if (app.isEmpty()) {
                failed.add(new BulkFailure(id, "NOT_FOUND"));
                continue;
            }
            apply(user, app.get(), patch, now);
            applications.save(app.get());
            done.add(id);
        }
        return new BulkResult(done, failed);
    }

    // ---- the change itself --------------------------------------------------
    /**
     * Applies one PATCH. Everything it changes is collected into ONE timeline row (a STATUS event when the status moved, else FIELD / RESUME) that lists
     * every changed field in {@code changes}, names the actor and stamps the application's {@code updated_by_*}. A request that changes nothing writes
     * nothing, and leaves {@code updated_at} alone.
     */
    void apply(User user, Application app, ObjectNode body, Instant now) {
        String source = ApplicationEvent.SRC_WEB;
        ChangeRecorder rec = new ChangeRecorder(eventService, app, source, ChangeActor.forOwner(user));

        if (body.has("status")) {
            ApplicationStatus to = status(body.get("status"));
            ApplicationStatus before = app.getStatus();
            app.setStatus(to);
            // Saying "I applied" (or that it moved on) also dates the application and confirms the submission.
            if (to == ApplicationStatus.APPLIED || to == ApplicationStatus.IN_REVIEW || to == ApplicationStatus.INTERVIEW || to == ApplicationStatus.OFFER) {
                if (app.getAppliedAt() == null) app.setAppliedAt(now);
                if (!Boolean.TRUE.equals(app.getSubmissionConfirmed())) app.setSubmissionConfirmed(true);
            }
            rec.status(before, to, null);
        }

        if (body.has("nextAction")) {
            String v = text(body.get("nextAction"), "nextAction", NEXT_ACTION_MAX);
            if (v != null) SensitiveContent.check("nextAction", "nextAction", v);
            if (!Objects.equals(v, app.getNextAction())) {
                app.setNextAction(v);
                rec.text("nextAction", v == null ? "Next step cleared" : "Next step: " + v);
            }
        }
        if (body.has("nextActionAt")) {
            Instant at = instant(body.get("nextActionAt"), "nextActionAt");
            Instant before = app.getNextActionAt();
            app.setNextActionAt(at);
            if (!Objects.equals(at, before)) rec.instant("nextActionAt", before, at, at == null ? "Next step date cleared" : "Next step date set");
        }

        if (body.has("starred")) {
            boolean starred = bool(body.get("starred"), "starred");
            boolean before = Boolean.TRUE.equals(app.getStarred());
            app.setStarred(starred);
            if (starred != before) rec.flag("starred", before, starred, starred ? "Starred" : "Unstarred");
        }
        if (body.has("archived")) {
            boolean archived = bool(body.get("archived"), "archived");
            boolean before = Boolean.TRUE.equals(app.getArchived());
            app.setArchived(archived);
            if (archived != before) rec.flag("archived", before, archived, archived ? "Archived" : "Restored from archive");
        }

        if (body.has("resumeId")) {
            JsonNode n = body.get("resumeId");
            Long before = app.getResume() == null ? null : app.getResume().getId();
            if (n.isNull()) {
                app.setResume(null);
                if (before != null) rec.resume(before, null, "Resume removed");
            } else if (n.canConvertToLong() && n.isIntegralNumber()) {
                Resume r = trackerUsers.resume(user, n.asLong());
                app.setResume(r);
                if (!Objects.equals(before, r.getId())) {
                    rec.resume(before, r.getId(), r.getLabel() == null ? "Resume changed" : "Resume: " + r.getLabel());
                }
            } else {
                throw TrackerException.invalid("resumeId", "must be a resume id or null");
            }
        }

        if (body.has("outcome")) {
            JsonNode n = body.get("outcome");
            String outcome = n.isNull() ? null : n.isTextual() ? n.textValue().trim().toUpperCase(Locale.ROOT) : "?";
            if (outcome != null && !OUTCOMES.contains(outcome)) throw TrackerException.invalid("outcome", "use ACCEPTED, DECLINED or null");
            if (!Objects.equals(outcome, app.getOutcome())) {
                String outcomeBefore = app.getOutcome();
                app.setOutcome(outcome);
                app.setAcceptedAt("ACCEPTED".equals(outcome) ? now : null);
                rec.code("outcome", outcomeBefore, outcome, outcome == null ? "Offer reopened" : outcome.equals("ACCEPTED") ? "Accepted the offer" : "Declined the offer");
            }
        }

        rec.flush();
    }

    // ---- field readers ------------------------------------------------------

    private static ApplicationStatus status(JsonNode n) {
        if (n == null || !n.isTextual()) throw TrackerException.invalid("status", "must be a status name");
        try {
            return ApplicationStatus.valueOf(n.textValue().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw TrackerException.invalid("status", "'" + n.textValue() + "' is not a status");
        }
    }

    /** A trimmed string, null for JSON null or blank; refused when not text or longer than {@code max}. */
    private static String text(JsonNode n, String path, int max) {
        if (n == null || n.isNull()) return null;
        if (!n.isTextual()) throw TrackerException.invalid(path, "must be text");
        String v = n.textValue().trim();
        if (v.isEmpty()) return null;
        if (v.length() > max) throw TrackerException.invalid(path, "is longer than " + max + " characters");
        return v;
    }

    private static Instant instant(JsonNode n, String path) {
        if (n == null || n.isNull()) return null;
        if (!n.isTextual()) throw TrackerException.invalid(path, "must be an ISO-8601 date-time or null");
        try {
            return Instant.parse(n.textValue().trim());
        } catch (DateTimeParseException e) {
            throw TrackerException.invalid(path, "must be an ISO-8601 date-time like 2026-10-14T09:00:00Z");
        }
    }

    private static boolean bool(JsonNode n, String path) {
        if (n == null || !n.isBoolean()) throw TrackerException.invalid(path, "must be true or false");
        return n.booleanValue();
    }
}
