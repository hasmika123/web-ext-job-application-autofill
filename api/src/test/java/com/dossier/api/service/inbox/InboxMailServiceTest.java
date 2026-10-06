package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import org.junit.jupiter.api.Test;

/** The board side of the inbox (Phase 14.4b): the stage a suggestion lands at, the snippet. */
class InboxMailServiceTest {

    @Test
    void aSuggestionLandsAtTheStageItsMailShowed() {
        assertThat(InboxMailService.stageOf(MailClassifier.Category.APPLIED)).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(InboxMailService.stageOf(MailClassifier.Category.ASSESSMENT)).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(InboxMailService.stageOf(MailClassifier.Category.INTERVIEW)).isEqualTo(ApplicationStatus.INTERVIEW);
        assertThat(InboxMailService.stageOf(MailClassifier.Category.OFFER)).isEqualTo(ApplicationStatus.OFFER);
        assertThat(InboxMailService.stageOf(null)).isEqualTo(ApplicationStatus.SAVED);
    }

    @Test
    void snippetsAreShortAndFlat() {
        assertThat(InboxMailService.snippet("Hi Sam,\n\n  thanks")).isEqualTo("Hi Sam, thanks");
        assertThat(InboxMailService.snippet("x".repeat(500))).hasSize(InboxMailService.SNIPPET);
        assertThat(InboxMailService.snippet(null)).isNull();
    }
}
