package com.dossier.api.service.tracker;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.ApplicationDerivations;
import com.dossier.api.service.ApplicationEventService;
import java.time.Instant;

/**
 * Collects what one request changed on one application and writes it as ONE history row (docs/change-audit/README.md section 2.4): a PATCH that
 * moves the status and sets a next step is one STATUS event whose {@code changes} lists both, not two rows. The {@code summary} stays the human line
 * of the headline (the first change reported - callers report in priority order: status, next step, ...). Nothing is written when nothing changed,
 * which is also what keeps {@code application.updated_at} from running ahead of the newest event.
 */
public final class ChangeRecorder {

    private final ApplicationEventService events;
    private final Application app;
    private final String source;
    private final ChangeActor.Actor actor;
    private final Changes changes = new Changes();

    private String headline;
    private ApplicationStatus from;
    private ApplicationStatus to;
    private boolean statusChanged;
    private Long resumeRef;

    public ChangeRecorder(ApplicationEventService events, Application app, String source, ChangeActor.Actor actor) {
        this.events = events;
        this.app = app;
        this.source = source;
        this.actor = actor;
    }

    /** The status moved. A null or equal {@code after} is no change. */
    public ChangeRecorder status(ApplicationStatus before, ApplicationStatus after, String summary) {
        if (after == null || after == before) return this;
        statusChanged = true;
        from = before;
        to = after;
        changes.enumValue("status", before, after);
        headline = summary != null ? summary : "Moved to " + ApplicationDerivations.statusLabel(after);
        return this;
    }

    public ChangeRecorder code(String field, String before, String after, String summary) {
        changes.code(field, before, after);
        return note(summary);
    }

    public ChangeRecorder flag(String field, Boolean before, Boolean after, String summary) {
        changes.flag(field, before, after);
        return note(summary);
    }

    public ChangeRecorder instant(String field, Instant before, Instant after, String summary) {
        changes.instant(field, before, after);
        return note(summary);
    }

    /** A free-text field changed: its name goes in the history, its value never. */
    public ChangeRecorder text(String field, String summary) {
        changes.text(field);
        return note(summary);
    }

    public ChangeRecorder number(String field, Long before, Long after, String summary) {
        changes.number(field, before, after);
        return note(summary);
    }

    /** The linked resume changed (ids only, never the label). */
    public ChangeRecorder resume(Long before, Long after, String summary) {
        changes.number("resumeId", before, after);
        resumeRef = after;
        note(summary);
        return this;
    }

    public boolean isEmpty() {
        return changes.isEmpty();
    }

    /** Writes the one event; false (and nothing written) when nothing changed. */
    public boolean flush() {
        if (changes.isEmpty()) return false;
        String kind = statusChanged
            ? ApplicationEvent.STATUS
            : changes.size() == 1 && "resumeId".equals(changes.fields().get(0)) ? ApplicationEvent.RESUME : ApplicationEvent.FIELD;
        Long ref = ApplicationEvent.RESUME.equals(kind) ? resumeRef : null;
        events.record(app, kind, from, to, source, ref, headline, actor, changes);
        return true;
    }

    private ChangeRecorder note(String summary) {
        if (headline == null) headline = summary;
        return this;
    }
}
