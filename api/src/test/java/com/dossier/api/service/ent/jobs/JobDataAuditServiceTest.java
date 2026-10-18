package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.JobDataEvent;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.JobDataEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.jobs.JobDataAuditService.Response;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/** The job data audit read (doc 60 section 11): provenance plus ledger per job, org administrators only, paged, no text beyond title and employer. */
class JobDataAuditServiceTest {

    static final Long ORG = 7L;
    static final Instant T1 = Instant.parse("2026-10-14T10:00:00Z");
    static final Instant T2 = Instant.parse("2026-10-14T11:00:00Z");

    JobDataEventRepository events = mock(JobDataEventRepository.class);
    ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    ClientAccountRepository clients = mock(ClientAccountRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    UserRepository users = mock(UserRepository.class);
    OrgRolePermissionRepository permissions = mock(OrgRolePermissionRepository.class);
    JobDetailCap cap = mock(JobDetailCap.class);
    JobDataAuditService service = new JobDataAuditService(events, requirements, clients, members, users, permissions, cap);

    OrgMembership admin = new OrgMembership(ORG, 1L, 100L, "admin", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    OrgMembership marketer = new OrgMembership(ORG, 70L, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    OrgMembership member = new OrgMembership(ORG, 71L, 701L, "member", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    ClientRequirement job55;

    @BeforeEach
    void data() {
        job55 = new ClientRequirement();
        job55.setId(55L);
        job55.setOrgId(ORG);
        job55.setClientId(3L);
        job55.setTitle("Senior Java Engineer");
        job55.setDescriptionText("MARKETER-SUMMARY-NOT-FOR-AUDIT");
        job55.setCaptureSource("EXTENSION");
        job55.setCaptureMethod("USER_CLICK");
        job55.setCapturedAt(T1);
        job55.setCapturedByMemberId(70L);
        job55.setExtensionVersion("1.4.2");
        job55.setCapturePayloadHash("f".repeat(64));
        job55.setDetailLevel("MINIMAL");
        job55.setDetailLevelChangedAt(T1);
        ClientAccount acme = new ClientAccount();
        acme.setId(3L);
        acme.setName("Acme Corp");
        when(cap.capFor(ORG)).thenReturn("MINIMAL");
        when(requirements.findByOrgIdAndId(ORG, 55L)).thenReturn(Optional.of(job55));
        when(requirements.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(job55));
        when(clients.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(acme));
        OrgMember m = new OrgMember();
        m.setId(70L);
        m.setUserId(700L);
        when(members.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(m));
        User u = new User();
        u.setId(700L);
        u.setFirstName("Maya");
        u.setLastName("Lin");
        when(users.findAllById(anyCollection())).thenReturn(List.of(u));
        when(events.findByOrgIdAndRequirementIds(eq(ORG), anyCollection())).thenReturn(List.of(event(1L, "CAPTURED", T1, 70L), event(2L, "ASSIGNED", T2, 70L)));
        when(events.findJobIdsWithEvents(eq(ORG), any(Instant.class), any(Instant.class), any(Pageable.class))).thenAnswer(i -> new PageImpl<>(List.of(55L), i.<Pageable>getArgument(3), 1));
    }

    static JobDataEvent event(long id, String type, Instant at, Long actor) {
        JobDataEvent e = new JobDataEvent();
        e.setId(id);
        e.setOrgId(ORG);
        e.setRequirementId(55L);
        e.setEventType(type);
        e.setOccurredAt(at);
        e.setActorMemberId(actor);
        e.setActorKind("CAPTURED".equals(type) ? "EXTENSION" : "MEMBER");
        e.setFields("CAPTURED".equals(type) ? "jobUrl,title" : null);
        e.setSourceRef("https://example.com/job/1");
        e.setNote("ASSIGNED".equals(type) ? "assigned to consultant 10" : null);
        return e;
    }

    @Test
    void anAdminSeesProvenanceAndTheLedgerOldestFirst() {
        Response r = service.jobData(admin, null, null, null, null, null);

        assertThat(r.total()).isEqualTo(1);
        assertThat(r.page()).isZero();
        assertThat(r.size()).isEqualTo(25);
        JobDataAuditService.Item item = r.items().get(0);
        assertThat(item.job().id()).isEqualTo(55L);
        assertThat(item.job().title()).isEqualTo("Senior Java Engineer");
        assertThat(item.job().employer()).isEqualTo("Acme Corp");
        assertThat(item.job().captureSource()).isEqualTo("EXTENSION");
        assertThat(item.job().captureMethod()).isEqualTo("USER_CLICK");
        assertThat(item.job().capturedAt()).isEqualTo(T1);
        assertThat(item.job().capturedBy()).isEqualTo(new JobDataAuditService.Person(70L, "Maya Lin"));
        assertThat(item.job().extensionVersion()).isEqualTo("1.4.2");
        assertThat(item.job().capturePayloadHash()).hasSize(64);
        assertThat(item.job().detailLevel()).isEqualTo("MINIMAL");
        assertThat(item.job().levelChangedAt()).isEqualTo(T1);
        assertThat(item.events()).extracting(JobDataAuditService.Event::type).containsExactly("CAPTURED", "ASSIGNED");
        assertThat(item.events().get(0).actor().name()).isEqualTo("Maya Lin");
        assertThat(item.events().get(0).actorKind()).isEqualTo("EXTENSION");
        assertThat(item.events().get(0).fields()).isEqualTo("jobUrl,title");
        assertThat(item.events().get(1).note()).isEqualTo("assigned to consultant 10");
    }

    @Test
    void noJobTextBeyondTheMinimalFieldsIsInTheAnswer() throws Exception {
        Response r = service.jobData(admin, null, null, null, null, null);
        var json = com.fasterxml.jackson.databind.json.JsonMapper.builder().addModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule()).build();
        String out = json.writeValueAsString(r);
        assertThat(out).doesNotContain("MARKETER-SUMMARY-NOT-FOR-AUDIT").doesNotContain("descriptionText").doesNotContain("keyInfo");
    }

    @Test
    void theEffectiveLevelFollowsTheCapAndTheStoredLevelIsShownToo() {
        job55.setDetailLevel("FULL");
        assertThat(service.jobData(admin, null, null, null, null, null).items().get(0).job().detailLevel()).isEqualTo("MINIMAL");
        assertThat(service.jobData(admin, null, null, null, null, null).items().get(0).job().storedDetailLevel()).isEqualTo("FULL");
        when(cap.capFor(ORG)).thenReturn("FULL");
        assertThat(service.jobData(admin, null, null, null, null, null).items().get(0).job().detailLevel()).isEqualTo("FULL");
    }

    @Test
    void everyoneWithoutAuditViewAtOrgScopeGetsTheGeneric404AndNothingIsRead() {
        for (OrgMembership caller : List.of(marketer, member)) {
            assertThatThrownBy(() -> service.jobData(caller, null, null, null, null, null)).isInstanceOf(OrgNotFoundException.class);
        }
        assertThatThrownBy(() -> service.jobData(null, null, null, null, null, null)).isInstanceOf(OrgNotFoundException.class);
        verify(events, never()).findJobIdsWithEvents(any(), any(), any(), any());
        verify(events, never()).findByOrgIdAndRequirementIds(any(), anyCollection());
    }

    @Test
    void auditViewBelowOrgScopeIsNotEnough() {
        OrgMembership team = withGrants(null, Map.of("audit.view", PermissionScope.TEAM));
        assertThatThrownBy(() -> service.jobData(team, null, null, null, null, null)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aRowFilteredAuditGrantIsNotTheOrgAdministratorsAuditView() {
        OrgMembership finance = withGrants(List.of(new OrgMembership.RoleRef(21L, "FINANCE", "Finance", true)), Map.of("audit.view", PermissionScope.ORG));
        OrgRolePermission filtered = new OrgRolePermission();
        filtered.setPermissionKey("audit.view");
        filtered.setRowFilter(OrgRolePermission.ROW_FILTER_BILLING_OPS);
        when(permissions.findForRoles(eq(ORG), anyCollection())).thenReturn(List.of(filtered));
        assertThatThrownBy(() -> service.jobData(finance, null, null, null, null, null)).isInstanceOf(OrgNotFoundException.class);

        OrgRolePermission whole = new OrgRolePermission();
        whole.setPermissionKey("audit.view");
        when(permissions.findForRoles(eq(ORG), anyCollection())).thenReturn(List.of(filtered, whole));
        assertThat(service.jobData(finance, null, null, null, null, null).items()).hasSize(1);
    }

    private static OrgMembership withGrants(List<OrgMembership.RoleRef> roles, Map<String, PermissionScope> grants) {
        return new OrgMembership(
            ORG, 5L, 500L, "x", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE,
            roles == null ? List.of(new OrgMembership.RoleRef(null, "MEMBER", "Member", true)) : roles, grants
        );
    }

    @Test
    void oneJobByIdReturnsJustThatJobAndAnotherOrgsJobIsA404() {
        Response r = service.jobData(admin, 55L, null, null, null, null);
        assertThat(r.items()).hasSize(1);
        assertThat(r.total()).isEqualTo(1);
        verify(events, never()).findJobIdsWithEvents(any(), any(), any(), any());

        when(requirements.findByOrgIdAndId(ORG, 999L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.jobData(admin, 999L, null, null, null, null)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void theWindowFiltersTheEventsAndIsPassedToThePagedJobQuery() {
        Instant from = Instant.parse("2026-10-14T10:30:00Z");
        Instant to = Instant.parse("2026-10-14T12:00:00Z");
        Response r = service.jobData(admin, null, from, to, 0, 10);
        assertThat(r.items().get(0).events()).extracting(JobDataAuditService.Event::type).containsExactly("ASSIGNED");
        verify(events).findJobIdsWithEvents(ORG, from, to, PageRequest.of(0, 10));
    }

    @Test
    void pagingIsPassedThroughAndBounded() {
        service.jobData(admin, null, null, null, 2, 50);
        verify(events).findJobIdsWithEvents(eq(ORG), any(Instant.class), any(Instant.class), eq(PageRequest.of(2, 50)));
        for (int[] bad : new int[][] { { -1, 10 }, { 0, 0 }, { 0, 101 } }) {
            assertThatThrownBy(() -> service.jobData(admin, null, null, null, bad[0], bad[1])).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getStatus()).isEqualTo(400));
        }
        assertThatThrownBy(() -> service.jobData(admin, null, T2, T1, null, null)).isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("VALIDATION"));
    }

    @Test
    void anEmptyOrganizationAnswersAnEmptyPage() {
        when(events.findJobIdsWithEvents(eq(ORG), any(Instant.class), any(Instant.class), any(Pageable.class))).thenAnswer(i -> new PageImpl<Long>(List.of(), i.<Pageable>getArgument(3), 0));
        Response r = service.jobData(admin, null, null, null, null, null);
        assertThat(r.items()).isEmpty();
        assertThat(r.total()).isZero();
        verify(requirements, never()).findByOrgIdAndIdIn(any(), anyCollection());
    }

    @Test
    void everyReadIsScopedToTheCallersOrganization() {
        OrgMembership otherAdmin = new OrgMembership(8L, 2L, 101L, "other", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
        when(cap.capFor(8L)).thenReturn("MINIMAL");
        when(events.findJobIdsWithEvents(eq(8L), any(Instant.class), any(Instant.class), any(Pageable.class))).thenAnswer(i -> new PageImpl<Long>(List.of(), i.<Pageable>getArgument(3), 0));
        service.jobData(otherAdmin, null, null, null, null, null);
        verify(events, never()).findJobIdsWithEvents(eq(ORG), any(), any(), any());
    }
}
