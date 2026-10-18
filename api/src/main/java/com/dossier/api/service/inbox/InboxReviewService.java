package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.InboxHold;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxHoldRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.ApplicationDerivations;
import com.dossier.api.service.ApplicationEventService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ResumeDocException;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.tracker.ChangeActor;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Seeing and reversing what the inbox did (inbox-safety). Everything here is answered to ONE user about their own holds, mail and applications: every
 * method takes the user id and a row that is not theirs is the generic 404. The personal routes pass the signed-in user; the consultant workspace passes
 * the consultant (after its own gate) - the organization never reaches this class.
 *
 * <ul>
 *   <li>{@link #list}: what the inbox held and why (a rejection, a weak reading, an ambiguous match, a move backwards).</li>
 *   <li>{@link #accept}: the person's yes - the change is applied, written to the timeline by the person.</li>
 *   <li>{@link #dismiss}: the person's no - remembered, the same mail never asks again.</li>
 *   <li>{@link #undo}: puts back the status an inbox change replaced, inside {@code inbox.undo_window_days}.</li>
 * </ul>
 */
@Service
public class InboxReviewService {

    public record Candidate(Long applicationId, String company, String role) {}

    public record Item(
        Long id,
        String kind,
        Long applicationId,
        String company,
        String role,
        String currentStatus,
        String proposedStatus,
        int confidence,
        String evidence,
        List<Candidate> candidates,
        Instant createdAt,
        Instant expiresAt
    ) {}

    public record ReviewList(List<Item> items, int count) {}

    public record AppState(Long id, String status) {}

    public record Applied(AppState application) {}

    public record Settings(boolean applyRejectionsAutomatically) {}

    public static final String CODE_UNDO_EXPIRED = "UNDO_EXPIRED";
    public static final String CODE_CHANGED_SINCE = "CHANGED_SINCE";
    public static final String CODE_HOLD_CLOSED = "HOLD_CLOSED";
    public static final String CODE_APPLICATION_REQUIRED = "APPLICATION_REQUIRED";

    private final InboxHoldRepository holds;
    private final InboxMessageRepository messages;
    private final ApplicationRepository applications;
    private final ApplicationEventRepository eventRows;
    private final ApplicationEventService events;
    private final InboxConnectionRepository connections;
    private final UserRepository users;
    private final ResumeBuilderSettings settings;
    private final InboxCounters counters;
    private final Clock clock;

    public InboxReviewService(
        InboxHoldRepository holds,
        InboxMessageRepository messages,
        ApplicationRepository applications,
        ApplicationEventRepository eventRows,
        ApplicationEventService events,
        InboxConnectionRepository connections,
        UserRepository users,
        ResumeBuilderSettings settings,
        InboxCounters counters
    ) {
        this(holds, messages, applications, eventRows, events, connections, users, settings, counters, Clock.systemUTC());
    }

    InboxReviewService(
        InboxHoldRepository holds,
        InboxMessageRepository messages,
        ApplicationRepository applications,
        ApplicationEventRepository eventRows,
        ApplicationEventService events,
        InboxConnectionRepository connections,
        UserRepository users,
        ResumeBuilderSettings settings,
        InboxCounters counters,
        Clock clock
    ) {
        this.holds = holds;
        this.messages = messages;
        this.applications = applications;
        this.eventRows = eventRows;
        this.events = events;
        this.connections = connections;
        this.users = users;
        this.settings = settings;
        this.counters = counters;
        this.clock = clock;
    }

    // ---- the signed-in person's own routes (the personal app) ---------------------------------------------------------------

    public ReviewList listMine() {
        return list(currentUserId());
    }

    public Applied acceptMine(Long holdId, Long applicationId) {
        return accept(currentUserId(), holdId, applicationId);
    }

    public void dismissMine(Long holdId) {
        dismiss(currentUserId(), holdId);
    }

    public Applied undoMine(Long applicationId, Long eventId) {
        return undo(currentUserId(), applicationId, eventId);
    }

    public Settings settingsMine() {
        return settings(currentUserId());
    }

    public Settings setSettingsMine(boolean on) {
        return setSettings(currentUserId(), on);
    }

    private Long currentUserId() {
        String login = com.dossier.api.security.SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found")).getId();
    }

    // ---- the review list ------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ReviewList list(Long userId) {
        List<InboxHold> pending = holds.findByUserIdAndStateAndExpiresAtAfterOrderByCreatedAtDesc(userId, InboxHold.PENDING, Instant.now(clock));
        Map<Long, Application> mine = new HashMap<>();
        for (Application a : applications.findByUserId(userId)) mine.put(a.getId(), a);
        List<Item> out = new ArrayList<>();
        for (InboxHold h : pending) {
            List<Candidate> candidates = new ArrayList<>();
            for (Long id : ids(h.getCandidateIds())) {
                Application a = mine.get(id);
                if (a != null && !Boolean.TRUE.equals(a.getArchived())) candidates.add(new Candidate(a.getId(), a.getCompany(), a.getRoleTitle()));
            }
            Application app = h.getApplicationId() == null ? null : mine.get(h.getApplicationId());
            if (h.getApplicationId() != null && app == null) continue; // the application was deleted: nothing left to decide
            if (h.getApplicationId() == null && candidates.isEmpty()) continue;
            out.add(
                new Item(
                    h.getId(),
                    kindOf(h.getReason()),
                    h.getApplicationId(),
                    app != null ? app.getCompany() : h.getCompany(),
                    app != null ? app.getRoleTitle() : h.getRole(),
                    app == null || app.getStatus() == null ? null : app.getStatus().name(),
                    h.getProposedStatus(),
                    h.getConfidence(),
                    h.getEvidence(),
                    h.getApplicationId() != null ? List.of() : candidates,
                    h.getCreatedAt(),
                    h.getExpiresAt()
                )
            );
        }
        return new ReviewList(out, out.size());
    }

    static String kindOf(String reason) {
        if (InboxDecisionPolicy.HOLD_AMBIGUOUS.equals(reason)) return "AMBIGUOUS";
        if (InboxDecisionPolicy.HOLD_DESTRUCTIVE.equals(reason)) return "REJECTION";
        return "STATUS_CHANGE";
    }

    // ---- accept / dismiss -----------------------------------------------------------------------------------------------

    /** The person says yes. Idempotent: an accepted hold answers with the application as it is. {@code chosenApplicationId} is needed when the hold lists candidates. */
    @Transactional
    public Applied accept(Long userId, Long holdId, Long chosenApplicationId) {
        InboxHold h = holds.findOneByIdAndUserId(holdId, userId).orElseThrow(InboxReviewService::notFound);
        Instant now = Instant.now(clock);
        if (InboxHold.ACCEPTED.equals(h.getState())) {
            Long appId = h.getResolvedApplicationId() != null ? h.getResolvedApplicationId() : h.getApplicationId();
            return new Applied(state(owned(userId, appId)));
        }
        if (!InboxHold.PENDING.equals(h.getState()) || h.getExpiresAt().isBefore(now)) {
            throw new InboxReviewException(409, CODE_HOLD_CLOSED, "This email was already dealt with or has expired");
        }
        Long appId = h.getApplicationId();
        if (appId == null) {
            if (chosenApplicationId == null) throw new InboxReviewException(400, CODE_APPLICATION_REQUIRED, "Say which application this email is about");
            if (!ids(h.getCandidateIds()).contains(chosenApplicationId)) throw notFound();
            appId = chosenApplicationId;
        }
        Application app = owned(userId, appId);
        User user = users.findById(userId).orElseThrow(InboxReviewService::notFound);
        ApplicationStatus from = app.getStatus();
        ApplicationStatus to = h.getApplicationId() != null ? parse(h.getProposedStatus()) : MailMatcher.next(from, categoryOf(h.getCategory()));
        InboxMessage m = messages.findOneByIdAndUserId(h.getMessageId(), userId).orElse(null);
        if (to != null && to != from) {
            app.setStatus(to);
            if ((to == ApplicationStatus.APPLIED || to == ApplicationStatus.IN_REVIEW) && app.getAppliedAt() == null) {
                app.setAppliedAt(m != null && m.getSentAt() != null ? m.getSentAt() : now);
            }
            events.recordStatus(
                app,
                from,
                to,
                ApplicationEvent.SRC_INBOX,
                h.getMessageId(),
                "Moved to " + ApplicationDerivations.statusLabel(to) + " - from an email you confirmed",
                ChangeActor.forOwner(user)
            );
            applications.save(app);
        }
        if (m != null) {
            m.setApplicationId(app.getId());
            if (to != null && to != from) m.setStatusChange(to.name());
            messages.save(m);
        }
        h.setState(InboxHold.ACCEPTED);
        h.setResolvedAt(now);
        h.setResolvedApplicationId(app.getId());
        holds.save(h);
        counters.count(InboxCounters.ACCEPTED);
        return new Applied(state(app));
    }

    /** The person says no. Idempotent; the hold stays as DISMISSED so the same mail never asks again. */
    @Transactional
    public void dismiss(Long userId, Long holdId) {
        InboxHold h = holds.findOneByIdAndUserId(holdId, userId).orElseThrow(InboxReviewService::notFound);
        if (InboxHold.DISMISSED.equals(h.getState()) || InboxHold.EXPIRED.equals(h.getState())) return;
        if (InboxHold.ACCEPTED.equals(h.getState())) throw new InboxReviewException(409, CODE_HOLD_CLOSED, "This email was already accepted");
        h.setState(InboxHold.DISMISSED);
        h.setResolvedAt(Instant.now(clock));
        holds.save(h);
        counters.count(InboxCounters.DISMISSED);
    }

    // ---- undo -----------------------------------------------------------------------------------------------------------

    /**
     * Put back the status an inbox change replaced. The row must be an inbox status change of this person's application, inside
     * {@code inbox.undo_window_days} (else 409 {@value #CODE_UNDO_EXPIRED}), and the application must still be in the status the change gave it (else
     * 409 {@value #CODE_CHANGED_SINCE}: the person has moved it since). Idempotent. The timeline gets "Undone by you" and the mail is dismissed for good.
     */
    @Transactional
    public Applied undo(Long userId, Long applicationId, Long eventId) {
        Application app = owned(userId, applicationId);
        ApplicationEvent ev = eventRows
            .findById(eventId)
            .filter(e -> applicationId.equals(e.getApplicationId()) && ApplicationEvent.SRC_INBOX.equals(e.getSource()) && ApplicationEvent.STATUS.equals(e.getKind()))
            .orElseThrow(InboxReviewService::notFound);
        InboxMessage m = ev.getRefId() == null ? null : messages.findOneByIdAndUserId(ev.getRefId(), userId).orElse(null);
        if (m != null && m.getUndoneAt() != null) return new Applied(state(app)); // already undone
        Instant now = Instant.now(clock);
        int days = Math.max(1, settings.getInt(AdminSettingKeys.INBOX_UNDO_WINDOW_DAYS));
        if (ev.getCreatedAt() == null || ev.getCreatedAt().isBefore(now.minus(Duration.ofDays(days)))) {
            throw new InboxReviewException(409, CODE_UNDO_EXPIRED, "This change can no longer be undone");
        }
        if (ev.getFromStatus() == null || ev.getToStatus() == null || app.getStatus() != ev.getToStatus()) {
            throw new InboxReviewException(409, CODE_CHANGED_SINCE, "This application was changed after the email did");
        }
        User user = users.findById(userId).orElseThrow(InboxReviewService::notFound);
        ApplicationStatus current = app.getStatus();
        app.setStatus(ev.getFromStatus());
        events.recordStatus(app, current, ev.getFromStatus(), ApplicationEvent.SRC_WEB, ev.getId(), ApplicationEventService.UNDONE, ChangeActor.forOwner(user));
        applications.save(app);
        if (m != null) {
            m.setUndoneAt(now);
            messages.save(m);
            dismissForGood(userId, m, app.getId(), now);
        }
        counters.count(InboxCounters.UNDONE);
        return new Applied(state(app));
    }

    private void dismissForGood(Long userId, InboxMessage m, Long applicationId, Instant now) {
        InboxHold h = holds.findFirstByUserIdAndMessageId(userId, m.getId()).orElseGet(() -> {
            InboxHold n = new InboxHold();
            n.setUserId(userId);
            n.setMessageId(m.getId());
            n.setReason("UNDONE");
            n.setCategory(m.getCategory() == null ? "OTHER" : m.getCategory());
            n.setConfidence(0);
            n.setCreatedAt(now);
            n.setExpiresAt(now);
            return n;
        });
        h.setApplicationId(applicationId);
        h.setState(InboxHold.DISMISSED);
        h.setResolvedAt(now);
        holds.save(h);
    }

    // ---- the person's switch --------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Settings settings(Long userId) {
        return new Settings(connections.findById(userId).map(InboxConnection::isAutoApplyRejections).orElse(false));
    }

    /** "Apply rejections automatically", default off. It lives on the person's inbox connection: 409 when none is connected. */
    @Transactional
    public Settings setSettings(Long userId, boolean applyRejectionsAutomatically) {
        InboxConnection c = connections.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No inbox connected"));
        c.setAutoApplyRejections(applyRejectionsAutomatically);
        connections.save(c);
        return new Settings(applyRejectionsAutomatically);
    }

    // ---- helpers --------------------------------------------------------------------------------------------------------

    private Application owned(Long userId, Long applicationId) {
        if (applicationId == null) throw notFound();
        return applications
            .findById(applicationId)
            .filter(a -> a.getUser() != null && userId.equals(a.getUser().getId()))
            .orElseThrow(InboxReviewService::notFound);
    }

    private static AppState state(Application a) {
        return new AppState(a.getId(), a.getStatus() == null ? null : a.getStatus().name());
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found");
    }

    private static ApplicationStatus parse(String s) {
        try {
            return s == null ? null : ApplicationStatus.valueOf(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static MailClassifier.Category categoryOf(String s) {
        MailClassifier.Category c = InboxParser.category(s);
        return c == null ? MailClassifier.Category.OTHER : c;
    }

    static List<Long> ids(String csv) {
        List<Long> out = new ArrayList<>();
        if (csv == null || csv.isBlank()) return out;
        for (String p : csv.split(",")) {
            try {
                out.add(Long.valueOf(p.trim()));
            } catch (NumberFormatException ignored) {
                // a malformed id is skipped
            }
        }
        return out;
    }

    /** A refusal with a machine-readable code, rendered by the shared problem handler. */
    public static class InboxReviewException extends ResumeDocException {

        private static final long serialVersionUID = 1L;

        public InboxReviewException(int status, String code, String message) {
            super(status, code, message, Map.of());
        }
    }
}
