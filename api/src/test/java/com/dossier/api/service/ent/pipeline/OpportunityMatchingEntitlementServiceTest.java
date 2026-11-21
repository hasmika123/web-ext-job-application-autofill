package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ai.AiCallContext;
import com.dossier.api.service.ent.authz.AuthzDecision;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.billing.MatchingUsageLedger;
import com.dossier.api.service.ent.licenses.OrgLicenseGate;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgMembership;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class OpportunityMatchingEntitlementServiceTest {

    private static final Long ORG = 7L;
    private static final Long ACTOR_MEMBER = 10L;
    private static final Long CONSULTANT_MEMBER = 20L;
    private static final Long PROFILE = 41L;
    private static final Instant NOW = Instant.parse("2026-11-21T10:00:00Z");

    private final AuthorizationService authorization = mock(AuthorizationService.class);
    private final ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    private final OrgLicenseGate licenses = mock(OrgLicenseGate.class);
    private final FeatureDefinitionRepository definitions = mock(FeatureDefinitionRepository.class);
    private final LicenseFeatureRepository licenseFeatures = mock(LicenseFeatureRepository.class);
    private final DataShareService dataShare = mock(DataShareService.class);
    private final OrgMemberRepository members = mock(OrgMemberRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final MatchingUsageLedger usage = mock(MatchingUsageLedger.class);
    private final MatchingBatchSettings batchSettings = mock(MatchingBatchSettings.class);
    private final OpportunityMatchingEntitlementService service = new OpportunityMatchingEntitlementService(
        authorization,
        consultants,
        licenses,
        definitions,
        licenseFeatures,
        dataShare,
        members,
        users,
        usage,
        batchSettings
    );

    @BeforeEach
    void setUp() {
        when(batchSettings.maxFor(ORG)).thenReturn(20);
        when(authorization.authorize(any())).thenReturn(
            AuthzDecision.allow(ORG, actor(), CONSULTANT_MEMBER, List.of(OpportunityMatchingEntitlementService.PERMISSION), Map.of(OpportunityMatchingEntitlementService.PERMISSION, PermissionScope.ORG))
        );

        ConsultantProfile profile = new ConsultantProfile();
        profile.setId(PROFILE);
        profile.setOrgId(ORG);
        profile.setMemberId(CONSULTANT_MEMBER);
        when(consultants.findByOrgIdAndMemberId(ORG, CONSULTANT_MEMBER)).thenReturn(Optional.of(profile));
        when(licenses.has(ORG, PROFILE, FeatureKeys.AI_JOB_MATCHING, NOW)).thenReturn(true);

        FeatureDefinition definition = new FeatureDefinition();
        definition.setFeatureKey(FeatureKeys.AI_JOB_MATCHING);
        definition.setUsageUnit("matches");
        definition.setDefaultAllowance(100L);
        definition.setReserveTtlSeconds(900);
        when(definitions.findByFeatureKey(FeatureKeys.AI_JOB_MATCHING)).thenReturn(Optional.of(definition));

        ConsultantLicense license = new ConsultantLicense();
        license.setId(61L);
        when(licenses.liveLicense(ORG, PROFILE, NOW)).thenReturn(Optional.of(license));
        LicenseFeature feature = new LicenseFeature();
        feature.setLicenseId(61L);
        feature.setFeatureKey(FeatureKeys.AI_JOB_MATCHING);
        feature.setLive(true);
        feature.setQuantity(1);
        when(licenseFeatures.findByOrgIdAndLicenseIdOrderByIdAsc(ORG, 61L)).thenReturn(List.of(feature));

        OrgMember consultant = new OrgMember();
        consultant.setId(CONSULTANT_MEMBER);
        consultant.setOrgId(ORG);
        consultant.setUserId(200L);
        when(members.findByOrgIdAndId(ORG, CONSULTANT_MEMBER)).thenReturn(Optional.of(consultant));
        User user = new User();
        user.setId(200L);
        user.setLogin("beneficiary");
        when(users.findById(200L)).thenReturn(Optional.of(user));

        when(dataShare.scopeOf(ORG, CONSULTANT_MEMBER)).thenReturn(ShareScope.FULL);
        when(dataShare.viewOf(ORG, CONSULTANT_MEMBER)).thenReturn(
            Optional.of(new DataShareService.ShareView(ShareScope.FULL, ACTOR_MEMBER, "v1", NOW, NOW))
        );
        when(usage.reserve(any())).thenReturn(new MatchingUsageLedger.Reservation(99L, MatchingUsageLedger.ReserveStatus.RESERVED, 20, "RESERVED"));
    }

    @Test
    void missingConsentRefusesBeforeUsageReservation() {
        when(dataShare.scopeOf(ORG, CONSULTANT_MEMBER)).thenReturn(ShareScope.NONE);

        OpportunityMatchingEntitlementService.Decision decision = service.reserve(actor(), CONSULTANT_MEMBER, "attempt-1", NOW);

        assertThat(decision.allowed()).isFalse();
        assertThat(decision.reason()).isEqualTo(com.dossier.api.service.ent.authz.AuthzReason.CONSENT_REQUIRED);
        assertThat(decision.details()).containsEntry("beneficiaryMemberId", CONSULTANT_MEMBER);
        verify(usage, never()).reserve(any());
    }

    @Test
    void licensedConsentedDecisionCarriesTheOrganizationAiContext() {
        OpportunityMatchingEntitlementService.Decision decision = service.reserve(actor(), CONSULTANT_MEMBER, "attempt-1", NOW);

        assertThat(decision.allowed()).isTrue();
        assertThat(decision.newlyReserved()).isTrue();
        AiCallContext context = decision.aiContext();
        assertThat(context.actorLogin()).isEqualTo("actor");
        assertThat(context.beneficiaryLogin()).isEqualTo("beneficiary");
        assertThat(context.orgId()).isEqualTo(ORG);
        assertThat(context.featureKey()).isEqualTo(FeatureKeys.AI_JOB_MATCHING);
        assertThat(context.usageEventId()).isEqualTo(99L);

        ArgumentCaptor<MatchingUsageLedger.Request> request = ArgumentCaptor.forClass(MatchingUsageLedger.Request.class);
        verify(usage).reserve(request.capture());
        assertThat(request.getValue().quantity()).isEqualTo(20);
        assertThat(request.getValue().idempotencyKey()).isEqualTo("7:ai.job_matching:matching_run:20:attempt-1");
    }

    @Test
    void missingLicenseRefusesBeforeUsageReservation() {
        when(licenses.has(ORG, PROFILE, FeatureKeys.AI_JOB_MATCHING, NOW)).thenReturn(false);

        OpportunityMatchingEntitlementService.Decision decision = service.reserve(actor(), CONSULTANT_MEMBER, "attempt-1", NOW);

        assertThat(decision.allowed()).isFalse();
        assertThat(decision.reason()).isEqualTo(com.dossier.api.service.ent.authz.AuthzReason.FEATURE_NOT_LICENSED);
        verify(usage, never()).reserve(any());
    }

    @Test
    void authorizationScopeRefusalStopsBeforeLicenseAndUsageChecks() {
        when(authorization.authorize(any())).thenReturn(
            AuthzDecision.deny(ORG, com.dossier.api.service.ent.authz.AuthzReason.OUT_OF_SCOPE, List.of(OpportunityMatchingEntitlementService.PERMISSION))
        );

        OpportunityMatchingEntitlementService.Decision decision = service.reserve(actor(), CONSULTANT_MEMBER, "attempt-1", NOW);

        assertThat(decision.allowed()).isFalse();
        assertThat(decision.reason()).isEqualTo(com.dossier.api.service.ent.authz.AuthzReason.OUT_OF_SCOPE);
        verify(licenses, never()).has(any(), any(), any(), any());
        verify(usage, never()).reserve(any());
    }

    @Test
    void exhaustedAllowanceRefusesAndAnExistingReservationRemainsIdempotentlyAllowed() {
        when(usage.reserve(any())).thenReturn(new MatchingUsageLedger.Reservation(null, MatchingUsageLedger.ReserveStatus.ALLOWANCE_EXHAUSTED, 0, null));
        OpportunityMatchingEntitlementService.Decision exhausted = service.reserve(actor(), CONSULTANT_MEMBER, "attempt-1", NOW);
        assertThat(exhausted.allowed()).isFalse();
        assertThat(exhausted.reason()).isEqualTo(com.dossier.api.service.ent.authz.AuthzReason.FEATURE_ALLOWANCE_EXHAUSTED);

        when(usage.reserve(any())).thenReturn(new MatchingUsageLedger.Reservation(99L, MatchingUsageLedger.ReserveStatus.EXISTING, 20, "RESERVED"));
        OpportunityMatchingEntitlementService.Decision existing = service.reserve(actor(), CONSULTANT_MEMBER, "attempt-1", NOW);
        assertThat(existing.allowed()).isTrue();
        assertThat(existing.newlyReserved()).isFalse();
        assertThat(existing.aiContext().usageEventId()).isEqualTo(99L);
    }

    @Test
    void commitAndReleaseDelegateToTheReservationLedger() {
        OpportunityMatchingEntitlementService.Decision decision = service.reserve(actor(), CONSULTANT_MEMBER, "attempt-1", NOW);

        service.commit(decision, 12, NOW.plusSeconds(2));
        service.release(decision, "provider_error", NOW.plusSeconds(3));

        verify(usage).commit(ORG, 99L, 12, NOW.plusSeconds(2));
        verify(usage).release(ORG, 99L, "provider_error", NOW.plusSeconds(3));
    }

    private static OrgMembership actor() {
        return new OrgMembership(
            ORG,
            ACTOR_MEMBER,
            100L,
            "actor",
            null,
            OrgMemberStatus.ACTIVE,
            OrgStatus.ACTIVE,
            List.of(),
            Map.of(OpportunityMatchingEntitlementService.PERMISSION, PermissionScope.ORG)
        );
    }
}
