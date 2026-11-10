package com.dossier.api.service.inbox;

import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import org.springframework.stereotype.Component;

/**
 * Apply when the mail is matched to one application and its confidence reaches
 * {@code inbox.apply_min_confidence}; hold as AMBIGUOUS when it is plausible ({@code inbox.suggest_min_confidence}
 * and up) but not sure, or when candidates were too close; ignore below that. Alerts and "other" mail never apply.
 */
@Component
public class DefaultInboxDecisionPolicy implements InboxDecisionPolicy {

    private final ResumeBuilderSettings settings;

    public DefaultInboxDecisionPolicy(ResumeBuilderSettings settings) {
        this.settings = settings;
    }

    @Override
    public Decision decide(MailEvent e) {
        return decide(e, settings.getInt(AdminSettingKeys.INBOX_APPLY_MIN_CONFIDENCE), settings.getInt(AdminSettingKeys.INBOX_SUGGEST_MIN_CONFIDENCE));
    }

    static Decision decide(MailEvent e, int applyMin, int suggestMin) {
        if (e.category() == null || e.category() == MailClassifier.Category.ALERT || e.category() == MailClassifier.Category.OTHER) return Decision.IGNORE;
        if (e.matchKind() == MailEvent.MatchKind.AMBIGUOUS || (e.matchedApplicationId() == null && e.candidates().size() > 1)) {
            return Decision.hold(HOLD_AMBIGUOUS);
        }
        if (e.matchedApplicationId() == null) return Decision.IGNORE;
        if (e.confidence() >= applyMin) return Decision.APPLY;
        if (e.confidence() >= suggestMin) return Decision.hold(HOLD_AMBIGUOUS);
        return Decision.IGNORE;
    }
}
