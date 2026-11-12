package com.dossier.api.service.ent.licenses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.service.entitlement.FeatureKeys;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The one licence reader (LICENCES-BUILD.md L1): which licences and feature rows grant, the organization-wide list, and the AI budget sum. */
class OrgLicenseGateTest {

    static final Long ORG = 1L;
    static final Long CONSULTANT = 21L;
    static final Long LICENSE = 31L;
    static final Instant NOW = Instant.parse("2026-11-10T12:00:00Z");

    ConsultantLicenseRepository licenses = mock(ConsultantLicenseRepository.class);
    LicenseFeatureRepository features = mock(LicenseFeatureRepository.class);
    FeatureDefinitionRepository definitions = mock(FeatureDefinitionRepository.class);
    OrgLicenseGate gate = new OrgLicenseGate(licenses, features, definitions);

    ConsultantLicense license;
    List<LicenseFeature> rows = new ArrayList<>();

    @BeforeEach
    void ready() {
        license = license(LICENSE, "ACTIVE", NOW.minus(Duration.ofDays(30)), null);
        when(licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(ORG, CONSULTANT)).thenAnswer(inv -> List.of(license));
        when(licenses.findByOrgIdAndStatusIn(eq(ORG), any())).thenAnswer(inv -> List.of(license));
        when(features.findByOrgIdAndLicenseIdOrderByIdAsc(ORG, LICENSE)).thenAnswer(inv -> rows);
        when(features.findByOrgIdAndLicenseIdIn(eq(ORG), any())).thenAnswer(inv -> rows);
        rows.add(feature(FeatureKeys.INBOX_MONITORING, true, null, 1));
    }

    static ConsultantLicense license(Long id, String status, Instant starts, Instant ends) {
        ConsultantLicense l = new ConsultantLicense();
        l.setId(id);
        l.setOrgId(ORG);
        l.setConsultantId(CONSULTANT);
        l.setStatus(status);
        l.setStartsAt(starts);
        l.setEndsAt(ends);
        return l;
    }

    static LicenseFeature feature(String key, boolean live, Instant ends, int quantity) {
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(ORG);
        f.setLicenseId(LICENSE);
        f.setFeatureKey(key);
        f.setLive(live);
        f.setQuantity(quantity);
        f.setStartsAt(NOW.minus(Duration.ofDays(30)));
        f.setEndsAt(ends);
        return f;
    }

    static FeatureDefinition definition(String key, int aiCents) {
        FeatureDefinition d = new FeatureDefinition();
        d.setFeatureKey(key);
        d.setAiBudgetCents(aiCents);
        return d;
    }

    @Test
    void aLiveLicenseGrantsItsLiveFeaturesAndTheBase() {
        assertThat(gate.has(ORG, CONSULTANT, FeatureKeys.INBOX_MONITORING, NOW)).isTrue();
        assertThat(gate.has(ORG, CONSULTANT, FeatureKeys.BASE_CONSULTANT, NOW)).isTrue();
        assertThat(gate.has(ORG, CONSULTANT, FeatureKeys.AI_RESUME_TAILORING, NOW)).isFalse();
    }

    @Test
    void suspendedEndedAndNotYetStartedLicensesGrantNothing() {
        for (String status : List.of("SUSPENDED", "ENDED", "PENDING")) {
            license.setStatus(status);
            assertThat(gate.has(ORG, CONSULTANT, FeatureKeys.INBOX_MONITORING, NOW)).as(status).isFalse();
            assertThat(gate.has(ORG, CONSULTANT, FeatureKeys.BASE_CONSULTANT, NOW)).as(status).isFalse();
        }
        license.setStatus("ACTIVE");
        license.setStartsAt(NOW.plus(Duration.ofDays(1)));
        assertThat(gate.liveLicense(ORG, CONSULTANT, NOW)).isEmpty();
    }

    @Test
    void anEndingLicenseGrantsUntilItEnds() {
        license.setStatus("CANCEL_AT_PERIOD_END");
        license.setEndsAt(NOW.plus(Duration.ofDays(3)));
        assertThat(gate.has(ORG, CONSULTANT, FeatureKeys.INBOX_MONITORING, NOW)).isTrue();
        assertThat(gate.has(ORG, CONSULTANT, FeatureKeys.INBOX_MONITORING, NOW.plus(Duration.ofDays(4)))).isFalse();
    }

    @Test
    void aFeatureRowThatIsOffOrHasEndedGrantsNothing() {
        rows.clear();
        rows.add(feature(FeatureKeys.INBOX_MONITORING, false, null, 1));
        rows.add(feature(FeatureKeys.AUTOMATION_APPROVED_APPLY, true, NOW.minus(Duration.ofMinutes(1)), 1));
        assertThat(gate.liveFeatures(ORG, CONSULTANT, NOW)).isEmpty();
    }

    @Test
    void consultantsWithListsOnlyLiveLicensesCarryingTheFeature() {
        assertThat(gate.consultantsWith(ORG, FeatureKeys.INBOX_MONITORING, NOW)).isEqualTo(Set.of(CONSULTANT));
        assertThat(gate.consultantsWith(ORG, FeatureKeys.AI_JOB_MATCHING, NOW)).isEmpty();
        license.setEndsAt(NOW.minus(Duration.ofSeconds(1)));
        assertThat(gate.consultantsWith(ORG, FeatureKeys.INBOX_MONITORING, NOW)).isEmpty();
    }

    @Test
    void theAiBudgetIsTheSumOfTheLiveAiFeaturesTimesQuantity() {
        rows.add(feature(FeatureKeys.AI_RESUME_TAILORING, true, null, 1));
        rows.add(feature(FeatureKeys.AI_CREDITS_EXTRA, true, null, 2));
        rows.add(feature(FeatureKeys.AI_JOB_MATCHING, false, null, 1));
        when(definitions.findByFeatureKey(FeatureKeys.INBOX_MONITORING)).thenReturn(Optional.of(definition(FeatureKeys.INBOX_MONITORING, 60)));
        when(definitions.findByFeatureKey(FeatureKeys.AI_RESUME_TAILORING)).thenReturn(Optional.of(definition(FeatureKeys.AI_RESUME_TAILORING, 125)));
        when(definitions.findByFeatureKey(FeatureKeys.AI_CREDITS_EXTRA)).thenReturn(Optional.of(definition(FeatureKeys.AI_CREDITS_EXTRA, 75)));
        when(definitions.findByFeatureKey(FeatureKeys.AI_JOB_MATCHING)).thenReturn(Optional.of(definition(FeatureKeys.AI_JOB_MATCHING, 75)));
        // 60 + 125 + 2 x 75; the job-matching row is off
        assertThat(gate.aiBudgetCents(ORG, CONSULTANT)).isEqualTo(335);
    }

    @Test
    void noLicenseMeansNoBudgetAndNoFeatures() {
        when(licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(ORG, CONSULTANT)).thenReturn(List.of());
        assertThat(gate.aiBudgetCents(ORG, CONSULTANT)).isZero();
        assertThat(gate.liveFeatures(ORG, CONSULTANT, NOW)).isEmpty();
        assertThat(gate.has(null, CONSULTANT, FeatureKeys.INBOX_MONITORING)).isFalse();
        assertThat(gate.has(ORG, null, FeatureKeys.INBOX_MONITORING)).isFalse();
    }

    /** ORG-BILLING-BUILD.md step 3b: an unpaid invoice pauses the add-ons from the pause date; the base licence (the workspace) keeps working. */
    @Test
    void aPastDueOrganizationsAddOnsPauseFromThePauseDateAndTheBaseLicenceKeepsWorking() {
        com.dossier.api.repository.ent.billing.OrgBillingAccountRepository accounts = mock(com.dossier.api.repository.ent.billing.OrgBillingAccountRepository.class);
        com.dossier.api.domain.ent.billing.OrgBillingAccount a = new com.dossier.api.domain.ent.billing.OrgBillingAccount();
        a.setOrgId(ORG);
        a.setStatus("PAST_DUE");
        a.setFeaturesPausedFrom(java.time.LocalDate.of(2026, 11, 10));
        when(accounts.findFirstByOrgId(ORG)).thenReturn(java.util.Optional.of(a));
        OrgLicenseGate billed = new OrgLicenseGate(licenses, features, definitions, accounts);

        org.assertj.core.api.Assertions.assertThat(billed.paused(ORG, NOW)).isTrue();
        org.assertj.core.api.Assertions.assertThat(billed.liveFeatures(ORG, CONSULTANT, NOW)).isEmpty();
        org.assertj.core.api.Assertions.assertThat(billed.consultantsWith(ORG, FeatureKeys.INBOX_MONITORING, NOW)).isEmpty();
        org.assertj.core.api.Assertions.assertThat(billed.has(ORG, CONSULTANT, FeatureKeys.BASE_CONSULTANT, NOW)).as("the workspace keeps working").isTrue();

        a.setFeaturesPausedFrom(java.time.LocalDate.of(2026, 11, 11));
        org.assertj.core.api.Assertions.assertThat(billed.liveFeatures(ORG, CONSULTANT, NOW)).as("before the pause date everything works").containsKey(FeatureKeys.INBOX_MONITORING);
        a.setStatus("ACTIVE");
        a.setFeaturesPausedFrom(java.time.LocalDate.of(2026, 11, 1));
        org.assertj.core.api.Assertions.assertThat(billed.liveFeatures(ORG, CONSULTANT, NOW)).as("paid: no pause").containsKey(FeatureKeys.INBOX_MONITORING);
    }
}
