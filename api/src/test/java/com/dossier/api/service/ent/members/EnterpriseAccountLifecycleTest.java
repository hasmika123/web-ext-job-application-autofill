package com.dossier.api.service.ent.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.RefreshTokenService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The account side of a seat change (decision O4, S8): only an enterprise account of the organization is disabled; a personal account never is. */
class EnterpriseAccountLifecycleTest {

    private UserRepository users;
    private OrgMemberRepository members;
    private RefreshTokenService tokens;
    private OrgAuditService audit;
    private ResumeBuilderSettings settings;
    private EnterpriseAccountLifecycle lifecycle;

    @BeforeEach
    void wire() {
        users = mock(UserRepository.class);
        members = mock(OrgMemberRepository.class);
        tokens = mock(RefreshTokenService.class);
        audit = mock(OrgAuditService.class);
        settings = mock(ResumeBuilderSettings.class);
        lifecycle = new EnterpriseAccountLifecycle(users, members, tokens, audit, settings);
        when(settings.getInt(ResumeBuilderSettingKeys.ORG_ACCOUNT_RETENTION_DAYS)).thenReturn(90);
    }

    private OrgMember seat(Long userId) {
        OrgMember s = new OrgMember();
        s.setOrgId(5L);
        s.setUserId(userId);
        s.setStatus(OrgMemberStatus.ACTIVE);
        return s;
    }

    private User account(Long id, Long orgId) {
        User u = new User();
        u.setId(id);
        u.setOrgId(orgId);
        when(users.findById(id)).thenReturn(Optional.of(u));
        return u;
    }

    @Test
    void anEnterpriseAccountOfTheOrganizationIsDisabledWithItsTokensRevokedAndAHighAuditRow() {
        account(7L, 5L);
        when(tokens.revokeAllForUser(7L)).thenReturn(3);

        assertThat(lifecycle.disable(5L, seat(7L), "owner", OrgRole.OWNER, "OFFBOARD")).isTrue();

        verify(tokens).revokeAllForUser(7L);
        ArgumentCaptor<String> details = ArgumentCaptor.forClass(String.class);
        verify(audit).record(eq(5L), eq("owner"), eq(OrgRole.OWNER), eq(MemberAuditActions.ACCOUNT_DISABLED), eq(OrgAuditService.TARGET_MEMBER), eq(null), any(), details.capture(), eq(null), eq(null), eq(null), eq("HIGH"));
        assertThat(details.getValue()).isEqualTo("{\"mode\":\"OFFBOARD\",\"sessionsRevoked\":3}");
    }

    @Test
    void aPersonalAccountOrAnAccountOfAnotherOrganizationIsNeverDisabled() {
        account(8L, null);
        account(9L, 6L);
        assertThat(lifecycle.disable(5L, seat(8L), "owner", OrgRole.OWNER, "SUSPEND")).isFalse();
        assertThat(lifecycle.disable(5L, seat(9L), "owner", OrgRole.OWNER, "SUSPEND")).isFalse();
        assertThat(lifecycle.disable(5L, seat(null), "owner", OrgRole.OWNER, "SUSPEND")).isFalse();
        assertThat(lifecycle.disable(5L, null, "owner", OrgRole.OWNER, "SUSPEND")).isFalse();
        assertThat(lifecycle.enable(5L, seat(8L), "owner", OrgRole.OWNER)).isFalse();
        verify(tokens, never()).revokeAllForUser(anyLong());
        verify(audit, never()).record(anyLong(), any(String.class), any(), any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void enablingWritesAMediumAuditRow() {
        account(7L, 5L);
        assertThat(lifecycle.enable(5L, seat(7L), "owner", OrgRole.OWNER)).isTrue();
        verify(audit).record(eq(5L), eq("owner"), eq(OrgRole.OWNER), eq(MemberAuditActions.ACCOUNT_ENABLED), any(), eq(null), any(), any(), eq(null), eq(null), eq(null), eq("MEDIUM"));
        verify(tokens, never()).revokeAllForUser(anyLong());
    }

    @Test
    void theEraseDayIsLeftAtPlusTheRetentionSetting() {
        Instant left = Instant.parse("2026-01-01T00:00:00Z");
        assertThat(lifecycle.eraseOn(left)).isEqualTo(left.plus(Duration.ofDays(90)));
        when(settings.getInt(ResumeBuilderSettingKeys.ORG_ACCOUNT_RETENTION_DAYS)).thenReturn(30);
        assertThat(lifecycle.eraseOn(left)).isEqualTo(left.plus(Duration.ofDays(30)));
    }

    @Test
    void anActiveSeatIsWhatKeepsAnAccountWorking() {
        when(members.findByOrgIdAndUserIdAndStatusIn(5L, 7L, List.of(OrgMemberStatus.ACTIVE))).thenReturn(List.of(seat(7L)));
        when(members.findByOrgIdAndUserIdAndStatusIn(5L, 8L, List.of(OrgMemberStatus.ACTIVE))).thenReturn(List.of());
        assertThat(lifecycle.hasActiveSeat(5L, 7L)).isTrue();
        assertThat(lifecycle.hasActiveSeat(5L, 8L)).isFalse();
        assertThat(lifecycle.hasActiveSeat(null, 7L)).isFalse();
        assertThat(lifecycle.hasActiveSeat(5L, null)).isFalse();
    }

    @Test
    void theHookSaysNothingForASeatWithoutAnEnterpriseAccountAndOrdersItselfBeforeAssignments() {
        OrgMember personalSeat = seat(8L);
        account(8L, null);
        when(members.findByOrgIdAndId(5L, 1L)).thenReturn(Optional.of(personalSeat));
        EnterpriseAccountOffboardingHook hook = new EnterpriseAccountOffboardingHook(members, lifecycle);
        assertThat(hook.preview(5L, 1L)).isEmpty();
        hook.apply(new OffboardingHook.Context(5L, 1L, "login", "a reason that is long enough", "owner", List.of()));
        verify(tokens, never()).revokeAllForUser(anyLong());
        assertThat(hook.getOrder()).isEqualTo(OffboardingHook.ORDER_ACCOUNT).isBetween(OffboardingHook.ORDER_SESSIONS, OffboardingHook.ORDER_ASSIGNMENTS - 1);
        assertThat(hook.key()).isEqualTo("account");
    }

    @Test
    void theHookPreviewNamesTheDisableTheInboxAndTheRetentionDate() {
        account(7L, 5L);
        when(members.findByOrgIdAndId(5L, 1L)).thenReturn(Optional.of(seat(7L)));
        List<MemberActionDTO.HookLine> lines = new EnterpriseAccountOffboardingHook(members, lifecycle).preview(5L, 1L);
        assertThat(lines).extracting(MemberActionDTO.HookLine::kind).containsExactly("ACCOUNT", "ACCOUNT_INBOX", "ACCOUNT_RETENTION");
        MemberActionDTO.HookLine retention = lines.get(2);
        assertThat(retention.data().get("retentionDays")).isEqualTo(90);
        assertThat(retention.data().get("eraseOn").toString()).matches("\\d{4}-\\d{2}-\\d{2}");
        assertThat(retention.text()).contains("90 days");
        assertThat(lines.get(1).text()).doesNotContain("connected a mailbox"); // general terms only: nothing says whether a mailbox exists
    }
}
