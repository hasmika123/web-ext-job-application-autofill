package com.dossier.api.service.ent.resumes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.resume.ResumeActAs;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The organization license's resume cap: only for a request that is for an organization, an organization's own override first, bad overrides ignored. */
class OrgResumeCapTest {

    private OrgSettingRepository orgSettings;
    private ResumeBuilderSettings settings;
    private OrgResumeCap cap;

    @BeforeEach
    void setUp() {
        orgSettings = mock(OrgSettingRepository.class);
        settings = mock(ResumeBuilderSettings.class);
        when(settings.getInt(EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX)).thenReturn(25);
        cap = new OrgResumeCap(orgSettings, settings);
    }

    @AfterEach
    void clear() {
        TenantContextHolder.clear();
    }

    private void override(Long orgId, String json) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(orgId);
        s.setSettingKey(EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX);
        s.setValueJson(json);
        when(orgSettings.findByOrgIdAndSettingKey(orgId, EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX)).thenReturn(Optional.of(s));
    }

    @Test
    void aPersonalRequestHasNoOrganizationCap() {
        assertThat(cap.forThisRequest()).isEmpty();
        TenantContextHolder.set(TenantContext.platform("kiwiply.com"));
        assertThat(cap.forThisRequest()).as("the platform host is the personal product").isEmpty();
    }

    @Test
    void aTenantHostRequestUsesTheOrganizationsValueOrTheGlobalOne() {
        TenantContextHolder.set(TenantContext.tenant(5L, null, "acme.kiwiply.com"));
        when(orgSettings.findByOrgIdAndSettingKey(5L, EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX)).thenReturn(Optional.empty());
        assertThat(cap.forThisRequest()).contains(new OrgResumeCap.Limit(5L, 25));
        override(5L, "40");
        assertThat(cap.forThisRequest()).contains(new OrgResumeCap.Limit(5L, 40));
    }

    @Test
    void aMalformedOrOutOfRangeOverrideIsIgnored() {
        TenantContextHolder.set(TenantContext.tenant(5L, null, "acme.kiwiply.com"));
        override(5L, "lots");
        assertThat(cap.max(5L)).isEqualTo(25);
        override(5L, "0");
        assertThat(cap.max(5L)).as("below the registry minimum").isEqualTo(25);
        override(5L, "100000");
        assertThat(cap.max(5L)).as("above the registry maximum").isEqualTo(25);
    }

    @Test
    void anActForCallAndAnOrgRouteNameTheirOrganizationWithoutAHost() {
        when(orgSettings.findByOrgIdAndSettingKey(9L, EnterpriseSettingKeys.ORG_LICENSE_RESUMES_MAX)).thenReturn(Optional.empty());
        User owner = new User();
        owner.setLogin("consultant");
        assertThat(ResumeActAs.run(owner, new ResumeActAs.Scope(9L, "marketer", 1L), () -> cap.forThisRequest())).contains(new OrgResumeCap.Limit(9L, 25));
        assertThat(OrgResumeCap.inOrg(9L, () -> cap.forThisRequest())).contains(new OrgResumeCap.Limit(9L, 25));
        assertThat(cap.forThisRequest()).as("nothing leaks out of the scope").isEmpty();
    }
}
