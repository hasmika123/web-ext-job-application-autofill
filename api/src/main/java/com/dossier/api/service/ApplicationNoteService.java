package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.ApplicationNote;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationNoteRepository;
import com.dossier.api.service.dto.TrackerDTOs.NoteDTO;
import com.dossier.api.service.privacy.SensitiveContent;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The user's notes on an application (APP-E2E U6.2): add, edit (autosaved per keystroke burst, so edits
 * write no timeline event), pin, delete. The application is looked up by id and owner first, so another
 * user's application - and therefore every note on it - is a 404. Free text goes through
 * {@link SensitiveContent}: a note never holds a value the product refuses to store (422
 * {@code SENSITIVE_CONTENT}, even in a note to yourself). Length and count caps are the
 * {@code tracker.note.maxChars} and {@code tracker.notes.maxPerApplication} settings.
 */
@Service
@Transactional
public class ApplicationNoteService {

    private final TrackerUsers trackerUsers;
    private final ApplicationNoteRepository notes;
    private final ApplicationEventService eventService;
    private final ResumeBuilderSettings settings;

    public ApplicationNoteService(
        TrackerUsers trackerUsers,
        ApplicationNoteRepository notes,
        ApplicationEventService eventService,
        ResumeBuilderSettings settings
    ) {
        this.trackerUsers = trackerUsers;
        this.notes = notes;
        this.eventService = eventService;
        this.settings = settings;
    }

    @Transactional(readOnly = true)
    public List<NoteDTO> list(Long applicationId) {
        Application app = owned(applicationId);
        return notes.findByApplicationIdOrderByPinnedDescCreatedAtDescIdDesc(app.getId()).stream().map(NoteDTO::of).toList();
    }

    /** {@code {body, pinned?}}: one NOTE event ("Note added") joins the timeline. */
    public NoteDTO create(Long applicationId, ObjectNode body) {
        Application app = owned(applicationId);
        String text = body(body.get("body"), true);
        int cap = settings.getInt(ResumeBuilderSettingKeys.TRACKER_NOTES_MAX_PER_APPLICATION);
        if (notes.countByApplicationId(app.getId()) >= cap) {
            throw TrackerException.limit("An application holds at most " + cap + " notes", cap);
        }
        ApplicationNote n = new ApplicationNote();
        n.setApplicationId(app.getId());
        n.setBody(text);
        n.setPinned(body.has("pinned") && pinned(body.get("pinned")));
        Instant now = Instant.now();
        n.setCreatedAt(now);
        n.setUpdatedAt(now);
        notes.save(n);
        eventService.record(app, ApplicationEvent.NOTE, null, null, ApplicationEvent.SRC_WEB, n.getId(), "Note added");
        return NoteDTO.of(n);
    }

    /** Partial: only the fields sent change ({@code body}, {@code pinned}). */
    public NoteDTO update(Long applicationId, Long noteId, ObjectNode body) {
        Application app = owned(applicationId);
        ApplicationNote n = notes
            .findOneByIdAndApplicationId(noteId, app.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found"));
        if (body.has("body")) n.setBody(body(body.get("body"), true));
        if (body.has("pinned")) n.setPinned(pinned(body.get("pinned")));
        n.setUpdatedAt(Instant.now());
        return NoteDTO.of(notes.save(n));
    }

    public void delete(Long applicationId, Long noteId) {
        Application app = owned(applicationId);
        ApplicationNote n = notes
            .findOneByIdAndApplicationId(noteId, app.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found"));
        notes.delete(n);
    }

    private Application owned(Long applicationId) {
        User user = trackerUsers.current();
        return trackerUsers.application(user, applicationId);
    }

    private String body(JsonNode n, boolean required) {
        if (n == null || n.isNull()) {
            if (required) throw TrackerException.invalid("body", "write something");
            return null;
        }
        if (!n.isTextual()) throw TrackerException.invalid("body", "must be text");
        String v = n.textValue();
        if (v.isBlank()) throw TrackerException.invalid("body", "write something");
        int max = settings.getInt(ResumeBuilderSettingKeys.TRACKER_NOTE_MAX_CHARS);
        if (v.length() > max) throw TrackerException.invalid("body", "is longer than " + max + " characters");
        SensitiveContent.check("body", "note", v);
        return v;
    }

    private static boolean pinned(JsonNode n) {
        if (n == null || !n.isBoolean()) throw TrackerException.invalid("pinned", "must be true or false");
        return n.booleanValue();
    }
}
