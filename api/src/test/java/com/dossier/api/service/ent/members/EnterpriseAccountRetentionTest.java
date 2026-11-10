package com.dossier.api.service.ent.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.AccountExportService;
import com.dossier.api.service.org.OrgAuditService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

/**
 * The retention job of decision O4 phase S8: the cutoff is "now minus the retention days", every due row is erased in its own scope and transaction, a row
 * that fails never stops the others (and is retried by the next run), a seat that is no longer removed is skipped, and the audit row (HIGH, actor system)
 * is written only for an account that was really erased. The database side (which rows qualify) is covered by {@code AccountDeletionSeparateIT}.
 */
class EnterpriseAccountRetentionTest {

    private static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");

    private OrgMemberRepository members;
    private EnterpriseAccountLifecycle accounts;
    private AccountDeletionService deletion;
    private OrgAuditService audit;
    private EntityManager em;
    private TypedQuery<Object[]> query;
    private EnterpriseAccountRetention job;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void wire() {
        members = mock(OrgMemberRepository.class);
        accounts = mock(EnterpriseAccountLifecycle.class);
        deletion = mock(AccountDeletionService.class);
        audit = mock(OrgAuditService.class);
        em = mock(EntityManager.class);
        query = mock(TypedQuery.class);
        PlatformTransactionManager tx = mock(PlatformTransactionManager.class);
        when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        job = new EnterpriseAccountRetention(members, accounts, deletion, mock(AccountExportService.class), audit, mock(MemberAccess.class), tx, Clock.fixed(NOW, ZoneOffset.UTC));
        ReflectionTestUtils.setField(job, "em", em);
        when(accounts.retentionDays()).thenReturn(90);
        when(em.createQuery(any(String.class), eq(Object[].class))).thenReturn(query);
        when(query.setParameter(any(String.class), any())).thenReturn(query);
    }

    private OrgMember removedSeat(long orgId, long memberId, long userId) {
        OrgMember seat = new OrgMember();
        seat.setOrgId(orgId);
        seat.setUserId(userId);
        seat.setStatus(OrgMemberStatus.REMOVED);
        when(members.findByOrgIdAndId(orgId, memberId)).thenReturn(Optional.of(seat));
        User account = new User();
        account.setId(userId);
        account.setOrgId(orgId);
        when(accounts.accountOf(eq(orgId), eq(seat))).thenReturn(Optional.of(account));
        return seat;
    }

    @Test
    void theCutoffIsNowMinusTheRetentionDays() {
        when(query.getResultList()).thenReturn(List.of());
        assertThat(job.runDue(NOW)).isZero();
        ArgumentCaptor<Object> value = ArgumentCaptor.forClass(Object.class);
        verify(query).setParameter(eq("cutoff"), value.capture());
        assertThat(value.getValue()).isEqualTo(NOW.minus(Duration.ofDays(90)));
        verify(query).setParameter("removed", OrgMemberStatus.REMOVED);
        verify(deletion, never()).deleteEnterpriseAccount(anyLong(), anyLong());
    }

    @Test
    void theCutoffFollowsTheSetting() {
        when(accounts.retentionDays()).thenReturn(7);
        when(query.getResultList()).thenReturn(List.of());
        job.runDue(NOW);
        verify(query).setParameter("cutoff", NOW.minus(Duration.ofDays(7)));
    }

    @Test
    void everyDueAccountIsErasedAndAuditedAsTheSystem() {
        removedSeat(1L, 10L, 100L);
        removedSeat(2L, 20L, 200L);
        when(query.getResultList()).thenReturn(List.of(new Object[] { 1L, 10L }, new Object[] { 2L, 20L }));

        assertThat(job.runDue(NOW)).isEqualTo(2);

        verify(deletion).deleteEnterpriseAccount(1L, 100L);
        verify(deletion).deleteEnterpriseAccount(2L, 200L);
        ArgumentCaptor<String> details = ArgumentCaptor.forClass(String.class);
        verify(audit, times(2)).record(anyLong(), eq(OrgAuditService.SYSTEM_ACTOR), eq(null), eq(MemberAuditActions.ACCOUNT_ERASED), eq(OrgAuditService.TARGET_MEMBER), eq(null), any(), details.capture(), eq(null), eq(null), eq(null), eq("HIGH"));
        assertThat(details.getAllValues()).allSatisfy(d -> assertThat(d).contains("RETENTION").contains("90").doesNotContain("@"));
    }

    @Test
    void aFailingRowNeverStopsTheOthersAndIsNotAudited() {
        removedSeat(1L, 10L, 100L);
        removedSeat(2L, 20L, 200L);
        doThrow(new IllegalStateException("storage unreachable")).when(deletion).deleteEnterpriseAccount(1L, 100L);
        when(query.getResultList()).thenReturn(List.of(new Object[] { 1L, 10L }, new Object[] { 2L, 20L }));

        assertThat(job.runDue(NOW)).isEqualTo(1);

        verify(deletion).deleteEnterpriseAccount(2L, 200L);
        verify(audit, times(1)).record(anyLong(), any(String.class), any(), eq(MemberAuditActions.ACCOUNT_ERASED), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void aSeatThatIsNoLongerRemovedOrHasNoEnterpriseAccountIsSkipped() {
        OrgMember reinstated = removedSeat(1L, 10L, 100L);
        reinstated.setStatus(OrgMemberStatus.ACTIVE);
        OrgMember personal = new OrgMember();
        personal.setStatus(OrgMemberStatus.REMOVED);
        when(members.findByOrgIdAndId(2L, 20L)).thenReturn(Optional.of(personal));
        when(accounts.accountOf(eq(2L), eq(personal))).thenReturn(Optional.empty());
        when(members.findByOrgIdAndId(3L, 30L)).thenReturn(Optional.empty());
        when(query.getResultList()).thenReturn(List.of(new Object[] { 1L, 10L }, new Object[] { 2L, 20L }, new Object[] { 3L, 30L }));

        assertThat(job.runDue(NOW)).isZero();

        verify(deletion, never()).deleteEnterpriseAccount(anyLong(), anyLong());
        verify(audit, never()).record(anyLong(), any(String.class), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void theScheduledEntryPointNeverThrows() {
        when(query.getResultList()).thenThrow(new IllegalStateException("database down"));
        job.runScheduled(); // logged, not thrown: the next day's run tries again
        verify(deletion, never()).deleteEnterpriseAccount(anyLong(), anyLong());
    }
}
