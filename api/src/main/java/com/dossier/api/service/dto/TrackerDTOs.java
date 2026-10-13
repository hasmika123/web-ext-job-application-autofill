package com.dossier.api.service.dto;

import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.ApplicationNote;
import com.dossier.api.domain.Interview;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The shapes of the applications tracker's v2 API (APP-E2E U6.1/U6.2/U6.4): history events, notes,
 * interviews, the paged list with its tab counts, bulk results. The list shape is the shared list
 * contract of the plan (section 2.4): {@code {items, total, page, size, summary}}.
 */
public final class TrackerDTOs {

    private TrackerDTOs() {}

    /** One timeline entry. {@code kind} is CREATED|STATUS|NOTE|INTERVIEW|MAIL|RESUME|ATTACHMENT|FIELD; {@code source} EXTENSION|WEB|INBOX|SYSTEM|ASSISTANT. */
    public record EventDTO(
        Long id,
        String kind,
        ApplicationStatus fromStatus,
        ApplicationStatus toStatus,
        String source,
        Long refId,
        String summary,
        Instant createdAt
    ) {
        public static EventDTO of(ApplicationEvent e) {
            return new EventDTO(e.getId(), e.getKind(), e.getFromStatus(), e.getToStatus(), e.getSource(), e.getRefId(), e.getSummary(), e.getCreatedAt());
        }
    }

    public record NoteDTO(Long id, Long applicationId, String body, boolean pinned, Instant createdAt, Instant updatedAt) {
        public static NoteDTO of(ApplicationNote n) {
            return new NoteDTO(n.getId(), n.getApplicationId(), n.getBody(), n.isPinned(), n.getCreatedAt(), n.getUpdatedAt());
        }
    }

    /**
     * One interview. {@code company}/{@code roleTitle} name the application it belongs to (filled so the
     * dashboard and prep lists need no second call); {@code outcome} is PENDING|PASSED|REJECTED|NO_SHOW.
     */
    public record InterviewDTO(
        Long id,
        Long applicationId,
        String company,
        String roleTitle,
        String kind,
        Instant startsAt,
        Instant endsAt,
        String tz,
        String location,
        String interviewer,
        String notes,
        String outcome,
        String source,
        Instant createdAt,
        Instant updatedAt
    ) {
        public static InterviewDTO of(Interview i, String company, String roleTitle) {
            return new InterviewDTO(
                i.getId(),
                i.getApplicationId(),
                company,
                roleTitle,
                i.getKind(),
                i.getStartsAt(),
                i.getEndsAt(),
                i.getTz(),
                i.getLocation(),
                i.getInterviewer(),
                i.getNotes(),
                i.getOutcome(),
                i.getSource(),
                i.getCreatedAt(),
                i.getUpdatedAt()
            );
        }
    }

    /** One day of tracker activity: {@code day} is an ISO date (yyyy-MM-dd) in the requested zone. */
    public record ActivityDay(String day, int count) {}

    /** An inbox reading that would have moved this application, but it is archived (shown in the Emails tab). */
    public record Suggestion(Long inboxMessageId, ApplicationStatus to, String subject, Instant sentAt) {}

    /**
     * OpenAPI-only name for {@code ListPage<ApplicationDTO>} (the shared list shape, with the per-tab counts in
     * {@code summary}): springdoc cannot see the type argument through {@code ResponseEntity<?>}. Never instantiated;
     * the endpoint returns the shared {@link ListPage}.
     */
    public record ApplicationListPage(List<ApplicationDTO> items, long total, int page, int size, Map<String, Long> summary) {}

    /**
     * The fields of {@code PATCH /api/profile/applications/{id}}. Documentation shape only: the endpoint reads
     * the body as JSON so that an absent field (leave it) differs from {@code null} (clear it).
     */
    public record ApplicationPatchRequest(
        ApplicationStatus status,
        String nextAction,
        Instant nextActionAt,
        Boolean starred,
        Boolean archived,
        Long resumeId,
        String outcome
    ) {}

    /** The body of an interview create / update (documentation shape; the endpoints read it as JSON, absent = unchanged). */
    public record InterviewRequest(String kind, Instant startsAt, Instant endsAt, String tz, String location, String interviewer, String notes) {}

    /** The body of {@code POST .../outcome}: PENDING | PASSED | REJECTED | NO_SHOW. */
    public record OutcomeRequest(String outcome) {}

    /** The body of a note create / update (documentation shape; the endpoints read it as JSON, absent = unchanged). */
    public record NoteRequest(String body, Boolean pinned) {}

    /** {@code action}: ARCHIVE | UNARCHIVE | STATUS (needs {@code status}) | STAR | UNSTAR. */
    public record BulkRequest(List<Long> ids, String action, ApplicationStatus status) {}

    public record BulkFailure(Long id, String reason) {}

    /** What a bulk call did, per id: {@code done} and {@code failed} (reason NOT_FOUND). */
    public record BulkResult(List<Long> done, List<BulkFailure> failed) {}

    /** The application with everything the detail sheet shows. */
    public static class ApplicationDetailDTO extends ApplicationDTO {

        private static final long serialVersionUID = 1L;

        private List<EventDTO> events = List.of();
        private List<NoteDTO> notes = List.of();
        private List<InterviewDTO> interviews = List.of();
        private List<Suggestion> suggestions = List.of();

        public List<EventDTO> getEvents() {
            return events;
        }

        public void setEvents(List<EventDTO> events) {
            this.events = events;
        }

        public List<NoteDTO> getNotes() {
            return notes;
        }

        public void setNotes(List<NoteDTO> notes) {
            this.notes = notes;
        }

        public List<InterviewDTO> getInterviews() {
            return interviews;
        }

        public void setInterviews(List<InterviewDTO> interviews) {
            this.interviews = interviews;
        }

        public List<Suggestion> getSuggestions() {
            return suggestions;
        }

        public void setSuggestions(List<Suggestion> suggestions) {
            this.suggestions = suggestions;
        }
    }
}
