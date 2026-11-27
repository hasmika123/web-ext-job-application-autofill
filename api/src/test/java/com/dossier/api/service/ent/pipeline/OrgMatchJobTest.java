package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.AssignmentHealth;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.privacy.JobLeaseService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OrgMatchJobTest {

    private static final Instant NOW = Instant.parse("2026-11-21T10:15:00Z");

    @Mock OrganizationRepository organizations;
    @Mock ConsultantProfileRepository consultants;
    @Mock OrgAssignmentRepository assignments;
    @Mock OrgMatchService matcher;
    @Mock ResumeBuilderSettings settings;
    @Mock JobLeaseService leases;

    private final OrgMatchJobProperties properties = new OrgMatchJobProperties();
    private OrgMatchJob job;

    @BeforeEach
    void setUp() {
        properties.setChecksPerRun(100);
        when(settings.getBool(EnterpriseSettingKeys.MATCHING_ENABLED)).thenReturn(true);
        lenient().when(leases.<List<OrgMatchJob.OrgResult>>withLease(
            eq(OrgMatchJob.LEASE_NAME),
            any(Duration.class),
            eq(NOW),
            org.mockito.ArgumentMatchers.<Supplier<List<OrgMatchJob.OrgResult>>>any(),
            org.mockito.ArgumentMatchers.<Function<List<OrgMatchJob.OrgResult>, String>>any()
        )).thenAnswer(invocation -> {
            Supplier<List<OrgMatchJob.OrgResult>> work = invocation.getArgument(3);
            return Optional.of(work.get());
        });
        job = new OrgMatchJob(organizations, consultants, assignments, matcher, properties, settings, leases);
    }

    @Test
    void selectsOnlyActiveMarketedProfilesWithAnEffectiveActingAssignment() {
        Organization org = organization(7L, "Asia/Kolkata", OrgStatus.ACTIVE);
        ConsultantProfile eligible = profile(20L, "Anika", "ACTIVE", "ACTIVE");
        ConsultantProfile paused = profile(21L, "Paused", "ACTIVE", "PAUSED");
        ConsultantProfile inactive = profile(22L, "Inactive", "INACTIVE", "ACTIVE");
        when(organizations.findAllOrgIds()).thenReturn(List.of(7L));
        when(organizations.findByOrgId(7L)).thenReturn(Optional.of(org));
        when(consultants.findByOrgId(7L)).thenReturn(List.of(eligible, paused, inactive));
        when(assignments.findByConsultant(7L, 20L)).thenReturn(List.of(
            assignment(AssignmentKind.MANAGER, 101L, NOW.minusSeconds(60), null, AssignmentHealth.OK),
            assignment(AssignmentKind.PRIMARY, 70L, NOW.minusSeconds(60), null, AssignmentHealth.OK),
            assignment(AssignmentKind.BACKUP, 71L, NOW.minusSeconds(60), NOW, AssignmentHealth.OK),
            assignment(AssignmentKind.DELEGATE, 72L, NOW.minusSeconds(60), null, AssignmentHealth.ROLE_LOST)
        ));
        when(matcher.matchOneSystem(any(), eq(20L), eq("match:7:20:2026-11-21"), eq(List.of(70L))))
            .thenReturn(new OrgMatchService.Result(OrgMatchService.Status.AI, 4, 2, 2));

        List<OrgMatchJob.OrgResult> results = job.runOnce(NOW);

        assertThat(results).singleElement().satisfies(result -> {
            assertThat(result.orgId()).isEqualTo(7L);
            assertThat(result.checked()).isEqualTo(1);
            assertThat(result.ran()).isEqualTo(1);
            assertThat(result.skipped()).isZero();
            assertThat(result.failed()).isZero();
            assertThat(result.written()).isEqualTo(2);
        });
        ArgumentCaptor<OrgMembership> actor = ArgumentCaptor.forClass(OrgMembership.class);
        verify(matcher).matchOneSystem(actor.capture(), eq(20L), eq("match:7:20:2026-11-21"), eq(List.of(70L)));
        assertThat(actor.getValue().login()).isEqualTo(OrgAuditService.SYSTEM_ACTOR);
        assertThat(actor.getValue().memberId()).isNull();
    }

    @Test
    void oneOrganizationFailureDoesNotStopTheNextOrganization() {
        Organization first = organization(7L, "UTC", OrgStatus.ACTIVE);
        Organization second = organization(8L, "UTC", OrgStatus.ACTIVE);
        ConsultantProfile firstProfile = profile(20L, "First", "ACTIVE", "ACTIVE");
        ConsultantProfile secondProfile = profile(30L, "Second", "ACTIVE", "ACTIVE");
        when(organizations.findAllOrgIds()).thenReturn(List.of(7L, 8L));
        when(organizations.findByOrgId(7L)).thenReturn(Optional.of(first));
        when(organizations.findByOrgId(8L)).thenReturn(Optional.of(second));
        when(consultants.findByOrgId(7L)).thenReturn(List.of(firstProfile));
        when(consultants.findByOrgId(8L)).thenReturn(List.of(secondProfile));
        when(assignments.findByConsultant(7L, 20L)).thenReturn(List.of(assignment(AssignmentKind.PRIMARY, 70L, NOW.minusSeconds(60), null, AssignmentHealth.OK)));
        when(assignments.findByConsultant(8L, 30L)).thenReturn(List.of(assignment(AssignmentKind.PRIMARY, 80L, NOW.minusSeconds(60), null, AssignmentHealth.OK)));
        when(matcher.matchOneSystem(any(), eq(20L), eq("match:7:20:2026-11-21"), eq(List.of(70L)))).thenThrow(new IllegalStateException("provider down"));
        when(matcher.matchOneSystem(any(), eq(30L), eq("match:8:30:2026-11-21"), eq(List.of(80L))))
            .thenReturn(new OrgMatchService.Result(OrgMatchService.Status.REPLAYED, 0, 0, 0));

        List<OrgMatchJob.OrgResult> results = job.runOnce(NOW);

        assertThat(results).extracting(OrgMatchJob.OrgResult::orgId).containsExactly(7L, 8L);
        assertThat(results.get(0).failed()).isEqualTo(1);
        assertThat(results.get(1).ran()).isEqualTo(1);
        verify(matcher).matchOneSystem(any(), eq(30L), eq("match:8:30:2026-11-21"), eq(List.of(80L)));
    }

    @Test
    void capsConsultantChecksPerOrganization() {
        properties.setChecksPerRun(1);
        Organization org = organization(7L, "UTC", OrgStatus.ACTIVE);
        ConsultantProfile first = profile(20L, "A first", "ACTIVE", "ACTIVE");
        ConsultantProfile second = profile(30L, "B second", "ACTIVE", "ACTIVE");
        when(organizations.findAllOrgIds()).thenReturn(List.of(7L));
        when(organizations.findByOrgId(7L)).thenReturn(Optional.of(org));
        when(consultants.findByOrgId(7L)).thenReturn(List.of(second, first));
        when(assignments.findByConsultant(7L, 20L)).thenReturn(List.of(assignment(AssignmentKind.PRIMARY, 70L, NOW.minusSeconds(60), null, AssignmentHealth.OK)));
        when(matcher.matchOneSystem(any(), eq(20L), eq("match:7:20:2026-11-21"), eq(List.of(70L))))
            .thenReturn(new OrgMatchService.Result(OrgMatchService.Status.REPLAYED, 0, 0, 0));

        List<OrgMatchJob.OrgResult> results = job.runOnce(NOW);

        assertThat(results).singleElement().satisfies(result -> assertThat(result.checked()).isEqualTo(1));
        verify(matcher).matchOneSystem(any(), eq(20L), eq("match:7:20:2026-11-21"), eq(List.of(70L)));
    }

    @Test
    void disabledJobDoesNotReadOrganizations() {
        when(settings.getBool(EnterpriseSettingKeys.MATCHING_ENABLED)).thenReturn(false);

        assertThat(job.runOnce(NOW)).isEmpty();
    }

    @Test
    void anotherInstanceHoldingTheLeaseDoesNotReadOrganizations() {
        when(leases.<List<OrgMatchJob.OrgResult>>withLease(
            eq(OrgMatchJob.LEASE_NAME),
            any(Duration.class),
            eq(NOW),
            org.mockito.ArgumentMatchers.<Supplier<List<OrgMatchJob.OrgResult>>>any(),
            org.mockito.ArgumentMatchers.<Function<List<OrgMatchJob.OrgResult>, String>>any()
        )).thenReturn(Optional.empty());

        assertThat(job.runOnce(NOW)).isEmpty();
        verify(organizations, org.mockito.Mockito.never()).findAllOrgIds();
    }

    private static Organization organization(Long id, String timezone, OrgStatus status) {
        Organization organization = new Organization();
        organization.setId(id);
        organization.setTimezone(timezone);
        organization.setStatus(status);
        return organization;
    }

    private static ConsultantProfile profile(Long memberId, String name, String status, String marketingStatus) {
        ConsultantProfile profile = new ConsultantProfile();
        profile.setId(memberId + 1000L);
        profile.setOrgId(7L);
        profile.setMemberId(memberId);
        profile.setDisplayName(name);
        profile.setStatus(status);
        profile.setMarketingStatus(marketingStatus);
        return profile;
    }

    private static OrgAssignment assignment(AssignmentKind kind, Long assignee, Instant startsAt, Instant endsAt, AssignmentHealth health) {
        OrgAssignment assignment = new OrgAssignment();
        assignment.setKind(kind);
        assignment.setAssigneeMemberId(assignee);
        assignment.setStartsAt(startsAt);
        assignment.setEndsAt(endsAt);
        assignment.setHealth(health);
        return assignment;
    }
}
