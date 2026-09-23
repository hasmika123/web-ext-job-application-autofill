package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.AiBudgetService;
import com.dossier.api.service.AiMeteringService;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

/** Mail into board updates (Phase 14.4a): the whole path, with the model mocked. */
class InboxParserTest {

    private static final Long USER = 7L;
    private static final Instant T0 = Instant.parse("2026-09-01T12:00:00Z");
    private static final AtomicLong IDS = new AtomicLong(100);

    private final List<InboxMessage> mail = new ArrayList<>();
    private final List<Application> apps = new ArrayList<>();
    private final List<Object> events = new ArrayList<>();
    private AiProvider provider;
    private AiBudgetService budget;
    private AiMeteringService metering;
    private InboxParser parser;
    private Application acme;

    @BeforeEach
    void setUp() {
        InboxMessageRepository messages = mock(InboxMessageRepository.class);
        when(messages.findTop500ByUserIdAndParsedAtIsNullOrderBySentAtAscIdAsc(USER)).thenAnswer(inv ->
            mail.stream().filter(m -> m.getParsedAt() == null).toList()
        );
        when(messages.findFirstByUserIdAndMessageId(anyLong(), anyString())).thenAnswer(inv ->
            mail.stream().filter(m -> inv.getArgument(1).equals(m.getMessageId())).findFirst()
        );
        when(messages.save(any(InboxMessage.class))).thenAnswer(inv -> inv.getArgument(0));

        ApplicationRepository applications = mock(ApplicationRepository.class);
        when(applications.findByUserId(USER)).thenReturn(apps);
        when(applications.save(any(Application.class))).thenAnswer(inv -> inv.getArgument(0));

        UserRepository users = mock(UserRepository.class);
        User u = new User();
        u.setId(USER);
        u.setLogin("user");
        when(users.findById(USER)).thenReturn(Optional.of(u));

        provider = mock(AiProvider.class);
        when(provider.isConfigured()).thenReturn(true);
        budget = mock(AiBudgetService.class);
        when(budget.decide("user", AiTask.INBOX)).thenReturn(
            new AiBudgetService.Decision(AiBudgetService.Verdict.OK, "gemini-2.5-flash-lite", true, 1, 100, T0, false)
        );
        metering = mock(AiMeteringService.class);
        ApplicationEventPublisher publisher = mock(ApplicationEventPublisher.class);
        org.mockito.Mockito.doAnswer(inv -> events.add(inv.getArgument(0))).when(publisher).publishEvent(any(Object.class));

        parser = new InboxParser(messages, applications, users, provider, budget, metering, publisher, true);

        acme = new Application().company("Acme, Inc.").roleTitle("Backend Engineer").status(ApplicationStatus.DRAFT).createdAt(T0);
        acme.setId(1L);
        acme.setArchived(false);
        apps.add(acme);
    }

    private InboxMessage in(String from, String fromName, String subject, String body, Duration after) {
        InboxMessage m = message(InboxMessage.IN, subject, body, after);
        m.setFromAddress(from);
        m.setFromName(fromName);
        m.setJobMail(true);
        return m;
    }

    private InboxMessage message(String direction, String subject, String body, Duration after) {
        InboxMessage m = new InboxMessage() {
            private final Long id = IDS.incrementAndGet();

            @Override
            public Long getId() {
                return id;
            }
        };
        m.setUserId(USER);
        m.setDirection(direction);
        m.setSubject(subject);
        m.setBodyText(body);
        m.setSentAt(T0.plus(after));
        m.setMessageId("<" + IDS.get() + "@mail>");
        mail.add(m);
        return m;
    }

    @Test
    void aConfirmationMarksTheApplicationApplied() {
        InboxMessage m = in("no-reply@us.greenhouse-mail.io", "Acme Hiring Team", "Thank you for applying to Acme", "We received your application.", Duration.ofDays(1));

        InboxParser.Result r = parser.parse(USER, "jobs.hunt@gmail.com");

        assertThat(r.changed()).isEqualTo(1);
        assertThat(acme.getStatus()).isEqualTo(ApplicationStatus.APPLIED);
        assertThat(acme.getSubmissionConfirmed()).isTrue();
        assertThat(acme.getAppliedAt()).isEqualTo(m.getSentAt());
        assertThat(m.getApplicationId()).isEqualTo(1L);
        assertThat(m.getStatusChange()).isEqualTo("APPLIED");
        assertThat(m.getClassifiedBy()).isEqualTo("RULE");
        assertThat(events).containsExactly(new InboxParser.StatusChanged(USER, 1L, "Acme, Inc.", "Backend Engineer", ApplicationStatus.DRAFT, ApplicationStatus.APPLIED, m.getId()));
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void mailIsReadOldestFirstSoTheLatestWins() {
        in("no-reply@greenhouse-mail.io", "Acme Hiring Team", "Thank you for applying to Acme", "Received.", Duration.ofDays(1));
        in("jane@acmecorp.com", "Jane", "Next steps", "Could we schedule an interview next week?", Duration.ofDays(5));
        in("no-reply@greenhouse-mail.io", "Acme Hiring Team", "Your application to Acme", "We have decided not to move forward.", Duration.ofDays(9));

        parser.parse(USER, "jobs.hunt@gmail.com");

        assertThat(acme.getStatus()).isEqualTo(ApplicationStatus.REJECTED);
        assertThat(events).hasSize(3);
    }

    @Test
    void theModelSettlesWhatTheRulesCant() throws Exception {
        InboxMessage m = in("jane@acmecorp.com", "Jane", "About your application", "Hi Sam, thanks for your patience. I'm afraid the team went another way.", Duration.ofDays(2));
        when(provider.generate(eq(AiTask.INBOX), eq("gemini-2.5-flash-lite"), anyString(), eq(""))).thenReturn(
            new AiResult("{\"results\":[{\"id\":\"m1\",\"category\":\"REJECTED\",\"company\":\"Acme\",\"role\":\"Backend Engineer\"}]}", "gemini-2.5-flash-lite", 800, 0, 40)
        );

        parser.parse(USER, "jobs.hunt@gmail.com");

        assertThat(m.getClassifiedBy()).isEqualTo("AI");
        assertThat(m.getCategory()).isEqualTo("REJECTED");
        assertThat(acme.getStatus()).isEqualTo(ApplicationStatus.REJECTED);
        verify(metering).record(eq("user"), eq(AiTask.INBOX), any());
    }

    @Test
    void whenTheModelCantBeAskedNothingUnsureChanges() throws Exception {
        when(budget.decide("user", AiTask.INBOX)).thenReturn(
            new AiBudgetService.Decision(AiBudgetService.Verdict.EXHAUSTED, null, true, 100, 100, T0, false)
        );
        InboxMessage m = in("jane@acmecorp.com", "Jane", "Quick question", "Are you open to relocating?", Duration.ofDays(2));

        parser.parse(USER, "jobs.hunt@gmail.com");

        assertThat(m.getClassifiedBy()).isEqualTo("UNSURE");
        assertThat(m.getParsedAt()).isNotNull();
        assertThat(acme.getStatus()).isEqualTo(ApplicationStatus.DRAFT);
        verify(provider, never()).generate(any(), any(), anyString(), anyString());
    }

    @Test
    void aReplyFollowsItsThread() {
        InboxMessage sent = message(InboxMessage.OUT, "Following up", "Hi Jane, following up.", Duration.ofDays(1));
        sent.setToAddresses("jane@acmecorp.com");
        // She answers from her own address, naming no company at all.
        InboxMessage reply = in("jane.doe@gmail.com", "Jane Doe", "Re: Following up", "Thanks! Could we schedule an interview on Tuesday?", Duration.ofDays(2));
        reply.setInReplyTo(sent.getMessageId());

        parser.parse(USER, "jobs.hunt@gmail.com");

        assertThat(sent.getApplicationId()).isEqualTo(1L);
        assertThat(reply.getApplicationId()).isEqualTo(1L);
        assertThat(acme.getStatus()).isEqualTo(ApplicationStatus.INTERVIEW);
    }

    @Test
    void anInviteFromAnUntrackedCompanyIsSuggested() {
        InboxMessage invite = in("no-reply@lever.co", "Globex Recruiting", "Thank you for applying to Globex", "We received your application for the Data Analyst position.", Duration.ofDays(1));
        InboxMessage no = in("no-reply@lever.co", "Hooli Recruiting", "Your application to Hooli", "We have decided not to move forward.", Duration.ofDays(2));

        InboxParser.Result r = parser.parse(USER, "jobs.hunt@gmail.com");

        assertThat(invite.getSuggestion()).isEqualTo("NEW");
        assertThat(invite.getCompanyGuess()).isEqualTo("Globex");
        assertThat(no.getSuggestion()).isNull(); // nothing to track about a rejection
        assertThat(r.suggested()).isEqualTo(1);
    }

    @Test
    void personalMailIsLeftAlone() {
        InboxMessage m = message(InboxMessage.IN, "Dinner?", null, Duration.ofDays(1));
        m.setFromAddress("mom@example.com");
        m.setJobMail(false);
        parser.parse(USER, "jobs.hunt@gmail.com");
        assertThat(m.getClassifiedBy()).isEqualTo("NONE");
        assertThat(m.getCategory()).isNull();
        assertThat(m.getParsedAt()).isNotNull();
    }
}
