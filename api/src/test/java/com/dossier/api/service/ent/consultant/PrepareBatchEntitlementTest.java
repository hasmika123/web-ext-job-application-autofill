package com.dossier.api.service.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The Prepare selected openings gate: the platform switch, then the organization's own opt-in, then the consultant's live license carrying the Autopilot
 * prepare add-on (automation.approved_apply). The first missing thing is the reason.
 */
class PrepareBatchEntitlementTest {

    static final Long ORG = 1L;
    static final Long SEAT = 11L;
    static final Long CONSULTANT = 21L;
    static final Long LICENSE = 31L;

    PrepareBatchSettings settings = mock(PrepareBatchSettings.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    ConsultantLicenseRepository licenses = mock(ConsultantLicenseRepository.class);
    LicenseFeatureRepository features = mock(LicenseFeatureRepository.class);
    PrepareBatchEntitlement entitlement = new PrepareBatchEntitlement(settings, consultants, licenses, features);

    ConsultantProfile profile = new ConsultantProfile();

    @BeforeEach
    void ready() {
        when(settings.platformEnabled()).thenReturn(true);
        when(settings.orgEnabled(ORG)).thenReturn(true);
        profile.setId(CONSULTANT);
        profile.setOrgId(ORG);
        profile.setMemberId(SEAT);
        profile.setStatus("ACTIVE");
        when(consultants.findByOrgIdAndMemberId(ORG, SEAT)).thenReturn(Optional.of(profile));
        when(consultants.findByOrgIdAndStatusOrderByDisplayNameAsc(ORG, "ACTIVE")).thenReturn(List.of(profile));
        licensed("ACTIVE", PrepareBatchEntitlement.FEATURE, true);
    }

    private void licensed(String licenseStatus, String featureKey, boolean live) {
        ConsultantLicense l = new ConsultantLicense();
        l.setId(LICENSE);
        l.setOrgId(ORG);
        l.setConsultantId(CONSULTANT);
        l.setStatus(licenseStatus);
        l.setStartsAt(Instant.now().minus(Duration.ofDays(30)));
        when(licenses.findByOrgIdAndStatusIn(eq(ORG), any())).thenReturn(List.of(l));
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(ORG);
        f.setLicenseId(LICENSE);
        f.setFeatureKey(featureKey);
        f.setLive(live);
        f.setStartsAt(Instant.now().minus(Duration.ofDays(30)));
        when(features.findByOrgIdAndLicenseIdIn(eq(ORG), any())).thenReturn(List.of(f));
    }

    @Test
    void theAddOnIsTheCatalogKeyOfAutopilotPrepare() {
        assertThat(PrepareBatchEntitlement.FEATURE).isEqualTo("automation.approved_apply");
    }

    @Test
    void allowedWhenPlatformOrganizationAndLicenseAllHold() {
        assertThat(entitlement.check(ORG, SEAT).allowed()).isTrue();
        assertThat(entitlement.check(ORG, SEAT).reason()).isNull();
    }

    @Test
    void thePlatformSwitchComesFirst() {
        when(settings.platformEnabled()).thenReturn(false);
        when(settings.orgEnabled(ORG)).thenReturn(false);
        assertThat(entitlement.check(ORG, SEAT).reason()).isEqualTo(PrepareBatchEntitlement.PLATFORM_OFF);
    }

    @Test
    void theOrganizationMustHaveOptedIn() {
        when(settings.orgEnabled(ORG)).thenReturn(false);
        PrepareBatchEntitlement.Decision d = entitlement.check(ORG, SEAT);
        assertThat(d.allowed()).isFalse();
        assertThat(d.reason()).isEqualTo(PrepareBatchEntitlement.ORG_OFF);
    }

    @Test
    void aConsultantWithoutTheAddOnIsRefused() {
        licensed("ACTIVE", "inbox.monitoring", true);
        PrepareBatchEntitlement.Decision d = entitlement.check(ORG, SEAT);
        assertThat(d.allowed()).isFalse();
        assertThat(d.reason()).isEqualTo(PrepareBatchEntitlement.NO_LICENSE);
    }

    @Test
    void anAddOnThatIsNotLiveOrWhoseLicenseHasEndedGrantsNothing() {
        licensed("ACTIVE", PrepareBatchEntitlement.FEATURE, false);
        assertThat(entitlement.check(ORG, SEAT).reason()).isEqualTo(PrepareBatchEntitlement.NO_LICENSE);
        when(licenses.findByOrgIdAndStatusIn(eq(ORG), any())).thenReturn(List.of());
        assertThat(entitlement.check(ORG, SEAT).reason()).isEqualTo(PrepareBatchEntitlement.NO_LICENSE);
    }

    @Test
    void aLicenseThatIsEndingStillGrantsUntilItEnds() {
        licensed("CANCEL_AT_PERIOD_END", PrepareBatchEntitlement.FEATURE, true);
        assertThat(entitlement.check(ORG, SEAT).allowed()).isTrue();
    }

    @Test
    void noProfileOrAnInactiveOneAndMissingIdsAreRefused() {
        when(consultants.findByOrgIdAndMemberId(ORG, SEAT)).thenReturn(Optional.empty());
        assertThat(entitlement.check(ORG, SEAT).allowed()).isFalse();
        profile.setStatus("PAUSED");
        when(consultants.findByOrgIdAndMemberId(ORG, SEAT)).thenReturn(Optional.of(profile));
        assertThat(entitlement.check(ORG, SEAT).allowed()).isFalse();
        assertThat(entitlement.check(ORG, null).allowed()).isFalse();
        assertThat(entitlement.check(null, SEAT).allowed()).isFalse();
    }

    @Test
    void coverageCountsTheActiveConsultantsWhoseLicenseCarriesTheAddOn() {
        assertThat(entitlement.coverage(ORG)).isEqualTo(new PrepareBatchEntitlement.Coverage(1, 1));
        licensed("ACTIVE", "inbox.monitoring", true);
        assertThat(entitlement.coverage(ORG)).isEqualTo(new PrepareBatchEntitlement.Coverage(0, 1));
        assertThat(entitlement.coverage(null)).isEqualTo(new PrepareBatchEntitlement.Coverage(0, 0));
    }
}
