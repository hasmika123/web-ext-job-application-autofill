package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InterviewRepository;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.InboxInterviewChanged;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.tracker.ChangeActor;
import com.dossier.api.service.tracker.Changes;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Puts what an interview mail says on the matched application: the interview itself (created, moved to a new time, or called off), a line on the
 * application's timeline in plain words, and, for the consultant who shares in full, the same time on their organization's Interviews page
 * ({@link InboxInterviewChanged}, which carries a time and a kind and never a word of the mail).
 *
 * <ul>
 *   <li><b>Created</b> once per (application, calendar UID), or (application, start) when the mail has no UID. Source {@code INBOX}, actor "by Inbox".</li>
 *   <li><b>Rescheduled</b>: the same UID with a higher SEQUENCE, or wording like "rescheduled to ..." when the application has one open interview. The row
 *       is updated and the earlier time is kept in its history; the reminder markers are cleared so the new time gets its reminders.</li>
 *   <li><b>Cancelled</b>: the row is marked {@code CANCELLED}. The application's status is not touched (see {@link #statusAfter}).</li>
 *   <li><b>Not read</b>: no time, or a reading below {@code inbox.interview_min_confidence}: no interview row (we never invent a time), only a note on the
 *       timeline so the person can enter it. The status still moves to Interview.</li>
 * </ul>
 *
 * Nothing here ever writes to the mailbox, and the mail's text never reaches the interview, the timeline or the organization: only extracted fields do.
 */
@Component
public class InboxInterviewApplier {

    private static final Logger LOG = LoggerFactory.getLogger(InboxInterviewApplier.class);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE MMM d, h:mm a z", Locale.ENGLISH);
    static final String LINK_PREFIX = "Meeting link: ";
    private static final int HISTORY_MAX = 1000;

    /** What happened. */
    public enum Result {
        CREATED,
        RESCHEDULED,
        CANCELLED,
        UNCHANGED,
        NOT_READ,
        NOTHING,
    }

    private final InterviewRepository interviews;
    private final ApplicationRepository applications;
    private final ApplicationEventService eventService;
    private final ResumeBuilderSettings settings;
    private final ApplicationEventPublisher publisher;

    public InboxInterviewApplier(
        InterviewRepository interviews,
        ApplicationRepository applications,
        ApplicationEventService eventService,
        ResumeBuilderSettings settings,
        ApplicationEventPublisher publisher
    ) {
        this.interviews = interviews;
        this.applications = applications;
        this.eventService = eventService;
        this.settings = settings;
        this.publisher = publisher;
    }

    /** Reads the schedule of a mail (pure; nothing is written). */
    public ExtractedSchedule read(InboxMessage m) {
        return InterviewScheduleExtractor.extract(
            m.getSubject(),
            m.getBodyText(),
            MailCalendar.parse(m.getCalendarEvent()),
            m.getSentAt(),
            mailZone(m.getSentZone()),
            null // the person's own zone is not kept on the profile yet: the mail's zone, then UTC, are used
        );
    }

    /**
     * The status an interview mail leads to: forward only (as {@link MailMatcher#next}), and a cancellation changes nothing: an interview called off is
     * not a step back, nor a step forward.
     */
    public static ApplicationStatus statusAfter(ApplicationStatus current, ExtractedSchedule schedule) {
        if (schedule != null && schedule.cancelled()) return null;
        return MailMatcher.next(current, MailClassifier.Category.INTERVIEW);
    }

    @Transactional
    public Result apply(Long userId, Long applicationId, InboxMessage m, ExtractedSchedule s) {
        try {
            Application app = applications.findById(applicationId).orElse(null);
            if (app == null || s == null) return Result.NOTHING;
            List<Interview> mine = interviews.findByApplicationIdAndUserIdOrderByStartsAtDescIdDesc(applicationId, userId);
            if (s.cancelled()) return cancel(userId, app, m, s, mine);
            int min = settings.getInt(AdminSettingKeys.INBOX_INTERVIEW_MIN_CONFIDENCE);
            boolean usable = s.scheduled() && s.confidence() >= min && !inThePast(s, m);
            if (!usable) {
                Optional<Interview> known = find(mine, s, m);
                if (known.isPresent() && s.scheduled()) return Result.UNCHANGED;
                note(app, m, "Interview invitation read, but the time could not be read from the email. Add the interview yourself.");
                return Result.NOT_READ;
            }
            Optional<Interview> existing = find(mine, s, m);
            return existing.isPresent() ? reschedule(userId, app, m, s, existing.get()) : create(userId, app, m, s, mine);
        } catch (RuntimeException e) {
            LOG.warn("Applying an interview mail failed: {}", e.getClass().getSimpleName());
            return Result.NOTHING;
        }
    }

    // ---- create -------------------------------------------------------------------------------------------------------------------------------

    private Result create(Long userId, Application app, InboxMessage m, ExtractedSchedule s, List<Interview> mine) {
        int cap = settings.getInt(ResumeBuilderSettingKeys.TRACKER_INTERVIEWS_MAX_PER_APPLICATION);
        if (mine.size() >= cap) return Result.NOTHING;
        Instant now = Instant.now();
        Interview i = new Interview();
        i.setApplicationId(app.getId());
        i.setUserId(userId);
        i.setSource(Interview.SRC_INBOX);
        i.setOutcome(Interview.PENDING);
        i.setInboxMessageId(m.getId());
        fill(i, s);
        i.setCreatedAt(now);
        i.setUpdatedAt(now);
        interviews.save(i);
        eventService.record(app, ApplicationEvent.INTERVIEW, null, null, ApplicationEvent.SRC_INBOX, i.getId(), "Interview " + describe(s), ChangeActor.mail(), null);
        applications.save(app);
        publish(userId, app, i, false);
        return Result.CREATED;
    }

    private Result reschedule(Long userId, Application app, InboxMessage m, ExtractedSchedule s, Interview i) {
        if (s.sequence() != null && i.getSequenceNo() != null && s.sequence() < i.getSequenceNo()) return Result.UNCHANGED; // an older version of the invitation
        boolean sameTime = i.getStartsAt().equals(s.startUtc());
        boolean wasCancelled = Interview.CANCELLED.equals(i.getOutcome());
        if (sameTime && !wasCancelled && (s.sequence() == null || s.sequence().equals(i.getSequenceNo()))) return Result.UNCHANGED;
        Instant before = i.getStartsAt();
        Duration length = i.getEndsAt() != null && before != null ? Duration.between(before, i.getEndsAt()) : null;
        if (!sameTime) i.setScheduleHistory(history(i.getScheduleHistory(), before));
        fill(i, s);
        if (s.endUtc() == null && length != null && !length.isNegative() && !length.isZero()) i.setEndsAt(i.getStartsAt().plus(length)); // "moved to 3:30": still half an hour
        if (wasCancelled) i.setOutcome(Interview.PENDING);
        i.setReminder24hSentAt(null);
        i.setReminder1hSentAt(null);
        i.setInboxMessageId(m.getId());
        i.setUpdatedAt(Instant.now());
        interviews.save(i);
        Changes changes = new Changes().instant("startsAt", before, i.getStartsAt());
        String summary = sameTime ? "Interview updated: " + describe(s) : "Interview rescheduled: " + describe(s) + " (was " + when(before, i.getTz()) + ")";
        eventService.record(app, ApplicationEvent.INTERVIEW, null, null, ApplicationEvent.SRC_INBOX, i.getId(), summary, ChangeActor.mail(), changes);
        applications.save(app);
        publish(userId, app, i, false);
        return Result.RESCHEDULED;
    }

    private Result cancel(Long userId, Application app, InboxMessage m, ExtractedSchedule s, List<Interview> mine) {
        Interview target = find(mine, s, m).orElse(null);
        if (target == null || Interview.CANCELLED.equals(target.getOutcome())) return Result.NOTHING;
        String before = target.getOutcome();
        target.setOutcome(Interview.CANCELLED);
        if (s.sequence() != null) target.setSequenceNo(s.sequence());
        target.setUpdatedAt(Instant.now());
        interviews.save(target);
        eventService.record(
            app,
            ApplicationEvent.INTERVIEW,
            null,
            null,
            ApplicationEvent.SRC_INBOX,
            target.getId(),
            "Interview cancelled: " + when(target.getStartsAt(), target.getTz()),
            ChangeActor.mail(),
            new Changes().code("outcome", before, Interview.CANCELLED)
        );
        applications.save(app);
        publish(userId, app, target, true);
        return Result.CANCELLED;
    }

    private void note(Application app, InboxMessage m, String text) {
        eventService.record(app, ApplicationEvent.INTERVIEW, null, null, ApplicationEvent.SRC_INBOX, null, text, ChangeActor.mail(), null);
        applications.save(app);
    }

    private void publish(Long userId, Application app, Interview i, boolean cancelled) {
        if (publisher != null) publisher.publishEvent(new InboxInterviewChanged(userId, app.getId(), i.getId(), i.getStartsAt(), i.getEndsAt(), i.getKind(), cancelled));
    }

    // ---- finding the interview a mail is about ------------------------------------------------------------------------------------------

    /**
     * By calendar UID; else the same start (the same mail seen twice, or a cancellation that names the time); else, for a reschedule or a cancellation
     * that names no time, the application's only open interview.
     */
    static Optional<Interview> find(List<Interview> mine, ExtractedSchedule s, InboxMessage m) {
        if (s.uid() != null) {
            Optional<Interview> byUid = mine.stream().filter(i -> s.uid().equals(i.getExternalUid())).findFirst();
            if (byUid.isPresent()) return byUid;
        }
        if (s.scheduled()) {
            Optional<Interview> sameStart = mine
                .stream()
                .filter(i -> i.getStartsAt() != null && Math.abs(Duration.between(i.getStartsAt(), s.startUtc()).toMinutes()) < 1)
                .filter(i -> s.uid() == null || i.getExternalUid() == null)
                .findFirst();
            if (sameStart.isPresent()) return sameStart;
        }
        if (s.rescheduled() || s.cancelled()) {
            Instant since = (m.getSentAt() == null ? Instant.now() : m.getSentAt()).minus(Duration.ofDays(1));
            List<Interview> open = mine
                .stream()
                .filter(i -> Interview.PENDING.equals(i.getOutcome()) && i.getStartsAt() != null && i.getStartsAt().isAfter(since))
                .filter(i -> s.uid() == null || i.getExternalUid() == null || i.getExternalUid().equals(s.uid()))
                .toList();
            if (open.size() == 1) return Optional.of(open.get(0));
        }
        return Optional.empty();
    }

    private static boolean inThePast(ExtractedSchedule s, InboxMessage m) {
        // An invitation cannot be for a time long before it was sent: that is a misread date, not an interview.
        return m.getSentAt() != null && s.startUtc().isBefore(m.getSentAt().minus(Duration.ofDays(1)));
    }

    // ---- fields -----------------------------------------------------------------------------------------------------------------------------

    private static void fill(Interview i, ExtractedSchedule s) {
        i.setKind(Interview.KINDS.contains(s.kind()) ? s.kind() : "OTHER");
        i.setStartsAt(s.startUtc());
        i.setEndsAt(s.endUtc());
        i.setTz(s.zoneId() == null || s.zoneId().length() > 48 ? null : s.zoneId());
        if (s.location() != null) i.setLocation(s.location());
        if (s.link() != null && (i.getNotes() == null || i.getNotes().startsWith(LINK_PREFIX))) i.setNotes(LINK_PREFIX + s.link());
        if (s.uid() != null) i.setExternalUid(s.uid());
        if (s.sequence() != null) i.setSequenceNo(s.sequence());
    }

    static String history(String existing, Instant before) {
        String line = before.toString();
        String all = existing == null || existing.isBlank() ? line : line + "\n" + existing;
        return all.length() > HISTORY_MAX ? all.substring(0, all.lastIndexOf('\n', HISTORY_MAX) > 0 ? all.lastIndexOf('\n', HISTORY_MAX) : HISTORY_MAX) : all;
    }

    /** "Tue Oct 27, 2:00 PM PDT, video, link: zoom.us" - the schedule in plain words. Never any text of the mail. */
    static String describe(ExtractedSchedule s) {
        StringBuilder sb = new StringBuilder(when(s.startUtc(), s.zoneId()));
        sb.append(", ").append(kindWord(s.kind()));
        if (s.link() != null) sb.append(", link: ").append(hostOf(s.link()));
        if (s.location() != null) sb.append(", ").append(s.location());
        return sb.toString();
    }

    static String when(Instant at, String zoneId) {
        ZoneId zone = ZoneOffset.UTC;
        try {
            if (zoneId != null) zone = ZoneId.of(zoneId);
        } catch (DateTimeException e) {
            // keep UTC
        }
        return WHEN.format(at.atZone(zone));
    }

    private static String kindWord(String kind) {
        return switch (kind == null ? "" : kind) {
            case "PHONE" -> "phone";
            case "VIDEO" -> "video";
            case "ONSITE" -> "onsite";
            case "TECHNICAL" -> "technical";
            case "PANEL" -> "panel";
            case "BEHAVIORAL" -> "behavioral";
            default -> "interview";
        };
    }

    private static String hostOf(String link) {
        try {
            String h = new URI(link).getHost();
            return h == null ? "link" : h;
        } catch (URISyntaxException e) {
            return "link";
        }
    }

    private static ZoneId mailZone(String sentZone) {
        if (sentZone == null || sentZone.isBlank()) return null;
        try {
            return ZoneOffset.of(sentZone);
        } catch (DateTimeException e) {
            return null;
        }
    }
}
