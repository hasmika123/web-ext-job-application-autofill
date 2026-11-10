package com.dossier.api.service.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.consultant.PrepareBatchEntitlement;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** The Prepare selected openings demo seed: Acme opted in, the add-on on Anika's and Ben's live licenses only, idempotent, and an admin's own choice is never overwritten. */
class ConsultantPrepareDemoSeederTest {

    OrganizationRepository orgs = mock(OrganizationRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    ConsultantLicenseRepository licenses = mock(ConsultantLicenseRepository.class);
    LicenseFeatureRepository features = mock(LicenseFeatureRepository.class);
    FeatureDefinitionRepository featureDefs = mock(FeatureDefinitionRepository.class);
    ProductRepository products = mock(ProductRepository.class);
    OrgSettingRepository orgSettings = mock(OrgSettingRepository.class);
    AppSettingRepository platformSettings = mock(AppSettingRepository.class);
    ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
    ConsultantPrepareDemoSeeder seeder = new ConsultantPrepareDemoSeeder(orgs, consultants, licenses, features, featureDefs, products, orgSettings, platformSettings, settings);

    @BeforeEach
    void world() {
        Organization acme = new Organization();
        acme.setId(7L);
        when(orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG)).thenReturn(Optional.of(acme));
        when(consultants.findByOrgId(7L)).thenReturn(List.of(profile(1L, "Anika Rao", 101L), profile(2L, "Ben Okafor", 102L), profile(3L, "Someone Else", 103L), profile(4L, "Ben Okafor", null)));
        for (long id = 1; id <= 3; id++) {
            ConsultantLicense l = new ConsultantLicense();
            l.setId(10 + id);
            l.setStatus("ACTIVE");
            l.setStartsAt(Instant.now());
            when(licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(7L, id)).thenReturn(List.of(l));
        }
        when(featureDefs.findByFeatureKey(PrepareBatchEntitlement.FEATURE)).thenReturn(Optional.of(new FeatureDefinition()));
        Product product = new Product();
        product.setId(55L);
        when(products.findByCode(ConsultantPrepareDemoSeeder.PRODUCT_CODE)).thenReturn(Optional.of(product));
        when(orgSettings.findByOrgIdAndSettingKey(7L, EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(Optional.empty());
        when(platformSettings.findById(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(Optional.empty());
    }

    private static ConsultantProfile profile(Long id, String name, Long memberId) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setDisplayName(name);
        c.setMemberId(memberId);
        return c;
    }

    @Test
    void optsAcmeInAndPutsTheAddOnOnAnikaAndBenOnly() {
        int made = seeder.seed();
        assertThat(made).isEqualTo(1 + 1 + 2); // platform switch, Acme opt-in, two add-ons
        ArgumentCaptor<OrgSetting> orgRow = ArgumentCaptor.forClass(OrgSetting.class);
        verify(orgSettings).saveAndFlush(orgRow.capture());
        assertThat(orgRow.getValue().getValueJson()).isEqualTo("true");
        assertThat(orgRow.getValue().getSettingKey()).isEqualTo(EnterpriseSettingKeys.PREPARE_ENABLED);
        ArgumentCaptor<LicenseFeature> f = ArgumentCaptor.forClass(LicenseFeature.class);
        verify(features, times(2)).save(f.capture());
        assertThat(f.getAllValues()).extracting(LicenseFeature::getFeatureKey).containsOnly("automation.approved_apply");
        assertThat(f.getAllValues()).extracting(LicenseFeature::getLicenseId).containsExactlyInAnyOrder(11L, 12L);
        verify(settings).invalidate();
    }

    @Test
    void aSecondRunAddsNothingAndNeverOverwritesAnAdminsChoice() {
        AppSetting platformChoice = new AppSetting(EnterpriseSettingKeys.PREPARE_ENABLED, "false", "admin", Instant.now());
        when(platformSettings.findById(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(Optional.of(platformChoice));
        OrgSetting orgChoice = new OrgSetting();
        orgChoice.setValueJson("false");
        when(orgSettings.findByOrgIdAndSettingKey(7L, EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(Optional.of(orgChoice));
        LicenseFeature has = new LicenseFeature();
        has.setFeatureKey(PrepareBatchEntitlement.FEATURE);
        when(features.findByOrgIdAndLicenseIdOrderByIdAsc(any(), any())).thenReturn(List.of(has));
        assertThat(seeder.seed()).isZero();
        verify(platformSettings, never()).save(any());
        verify(orgSettings, never()).saveAndFlush(any());
        verify(features, never()).save(any());
        assertThat(orgChoice.getValueJson()).isEqualTo("false");
    }
}
