package com.dossier.api.service.inbox;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.util.Locale;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * The default policy (inbox-safety): nothing the inbox does to an application may be wrong without a way to see and reverse it, so the risky
 * changes wait for the person.
 *
 * <ul>
 *   <li>A rejection (or any closing type: a withdrawal, a filled posting) is HELD unless the person switched "apply rejections automatically" on.</li>
 *   <li>An ambiguous match, or a reading below {@code inbox.apply_min_confidence}, is HELD (below {@code inbox.suggest_min_confidence} it is ignored,
 *       as {@link DefaultInboxDecisionPolicy} does).</li>
 *   <li>A change that would move the status backwards is HELD.</li>
 *   <li>A confident, non-destructive forward change is APPLIED.</li>
 * </ul>
 */
@Primary
@Component
public class HoldingInboxDecisionPolicy implements InboxDecisionPolicy {

    private final ResumeBuilderSettings settings;

    public HoldingInboxDecisionPolicy(ResumeBuilderSettings settings) {
        this.settings = settings;
    }

    @Override
    public Decision decide(MailEvent e) {
        return decide(e, null);
    }

    @Override
    public Decision decide(MailEvent e, Change change) {
        return decide(e, change, settings.getInt(AdminSettingKeys.INBOX_APPLY_MIN_CONFIDENCE), settings.getInt(AdminSettingKeys.INBOX_SUGGEST_MIN_CONFIDENCE));
    }

    static Decision decide(MailEvent e, Change change, int applyMin, int suggestMin) {
        Decision base = DefaultInboxDecisionPolicy.decide(e, applyMin, suggestMin);
        if (base.outcome() != Outcome.APPLY) return base; // ignored, or held as ambiguous / low confidence
        if (change == null) return base;
        if (isDestructive(e, change) && !change.autoApplyRejections()) return Decision.hold(HOLD_DESTRUCTIVE);
        if (movesBackwards(change.current(), change.proposed())) return Decision.hold(HOLD_BACKWARDS);
        return base;
    }

    /** A rejection, withdrawal or closed posting: judged by the status it proposes and by the mail's category name (new closing categories are covered by name). */
    static boolean isDestructive(MailEvent e, Change change) {
        ApplicationStatus to = change == null ? null : change.proposed();
        if (to == ApplicationStatus.REJECTED || to == ApplicationStatus.WITHDRAWN) return true;
        String c = e.category() == null ? "" : e.category().name().toUpperCase(Locale.ROOT);
        return c.contains("REJECT") || c.contains("CLOSED") || c.contains("WITHDRAW") || c.contains("FILLED");
    }

    /** Pipeline order of the open statuses; a move to a lower rank, or out of a closed status back into the pipeline, is backwards. */
    static boolean movesBackwards(ApplicationStatus from, ApplicationStatus to) {
        if (from == null || to == null || from == to) return false;
        int f = rank(from), t = rank(to);
        if (f < 0) return t >= 0; // out of REJECTED / WITHDRAWN into the pipeline
        return t >= 0 && t < f;
    }

    private static int rank(ApplicationStatus s) {
        return switch (s) {
            case DRAFT, SAVED -> 0;
            case APPLIED -> 1;
            case IN_REVIEW -> 2;
            case INTERVIEW -> 3;
            case OFFER -> 4;
            case REJECTED, WITHDRAWN -> -1;
        };
    }
}
