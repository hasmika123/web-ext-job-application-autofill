package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.InboxHold;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxHoldRepository;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class InboxSafetyServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-01T10:00:00Z");

    private InboxHoldRepository holds;
    private InboxConnectionRepository connections;
    private NotificationService notifications;
    private InboxDecisionPolicy policy;
    private SimpleMeterRegistry registry;
    private InboxSafetyService service;

    @BeforeEach
    void setUp() {
        holds = mock(InboxHoldRepository.class);
        connections = mock(InboxConnectionRepository.class);
        notifications = mock(NotificationService.class);
        policy = mock(InboxDecisionPolicy.class);
        ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
        when(settings.getInt(AdminSettingKeys.INBOX_REVIEW_EXPIRY_DAYS)).thenReturn(30);
        registry = new SimpleMeterRegistry();
        service = new InboxSafetyService(policy, holds, connections, settings, notifications, new InboxCounters(registry), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static InboxMessage mail(long id) {
        InboxMessage m = mock(InboxMessage.class);
        when(m.getId()).thenReturn(id);
        return m;
    }

    private static Application app() {
        Application a = new Application().company("Initech").roleTitle("Engineer").status(ApplicationStatus.INTERVIEW);
        a.setId(5L);
        return a;
    }

    private static MailEvent event(String evidence, List<MailEvent.Candidate> candidates) {
        return new MailEvent(9L, MailClassifier.Category.REJECTED, 92, 92, 92, MailEvent.MatchKind.THREAD, 5L, candidates, null, evidence);
    }

    private double counter(String outcome) {
        var c = registry.find("inbox.changes").tag("outcome", outcome).counter();
        return c == null ? 0 : c.count();
    }

    @Test
    void anAppliedChangeIsCountedAndNothingIsStored() {
        when(policy.decide(any(), any())).thenReturn(InboxDecisionPolicy.Decision.APPLY);
        assertThat(service.screen(1L, mail(9L), app(), event("x", List.of()), ApplicationStatus.OFFER)).isTrue();
        verify(holds, never()).save(any());
        assertThat(counter("applied")).isEqualTo(1);
    }

    @Test
    void aHeldRejectionIsStoredWithScrubbedEvidenceAndTheUserIsTold() {
        when(policy.decide(any(), any())).thenReturn(InboxDecisionPolicy.Decision.hold(InboxDecisionPolicy.HOLD_DESTRUCTIVE));
        when(holds.findFirstByUserIdAndMessageId(1L, 9L)).thenReturn(Optional.empty());
        when(holds.countByUserIdAndStateAndExpiresAtAfter(eq(1L), eq(InboxHold.PENDING), any())).thenReturn(3L);

        boolean applied = service.screen(
            1L,
            mail(9L),
            app(),
            event("We regret to inform you. Write to jane.doe@initech.com or call +1 (555) 123-4567 or see https://initech.com/x", List.of()),
            ApplicationStatus.REJECTED
        );

        assertThat(applied).isFalse();
        ArgumentCaptor<InboxHold> saved = ArgumentCaptor.forClass(InboxHold.class);
        verify(holds).save(saved.capture());
        InboxHold h = saved.getValue();
        assertThat(h.getReason()).isEqualTo("DESTRUCTIVE");
        assertThat(h.getApplicationId()).isEqualTo(5L);
        assertThat(h.getProposedStatus()).isEqualTo("REJECTED");
        assertThat(h.getState()).isEqualTo(InboxHold.PENDING);
        assertThat(h.getExpiresAt()).isEqualTo(NOW.plus(Duration.ofDays(30)));
        assertThat(h.getEvidence()).doesNotContain("@", "555", "http").hasSizeLessThanOrEqualTo(200);
        assertThat(counter("held")).isEqualTo(1);
        ArgumentCaptor<NotificationService.Payload> payload = ArgumentCaptor.forClass(NotificationService.Payload.class);
        verify(notifications).publish(any(), eq(1L), payload.capture());
        assertThat(payload.getValue().title()).isEqualTo("3 emails need your review");
        assertThat(payload.getValue().emailWorthy()).isFalse();
    }

    @Test
    void oneHoldPerMail() {
        when(policy.decide(any(), any())).thenReturn(InboxDecisionPolicy.Decision.hold(InboxDecisionPolicy.HOLD_DESTRUCTIVE));
        when(holds.findFirstByUserIdAndMessageId(1L, 9L)).thenReturn(Optional.of(new InboxHold()));
        assertThat(service.screen(1L, mail(9L), app(), event("x", List.of()), ApplicationStatus.REJECTED)).isFalse();
        verify(holds, never()).save(any());
    }

    @Test
    void theRejectionSwitchIsPassedToThePolicy() {
        InboxConnection c = new InboxConnection();
        c.setAutoApplyRejections(true);
        when(connections.findById(1L)).thenReturn(Optional.of(c));
        when(policy.decide(any(), any())).thenReturn(InboxDecisionPolicy.Decision.APPLY);
        service.screen(1L, mail(9L), app(), event("x", List.of()), ApplicationStatus.REJECTED);
        ArgumentCaptor<InboxDecisionPolicy.Change> change = ArgumentCaptor.forClass(InboxDecisionPolicy.Change.class);
        verify(policy).decide(any(), change.capture());
        assertThat(change.getValue().autoApplyRejections()).isTrue();
        assertThat(change.getValue().current()).isEqualTo(ApplicationStatus.INTERVIEW);
    }

    @Test
    void anAmbiguousMailIsHeldWithItsCandidatesAndNoApplication() {
        when(policy.decide(any(), any())).thenReturn(InboxDecisionPolicy.Decision.hold(InboxDecisionPolicy.HOLD_AMBIGUOUS));
        when(holds.findFirstByUserIdAndMessageId(1L, 9L)).thenReturn(Optional.empty());
        MailEvent e = new MailEvent(
            9L,
            MailClassifier.Category.INTERVIEW,
            40,
            90,
            40,
            MailEvent.MatchKind.AMBIGUOUS,
            null,
            List.of(new MailEvent.Candidate(11L, 50, MailEvent.MatchKind.COMPANY, "a"), new MailEvent.Candidate(12L, 50, MailEvent.MatchKind.COMPANY, "b")),
            null,
            "Interview"
        );
        service.holdAmbiguous(1L, mail(9L), e);
        ArgumentCaptor<InboxHold> saved = ArgumentCaptor.forClass(InboxHold.class);
        verify(holds).save(saved.capture());
        assertThat(saved.getValue().getApplicationId()).isNull();
        assertThat(saved.getValue().getCandidateIds()).isEqualTo("11,12");
        assertThat(saved.getValue().getProposedStatus()).isEqualTo("INTERVIEW");
    }

    @Test
    void scrubTakesOutAddressesLinksAndNumbers() {
        assertThat(InboxSafetyService.scrub("Mail a@b.co now https://x.y/z 123456789")).isEqualTo("Mail [email] now [link] [number]");
        assertThat(InboxSafetyService.scrub("  ")).isNull();
        assertThat(InboxSafetyService.scrub("a".repeat(500))).hasSize(200);
    }
}
