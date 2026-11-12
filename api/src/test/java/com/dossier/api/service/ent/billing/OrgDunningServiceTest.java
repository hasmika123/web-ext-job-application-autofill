package com.dossier.api.service.ent.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.ent.billing.OrgBillingAccount;
import com.dossier.api.domain.ent.billing.OrgInvoice;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** ORG-BILLING-BUILD.md step 3b (user decision 2026-11-12: pause, suspend by hand): past due, the pause date, weekly reminders, back to active. */
class OrgDunningServiceTest {

    static final Long ORG = 7L;
    static final LocalDate TODAY = LocalDate.of(2026, 12, 20);
    static final Instant NOW = Instant.parse("2026-12-20T09:40:00Z");

    OrganizationRepository organizations = mock(OrganizationRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    UserRepository users = mock(UserRepository.class);
    MailService mail = mock(MailService.class);
    OrgDunningService dunning = new OrgDunningService(organizations, members, users, mail);

    OrgBillingAccount account = new OrgBillingAccount();

    @BeforeEach
    void ready() {
        account.setOrgId(ORG);
        account.setStatus("ACTIVE");
        account.setBillingEmail("ap@acme.test");
        Organization o = new Organization();
        o.setName("Acme Staffing");
        when(organizations.findByOrgId(ORG)).thenReturn(Optional.of(o));
        OrgMember owner = new OrgMember();
        owner.setUserId(40L);
        when(members.findByOrgIdAndRoleInAndStatus(ORG, List.of(OrgRole.OWNER, OrgRole.ADMIN), OrgMemberStatus.ACTIVE)).thenReturn(List.of(owner));
        User u = new User();
        u.setEmail("Sarah@Acme.test");
        when(users.findById(40L)).thenReturn(Optional.of(u));
    }

    private static OrgInvoice invoice(LocalDate due) {
        OrgInvoice i = new OrgInvoice();
        i.setOrgId(ORG);
        i.setInvoiceNumber("KIWI-0002");
        i.setStatus("OPEN");
        i.setDueDate(due);
        i.setAmountMinor(52_450L);
        i.setCurrency("USD");
        i.setHostedUrl("https://invoice.stripe.test/i/2");
        return i;
    }

    @Test
    void anOverdueInvoiceMakesTheAccountPastDuePausesAfterThePaidPeriodAndRemindsTheBillingContactAndOwners() {
        account.setPaidThroughOn(LocalDate.of(2026, 12, 31));
        assertThat(dunning.sweep(account, List.of(invoice(LocalDate.of(2026, 12, 16))), TODAY, NOW)).isTrue();
        assertThat(account.getStatus()).isEqualTo("PAST_DUE");
        assertThat(account.getFeaturesPausedFrom()).as("the day after the period it paid for").isEqualTo(LocalDate.of(2027, 1, 1));
        assertThat(account.getLastReminderAt()).isEqualTo(NOW);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(mail).sendEmail(eq("ap@acme.test"), eq("Acme Staffing: invoice KIWI-0002 is overdue"), body.capture(), eq(false), eq(false));
        verify(mail).sendEmail(eq("sarah@acme.test"), anyString(), anyString(), eq(false), eq(false));
        assertThat(body.getValue())
            .contains("$524.50")
            .contains("December 16, 2026")
            .contains("https://invoice.stripe.test/i/2")
            .contains("If it is still unpaid on January 1, 2027")
            .contains("Everything else keeps working");
    }

    @Test
    void anOrganizationThatNeverPaidPausesFromItsOldestUnpaidDueDateAndIsRemindedOnceAWeek() {
        dunning.sweep(account, List.of(invoice(LocalDate.of(2026, 12, 16)), invoice(LocalDate.of(2026, 11, 16))), TODAY, NOW);
        assertThat(account.getFeaturesPausedFrom()).isEqualTo(LocalDate.of(2026, 11, 16));
        verify(mail, times(2)).sendEmail(anyString(), anyString(), any(), eq(false), eq(false));
        clearInvocations(mail);

        dunning.sweep(account, List.of(invoice(LocalDate.of(2026, 11, 16))), TODAY, NOW.plus(Duration.ofDays(3)));
        verify(mail, never()).sendEmail(anyString(), anyString(), any(), any(Boolean.class), any(Boolean.class));
        dunning.sweep(account, List.of(invoice(LocalDate.of(2026, 11, 16))), TODAY, NOW.plus(Duration.ofDays(7)));
        verify(mail, times(2)).sendEmail(anyString(), anyString(), any(), eq(false), eq(false));
    }

    @Test
    void nothingOverdueAnyMoreIsActiveAgainWithThePauseLiftedAndASuspendedAccountIsLeftAlone() {
        account.setStatus("PAST_DUE");
        account.setFeaturesPausedFrom(LocalDate.of(2026, 12, 1));
        account.setLastReminderAt(NOW.minus(Duration.ofDays(2)));
        assertThat(dunning.sweep(account, List.of(invoice(LocalDate.of(2026, 12, 30))), TODAY, NOW)).isTrue();
        assertThat(account.getStatus()).isEqualTo("ACTIVE");
        assertThat(account.getFeaturesPausedFrom()).isNull();
        assertThat(account.getLastReminderAt()).isNull();
        assertThat(dunning.sweep(account, List.of(), TODAY, NOW)).as("already clear: nothing to save").isFalse();

        account.setStatus("SUSPENDED");
        assertThat(dunning.sweep(account, List.of(invoice(LocalDate.of(2026, 11, 16))), TODAY, NOW)).isFalse();
        assertThat(account.getStatus()).isEqualTo("SUSPENDED");
        verify(mail, never()).sendEmail(anyString(), anyString(), any(), any(Boolean.class), any(Boolean.class));
    }
}
