package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxHold;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxHoldRepository;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The gate between reading a mail and changing an application (inbox-safety). {@link InboxParser} asks {@link #screen} before it moves a status; the
 * answer comes from the {@link InboxDecisionPolicy} bean (by default {@link HoldingInboxDecisionPolicy}). A change that is not applied is never lost:
 * it is stored as an {@link InboxHold} the person sees, accepts or dismisses, and the person is told "N emails need your review".
 */
@Service
public class InboxSafetyService {

    private static final Logger LOG = LoggerFactory.getLogger(InboxSafetyService.class);
    static final int EVIDENCE_MAX = MailEvent.MAX_EVIDENCE;

    private final InboxDecisionPolicy policy;
    private final InboxHoldRepository holds;
    private final InboxConnectionRepository connections;
    private final ResumeBuilderSettings settings;
    private final NotificationService notifications;
    private final InboxCounters counters;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public InboxSafetyService(
        InboxDecisionPolicy policy,
        InboxHoldRepository holds,
        InboxConnectionRepository connections,
        ResumeBuilderSettings settings,
        NotificationService notifications,
        InboxCounters counters
    ) {
        this(policy, holds, connections, settings, notifications, counters, Clock.systemUTC());
    }

    InboxSafetyService(
        InboxDecisionPolicy policy,
        InboxHoldRepository holds,
        InboxConnectionRepository connections,
        ResumeBuilderSettings settings,
        NotificationService notifications,
        InboxCounters counters,
        Clock clock
    ) {
        this.policy = policy;
        this.holds = holds;
        this.connections = connections;
        this.settings = settings;
        this.notifications = notifications;
        this.counters = counters;
        this.clock = clock;
    }

    /**
     * Whether the status change {@code proposed} on {@code app} may be applied now. True = apply it. False = it was held for the person (a hold is
     * stored) or ignored; the caller must leave the status alone.
     */
    public boolean screen(Long userId, InboxMessage m, Application app, MailEvent ev, ApplicationStatus proposed) {
        boolean auto = connections.findById(userId).map(c -> c.isAutoApplyRejections()).orElse(false);
        InboxDecisionPolicy.Decision d = policy.decide(ev, new InboxDecisionPolicy.Change(app.getStatus(), proposed, auto));
        switch (d.outcome()) {
            case APPLY:
                counters.count(InboxCounters.APPLIED);
                return true;
            case HOLD:
                hold(userId, m, app, ev, proposed, d.holdReason());
                return false;
            default:
                return false;
        }
    }

    /** Two or more applications fit the mail equally: nothing is changed, the person picks. */
    public void holdAmbiguous(Long userId, InboxMessage m, MailEvent ev) {
        InboxDecisionPolicy.Decision d = policy.decide(ev, null);
        if (d.outcome() == InboxDecisionPolicy.Outcome.HOLD) hold(userId, m, null, ev, null, d.holdReason());
    }

    private void hold(Long userId, InboxMessage m, Application app, MailEvent ev, ApplicationStatus proposed, String reason) {
        if (m.getId() == null || holds.findFirstByUserIdAndMessageId(userId, m.getId()).isPresent()) return; // one hold per mail: a dismissed mail never asks again
        Instant now = Instant.now(clock);
        InboxHold h = new InboxHold();
        h.setUserId(userId);
        h.setMessageId(m.getId());
        h.setReason(reason == null ? InboxDecisionPolicy.HOLD_LOW_CONFIDENCE : reason);
        h.setCategory(ev.category() == null ? "OTHER" : ev.category().name());
        ApplicationStatus shown = proposed != null ? proposed : stageOf(ev.category());
        h.setProposedStatus(shown == null ? null : shown.name());
        h.setConfidence(ev.confidence());
        h.setEvidence(scrub(ev.evidence()));
        h.setCompany(cut(app != null ? app.getCompany() : m.getCompanyGuess(), 200));
        h.setRole(cut(app != null ? app.getRoleTitle() : m.getRoleGuess(), 300));
        h.setApplicationId(app == null ? null : app.getId());
        List<MailEvent.Candidate> candidates = ev.candidates();
        if (!candidates.isEmpty()) {
            h.setCandidateIds(candidates.stream().map(c -> String.valueOf(c.applicationId())).distinct().collect(Collectors.joining(",")));
        }
        h.setCreatedAt(now);
        h.setExpiresAt(now.plus(Duration.ofDays(Math.max(1, settings.getInt(AdminSettingKeys.INBOX_REVIEW_EXPIRY_DAYS)))));
        holds.save(h);
        counters.count(InboxCounters.HELD);
        tell(userId, h, now);
    }

    private void tell(Long userId, InboxHold h, Instant now) {
        try {
            long pending = holds.countByUserIdAndStateAndExpiresAtAfter(userId, InboxHold.PENDING, now);
            String title = pending <= 1 ? "1 email needs your review" : pending + " emails need your review";
            notifications.publish(
                NotificationKind.APP_STATUS,
                userId,
                new NotificationService.Payload(
                    title,
                    "An email may change an application, but we did not change it for you. Look and decide.",
                    "/board",
                    null,
                    "inbox-review",
                    "inbox-review:" + h.getId(),
                    null,
                    false,
                    null
                )
            );
        } catch (RuntimeException e) {
            LOG.warn("Could not announce a held inbox change: {}", e.getClass().getSimpleName()); // never lets a notice break the read
        }
    }

    /** The stage a mail of this category points at, for showing an ambiguous mail's proposal; null for categories that move nothing. */
    static ApplicationStatus stageOf(MailClassifier.Category c) {
        if (c == null) return null;
        return switch (c) {
            case APPLIED, ASSESSMENT -> ApplicationStatus.APPLIED;
            case IN_REVIEW -> ApplicationStatus.IN_REVIEW;
            case INTERVIEW -> ApplicationStatus.INTERVIEW;
            case OFFER -> ApplicationStatus.OFFER;
            case REJECTED -> ApplicationStatus.REJECTED;
            default -> null;
        };
    }

    /** A short evidence snippet with addresses, links and long numbers taken out, at most 200 characters. */
    static String scrub(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s
            .replaceAll("https?://\\S+|www\\.\\S+", "[link]")
            .replaceAll("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+", "[email]")
            .replaceAll("\\+?\\d[\\d\\s().-]{4,}\\d", "[number]")
            .replaceAll("\\s+", " ")
            .trim();
        if (t.isEmpty()) return null;
        return t.length() > EVIDENCE_MAX ? t.substring(0, EVIDENCE_MAX - 1) + "…" : t;
    }

    private static String cut(String s, int n) {
        return s == null ? null : s.length() > n ? s.substring(0, n) : s;
    }
}
