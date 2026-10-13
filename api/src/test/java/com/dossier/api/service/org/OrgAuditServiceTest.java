package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** O1.4: the org audit writer keys rows by login strings and carries every action key of tenant-model.md section 2.7. */
class OrgAuditServiceTest {

    private OrgAuditEventRepository repository;
    private OrgAuditService service;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(OrgAuditEventRepository.class);
        service = new OrgAuditService(repository);
        when(repository.save(any(OrgAuditEvent.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void recordTakesTheActorFromTheSecurityContextAndKeepsLoginStrings() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("priya", null));

        service.record(7L, OrgRole.ADMIN, OrgAuditService.MEMBER_ROLE, OrgAuditService.TARGET_MEMBER, "sam", "42", "MEMBER -> STAFF");

        ArgumentCaptor<OrgAuditEvent> captor = ArgumentCaptor.forClass(OrgAuditEvent.class);
        verify(repository).save(captor.capture());
        OrgAuditEvent e = captor.getValue();
        assertThat(e.getOrgId()).isEqualTo(7L);
        assertThat(e.getActorLogin()).isEqualTo("priya");
        assertThat(e.getActorRole()).isEqualTo("ADMIN");
        assertThat(e.getAction()).isEqualTo("MEMBER_ROLE");
        assertThat(e.getTargetType()).isEqualTo("MEMBER");
        assertThat(e.getTargetLogin()).isEqualTo("sam");
        assertThat(e.getTargetId()).isEqualTo("42");
        assertThat(e.getDetails()).isEqualTo("MEMBER -> STAFF");
        assertThat(e.getCreatedAt()).isNotNull();
    }

    @Test
    void anUnauthenticatedWriteIsASystemAction() {
        service.record(7L, null, OrgAuditService.MEMBER_ERASED, OrgAuditService.TARGET_MEMBER, "gone", null, null);

        ArgumentCaptor<OrgAuditEvent> captor = ArgumentCaptor.forClass(OrgAuditEvent.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getActorLogin()).isEqualTo("system");
        assertThat(captor.getValue().getActorRole()).isNull();
    }

    @Test
    void anExplicitActorOverloadDoesNotUseTheSecurityContext() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("someone-else", null));

        service.record(7L, "erased-user", null, OrgAuditService.MEMBER_ERASED, OrgAuditService.TARGET_MEMBER, "erased-user", null, null, null);

        ArgumentCaptor<OrgAuditEvent> captor = ArgumentCaptor.forClass(OrgAuditEvent.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getActorLogin()).isEqualTo("erased-user");
    }

    @Test
    void detailsAreTruncatedToTheColumn() {
        service.record(7L, OrgRole.OWNER, OrgAuditService.ORG_SETTINGS, OrgAuditService.TARGET_ORG, null, "7", "x".repeat(5000));

        ArgumentCaptor<OrgAuditEvent> captor = ArgumentCaptor.forClass(OrgAuditEvent.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getDetails()).hasSize(OrgAuditService.DETAILS_MAX);
    }

    @Test
    void anOrgIdAnActionAndATargetTypeAreRequired() {
        assertThatThrownBy(() -> service.record(null, OrgRole.OWNER, "X", "ORG", null, null, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.record(1L, OrgRole.OWNER, " ", "ORG", null, null, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.record(1L, OrgRole.OWNER, "X", null, null, null, null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void everyActionKeyOfTheDesignExistsAndEqualsItsName() throws Exception {
        List<String> required = List.of(
            "ORG_CREATE", "ORG_SETTINGS", "MEMBER_INVITE", "MEMBER_INVITE_RESEND", "MEMBER_ROLE", "MEMBER_SUSPEND", "MEMBER_REMOVE",
            "MEMBER_LEFT", "MEMBER_ERASED", "ASSIGNMENT_CREATE", "ASSIGNMENT_END", "SHARE_READ_FULL", "SHARE_SCOPE_CHANGED", "EXPORT"
        );
        for (String name : required) {
            Field f = OrgAuditService.class.getField(name);
            assertThat(Modifier.isStatic(f.getModifiers()) && Modifier.isFinal(f.getModifiers())).as(name).isTrue();
            assertThat(f.get(null)).as(name).isEqualTo(name);
        }
        assertThat(OrgAuditService.PREFIX_BILLING).isEqualTo("BILLING_");
        assertThat(OrgAuditService.PREFIX_MARKETER).isEqualTo("MARKETER_");
        assertThat(OrgAuditService.PREFIX_OPS).isEqualTo("OPS_");
    }

    @Test
    void ipHashIsSha256HexAndNeverTheAddress() {
        String h = OrgAuditService.hashIp("203.0.113.9");
        assertThat(h).hasSize(64).matches("[0-9a-f]{64}").doesNotContain("203");
        assertThat(OrgAuditService.hashIp("203.0.113.9")).isEqualTo(h);
        assertThat(OrgAuditService.hashIp(null)).isNull();
        assertThat(OrgAuditService.hashIp(" ")).isNull();
    }
}
