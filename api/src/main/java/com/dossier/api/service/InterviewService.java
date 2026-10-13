package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.service.dto.TrackerDTOs.InterviewDTO;
import com.dossier.api.service.privacy.SensitiveContent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The user's interviews (APP-E2E U6.4): log, change, remove, record how it went, list a date range for the
 * dashboard and prep pages, and export one as an {@code .ics} file.
 *
 * <p>Every lookup is by id AND owner (an interview carries its user's id), so another user's application or
 * interview is a 404, never a 403. Free text (location, interviewer, notes) is checked for never-collected
 * values like every other write (422 {@code SENSITIVE_CONTENT}). Every length, count and window is a
 * {@code tracker.*} setting. Logging, rescheduling, removing and an outcome each write an INTERVIEW event
 * to the application's timeline; other edits (autosaved field by field) do not.
 *
 * <p>Reminders arrive with U7.1; the {@code reminder_*_sent_at} columns are not touched here. Logging an
 * interview does not change the application's status: that stays the user's explicit choice.
 */
@Service
@Transactional
public class InterviewService {

    // Column widths, not business numbers.
    static final int LOCATION_MAX = 200;
    static final int INTERVIEWER_MAX = 120;
    static final int TZ_MAX = 48;

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("MMM d, HH:mm", Locale.ENGLISH);

    private final TrackerUsers trackerUsers;
    private final InterviewRepository interviews;
    private final ApplicationRepository applications;
    private final ApplicationEventService eventService;
    private final ResumeBuilderSettings settings;
    private final Clock clock;

    @Autowired
    public InterviewService(
        TrackerUsers trackerUsers,
        InterviewRepository interviews,
        ApplicationRepository applications,
        ApplicationEventService eventService,
        ResumeBuilderSettings settings
    ) {
        this(trackerUsers, interviews, applications, eventService, settings, Clock.systemUTC());
    }

    InterviewService(
        TrackerUsers trackerUsers,
        InterviewRepository interviews,
        ApplicationRepository applications,
        ApplicationEventService eventService,
        ResumeBuilderSettings settings,
        Clock clock
    ) {
        this.trackerUsers = trackerUsers;
        this.interviews = interviews;
        this.applications = applications;
        this.eventService = eventService;
        this.settings = settings;
        this.clock = clock;
    }

    /** An {@code .ics} download: the file name and its content. */
    public record IcsFile(String filename, String content) {}

    // ---- write ------------------------------------------------------------------------------------

    /** {@code {kind, startsAt, endsAt?, tz?, location?, interviewer?, notes?}}. */
    public InterviewDTO create(Long applicationId, ObjectNode body) {
        User user = trackerUsers.current();
        Application app = trackerUsers.application(user, applicationId);
        int cap = settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEWS_MAX_PER_APPLICATION);
        if (interviews.countByApplicationId(app.getId()) >= cap) {
            throw TrackerException.limit("An application holds at most " + cap + " interviews", cap);
        }

        Interview i = new Interview();
        i.setApplicationId(app.getId());
        i.setUserId(user.getId());
        i.setSource(Interview.SRC_WEB);
        i.setOutcome(Interview.PENDING);
        i.setKind(kind(body.get("kind"), true));
        i.setStartsAt(instant(body.get("startsAt"), "startsAt", true));
        i.setEndsAt(instant(body.get("endsAt"), "endsAt", false));
        i.setTz(tz(body.get("tz")));
        i.setLocation(text(body.get("location"), "location", LOCATION_MAX));
        i.setInterviewer(text(body.get("interviewer"), "interviewer", INTERVIEWER_MAX));
        i.setNotes(text(body.get("notes"), "notes", settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEW_NOTES_MAX_CHARS)));
        checkDuration(i);
        Instant now = Instant.now(clock);
        i.setCreatedAt(now);
        i.setUpdatedAt(now);
        interviews.save(i);

        eventService.record(app, ApplicationEvent.INTERVIEW, null, null, ApplicationEvent.SRC_WEB, i.getId(), "Interview scheduled: " + label(i));
        return InterviewDTO.of(i, app.getCompany(), app.getRoleTitle());
    }

    /** Partial: only the fields sent change; {@code null} clears {@code endsAt}, {@code tz}, {@code location}, {@code interviewer}, {@code notes}. */
    public InterviewDTO update(Long applicationId, Long interviewId, ObjectNode body) {
        User user = trackerUsers.current();
        Application app = trackerUsers.application(user, applicationId);
        Interview i = owned(user, app, interviewId);
        Instant startsBefore = i.getStartsAt();

        if (body.has("kind")) i.setKind(kind(body.get("kind"), true));
        if (body.has("startsAt")) i.setStartsAt(instant(body.get("startsAt"), "startsAt", true));
        if (body.has("endsAt")) i.setEndsAt(instant(body.get("endsAt"), "endsAt", false));
        if (body.has("tz")) i.setTz(tz(body.get("tz")));
        if (body.has("location")) i.setLocation(text(body.get("location"), "location", LOCATION_MAX));
        if (body.has("interviewer")) i.setInterviewer(text(body.get("interviewer"), "interviewer", INTERVIEWER_MAX));
        if (body.has("notes")) i.setNotes(text(body.get("notes"), "notes", settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEW_NOTES_MAX_CHARS)));
        checkDuration(i);
        i.setUpdatedAt(Instant.now(clock));
        interviews.save(i);

        if (!Objects.equals(startsBefore, i.getStartsAt())) {
            eventService.record(app, ApplicationEvent.INTERVIEW, null, null, ApplicationEvent.SRC_WEB, i.getId(), "Interview rescheduled: " + label(i));
        }
        return InterviewDTO.of(i, app.getCompany(), app.getRoleTitle());
    }

    public void delete(Long applicationId, Long interviewId) {
        User user = trackerUsers.current();
        Application app = trackerUsers.application(user, applicationId);
        Interview i = owned(user, app, interviewId);
        interviews.delete(i);
        eventService.record(app, ApplicationEvent.INTERVIEW, null, null, ApplicationEvent.SRC_WEB, null, "Interview removed: " + label(i));
    }

    /** {@code {outcome}}: PENDING | PASSED | REJECTED | NO_SHOW. */
    public InterviewDTO outcome(Long applicationId, Long interviewId, ObjectNode body) {
        User user = trackerUsers.current();
        Application app = trackerUsers.application(user, applicationId);
        Interview i = owned(user, app, interviewId);
        String outcome = outcomeOf(body.get("outcome"), true);
        if (!outcome.equals(i.getOutcome())) {
            i.setOutcome(outcome);
            i.setUpdatedAt(Instant.now(clock));
            interviews.save(i);
            eventService.record(app, ApplicationEvent.INTERVIEW, null, null, ApplicationEvent.SRC_WEB, i.getId(), "Interview outcome: " + outcomeWords(outcome));
        }
        return InterviewDTO.of(i, app.getCompany(), app.getRoleTitle());
    }

    // ---- read -------------------------------------------------------------------------------------

    /**
     * The user's interviews starting in {@code [from, to)}, soonest first. {@code from}/{@code to} are
     * ISO-8601 instants or dates ({@code yyyy-MM-dd}; a date {@code to} includes that whole day, in UTC).
     * Without them: from now, for {@code tracker.interviews.defaultRangeDays}. The window is capped at
     * {@code tracker.interviews.maxRangeDays} and the list at {@code tracker.interviews.listMax}.
     */
    @Transactional(readOnly = true)
    public List<InterviewDTO> range(String from, String to, String outcome) {
        User user = trackerUsers.current();
        Instant start = from == null || from.isBlank() ? Instant.now(clock) : bound(from, "from", false);
        Instant end = to == null || to.isBlank()
            ? start.plus(Duration.ofDays(settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEWS_DEFAULT_RANGE_DAYS)))
            : bound(to, "to", true);
        if (!end.isAfter(start)) throw TrackerException.invalid("to", "must be after from");
        int maxDays = settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEWS_MAX_RANGE_DAYS);
        if (Duration.between(start, end).compareTo(Duration.ofDays(maxDays)) > 0) {
            throw TrackerException.invalid("to", "the range is at most " + maxDays + " days");
        }
        String wanted = outcome == null || outcome.isBlank() ? null : outcomeOf(new com.fasterxml.jackson.databind.node.TextNode(outcome), true);
        int listMax = settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEWS_LIST_MAX);

        List<Interview> rows = interviews.findInRange(user.getId(), start, end, wanted, PageRequest.of(0, listMax));
        Map<Long, Application> apps = new HashMap<>();
        for (Application a : applications.findAllById(rows.stream().map(Interview::getApplicationId).distinct().toList())) apps.put(a.getId(), a);
        List<InterviewDTO> out = new ArrayList<>(rows.size());
        for (Interview i : rows) {
            Application a = apps.get(i.getApplicationId());
            out.add(InterviewDTO.of(i, a == null ? null : a.getCompany(), a == null ? null : a.getRoleTitle()));
        }
        return out;
    }

    /** The interview as an iCalendar file; 404 when it is not the user's. */
    @Transactional(readOnly = true)
    public IcsFile ics(Long interviewId) {
        User user = trackerUsers.current();
        Interview i = interviews
            .findOneByIdAndUserId(interviewId, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Interview not found"));
        Application app = applications.findById(i.getApplicationId()).orElse(null);
        int minutes = settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEW_DEFAULT_DURATION_MINUTES);
        String content = IcsCalendar.interview(i, app == null ? null : app.getCompany(), app == null ? null : app.getRoleTitle(), minutes, Instant.now(clock));
        return new IcsFile("interview-" + i.getId() + ".ics", content);
    }

    // ---- helpers ----------------------------------------------------------------------------------

    private Interview owned(User user, Application app, Long interviewId) {
        return interviews
            .findOneByIdAndApplicationIdAndUserId(interviewId, app.getId(), user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Interview not found"));
    }

    /** "Video interview, Oct 10, 10:00" in the interview's own zone (UTC when none). */
    private static String label(Interview i) {
        ZoneId zone = IcsCalendar.zoneOf(i.getTz());
        return ApplicationDerivations.interviewLabel(i.getKind()) + ", " + WHEN.format(i.getStartsAt().atZone(zone == null ? ZoneOffset.UTC : zone));
    }

    private static String outcomeWords(String outcome) {
        return switch (outcome) {
            case Interview.PASSED -> "Passed";
            case Interview.REJECTED -> "Rejected";
            case Interview.NO_SHOW -> "No show";
            default -> "Pending";
        };
    }

    private void checkDuration(Interview i) {
        if (i.getEndsAt() == null) return;
        if (!i.getEndsAt().isAfter(i.getStartsAt())) throw TrackerException.invalid("endsAt", "must be after startsAt");
        int hours = settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEW_MAX_DURATION_HOURS);
        if (Duration.between(i.getStartsAt(), i.getEndsAt()).compareTo(Duration.ofHours(hours)) > 0) {
            throw TrackerException.invalid("endsAt", "an interview is at most " + hours + " hours long");
        }
    }

    private static String kind(JsonNode n, boolean required) {
        if (n == null || n.isNull()) {
            if (required) throw TrackerException.invalid("kind", "is required");
            return null;
        }
        String k = n.isTextual() ? n.textValue().trim().toUpperCase(Locale.ROOT) : "";
        if (!Interview.KINDS.contains(k)) throw TrackerException.invalid("kind", "use one of " + String.join(", ", Interview.KINDS));
        return k;
    }

    private static String outcomeOf(JsonNode n, boolean required) {
        if (n == null || n.isNull()) {
            if (required) throw TrackerException.invalid("outcome", "is required");
            return null;
        }
        String o = n.isTextual() ? n.textValue().trim().toUpperCase(Locale.ROOT) : "";
        if (!Interview.OUTCOMES.contains(o)) throw TrackerException.invalid("outcome", "use PENDING, PASSED, REJECTED or NO_SHOW");
        return o;
    }

    /** An ISO-8601 date-time with an offset or {@code Z} (what a browser's {@code toISOString()} gives). */
    private static Instant instant(JsonNode n, String path, boolean required) {
        if (n == null || n.isNull()) {
            if (required) throw TrackerException.invalid(path, "is required");
            return null;
        }
        if (!n.isTextual()) throw TrackerException.invalid(path, "must be an ISO-8601 date-time");
        String s = n.textValue().trim();
        try {
            return Instant.parse(s);
        } catch (DateTimeParseException e) {
            try {
                return OffsetDateTime.parse(s).toInstant();
            } catch (DateTimeParseException e2) {
                throw TrackerException.invalid(path, "must be an ISO-8601 date-time like 2026-10-10T14:00:00Z");
            }
        }
    }

    /** An IANA zone name (or any id {@link ZoneId} reads); blank or null clears it. */
    private static String tz(JsonNode n) {
        if (n == null || n.isNull()) return null;
        if (!n.isTextual()) throw TrackerException.invalid("tz", "must be an IANA time zone name");
        String s = n.textValue().trim();
        if (s.isEmpty()) return null;
        if (s.length() > TZ_MAX) throw TrackerException.invalid("tz", "is not a time zone name");
        try {
            ZoneId.of(s);
        } catch (DateTimeException e) {
            throw TrackerException.invalid("tz", "is not a time zone name (use an IANA name like America/New_York)");
        }
        return s;
    }

    /** Trimmed free text, null when blank; refused when over {@code max} or when it holds a never-collected value. */
    private static String text(JsonNode n, String path, int max) {
        if (n == null || n.isNull()) return null;
        if (!n.isTextual()) throw TrackerException.invalid(path, "must be text");
        String s = n.textValue().trim();
        if (s.isEmpty()) return null;
        if (s.length() > max) throw TrackerException.invalid(path, "is longer than " + max + " characters");
        SensitiveContent.check(path, path, s);
        return s;
    }

    private static Instant bound(String s, String path, boolean endOfDay) {
        String v = s.trim();
        try {
            if (v.length() == 10) {
                LocalDate d = LocalDate.parse(v);
                return (endOfDay ? d.plusDays(1) : d).atStartOfDay(ZoneOffset.UTC).toInstant();
            }
            return instant(new com.fasterxml.jackson.databind.node.TextNode(v), path, true);
        } catch (DateTimeParseException e) {
            throw TrackerException.invalid(path, "must be a date (yyyy-MM-dd) or an ISO-8601 date-time");
        }
    }
}
