package com.dossier.api.service.ent.consultantws;

import java.time.Instant;
import java.util.List;

/**
 * The shapes of the consultant workspace Inbox page (ent-inbox, docs/enterprise-v2/18-consultant-inbox.md). They are answered to the consultant
 * about THEIR OWN mailbox and to nobody else: no organization route, role or report ever carries one of these. There is no field for the app
 * password, in any form, and none for a message body.
 */
public final class ConsultantInboxDTO {

    private ConsultantInboxDTO() {}

    /**
     * @param entitled    whether the consultant's organization license includes inbox tracking right now. When false the page
     *                    explains it; a connection that exists is not read.
     * @param status      CONNECTED | ERROR | NEEDS_RECONNECT | NO_ENTITLEMENT, or null when nothing is connected
     * @param stoppedNote the sentence for a stopped connection ("Your organization no longer includes inbox tracking."), else null
     * @param sandbox     true on the demo stack, where the mailbox is a built-in sample and no real Gmail is ever contacted
     * @param sandboxAddress the one sample address that stack accepts (a test value), else null
     */
    public record View(
        boolean entitled,
        boolean available,
        boolean connected,
        String address,
        String status,
        Instant connectedAt,
        Instant lastCheckedAt,
        String lastError,
        String stoppedNote,
        long messages,
        boolean notifyEmail,
        boolean sandbox,
        String sandboxAddress
    ) {}

    /** A job the consultant's mail shows that their board does not track yet. */
    public record Suggestion(Long id, String company, String role, String category, String stage, String subject, String fromName, String fromAddress, Instant sentAt) {}

    /** One application the mail is tracking, as the consultant sees it: its current stage and how the newest matched mail was read, always "from your inbox"; the organization sees only the resulting stage elsewhere. */
    public record Update(
        Long applicationId,
        String company,
        String role,
        String stage,
        String stageLabel,
        String reading,
        Instant at,
        String source,
        UpdateInterview interview,
        UpdateUndo undo
    ) {}

    /**
     * The interview the inbox read from the mail for that application (the soonest upcoming one that is not cancelled, else the most recent one).
     * {@code link} is an https meeting link or null; {@code location} the place or null. No subject, sender or body text.
     */
    public record UpdateInterview(Long id, Instant startsAt, String tz, String kind, String link, String location, boolean cancelled) {}

    /** The change the inbox applied to that application, as the timeline's undo sees it: the event to hand to the undo route and whether it is still inside the window. */
    public record UpdateUndo(String eventId, boolean undoable) {}

    public record Page(View inbox, List<Suggestion> suggestions, List<Update> updates) {}

    public record ConnectRequest(String address, String appPassword) {}

    public record AcceptRequest(String company, String roleTitle) {}

    public record NotifyRequest(Boolean email) {}
}
