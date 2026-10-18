package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.OrgStorageKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X2.13: the public branding assets are served by HOST. Cache headers and 304, the host (never a parameter) selects the
 * organization so beta can not fetch acme's file, an unset or unpublished asset and a suspended org are the same 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class PublicTenantAssetResourceIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final byte[] ACME_LOGO = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 1, 2, 3, 4};
    private static final byte[] BETA_LOGO = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 9, 9, 9, 9};

    @Autowired private MockMvc mockMvc;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgBrandingRepository brandings;
    @Autowired private FileStorage storage;

    private Organization acme;
    private Organization beta;
    private String acmeKey;

    @BeforeEach
    void seed() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        acme = fx.org("acme-" + System.nanoTime(), OrgStatus.ACTIVE);
        beta = fx.org("beta-" + System.nanoTime(), OrgStatus.ACTIVE);
        acme.setSubdomain("acme-asset");
        acme.setSubdomainEnabled(true);
        beta.setSubdomain("beta-asset");
        beta.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", "asset-it", Instant.now()));
        cache.invalidate();
        resolver.invalidate();

        acmeKey = OrgStorageKeys.brandingKey(acme.getId(), "logo", "aaaaaaaaaaaa", "png");
        storage.store(acmeKey, ACME_LOGO, "image/png");
        publish(acme, acmeKey);
        String betaKey = OrgStorageKeys.brandingKey(beta.getId(), "logo", "bbbbbbbbbbbb", "png");
        storage.store(betaKey, BETA_LOGO, "image/png");
        publish(beta, betaKey);
    }

    @AfterEach
    void drop() {
        resolver.invalidate();
        cache.invalidate();
    }

    private void publish(Organization org, String logoKey) {
        OrgBranding b = new OrgBranding();
        b.setOrgId(org.getId());
        b.setLogoKey(logoKey);
        b.setPublishedAt(Instant.now());
        brandings.saveAndFlush(b);
    }

    private MvcResult fetch(String host, String kind) throws Exception {
        var req = get("/api/public/tenant/assets/" + kind);
        if (host != null) req = req.header(HOST, host);
        return mockMvc.perform(req).andReturn();
    }

    @Test
    void servesTheHostsLogoWithCacheHeadersAndAnEtag() throws Exception {
        MvcResult r = fetch("acme-asset.kiwiply.com", "logo");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(r.getResponse().getContentAsByteArray()).isEqualTo(ACME_LOGO);
        assertThat(r.getResponse().getContentType()).isEqualTo("image/png");
        assertThat(r.getResponse().getHeader("Cache-Control")).contains("public").contains("max-age=86400");
        assertThat(r.getResponse().getHeader("ETag")).isEqualTo("\"aaaaaaaaaaaa\"");
        assertThat(r.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(r.getResponse().getHeaders("Set-Cookie")).isEmpty();
    }

    @Test
    void ifNoneMatchIs304AndHeadWorks() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/public/tenant/assets/logo").header(HOST, "acme-asset.kiwiply.com").header("If-None-Match", "\"aaaaaaaaaaaa\"")).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(304);
        assertThat(r.getResponse().getContentAsByteArray()).isEmpty();
        MvcResult h = mockMvc.perform(head("/api/public/tenant/assets/logo").header(HOST, "acme-asset.kiwiply.com")).andReturn();
        assertThat(h.getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void theHostSelectsTheOrganizationSoBetaNeverGetsAcmesFile() throws Exception {
        assertThat(fetch("beta-asset.kiwiply.com", "logo").getResponse().getContentAsByteArray()).isEqualTo(BETA_LOGO);
        MvcResult viaParam = mockMvc.perform(get("/api/public/tenant/assets/logo").param("orgId", String.valueOf(acme.getId())).param("key", acmeKey).header(HOST, "beta-asset.kiwiply.com")).andReturn();
        assertThat(viaParam.getResponse().getContentAsByteArray()).as("a parameter can not name another org").isEqualTo(BETA_LOGO);
    }

    @Test
    void unknownHostMissingHostUnsetKindAndUnknownKindAreThe404() throws Exception {
        assertThat(fetch("nobody.kiwiply.com", "logo").getResponse().getStatus()).isEqualTo(404);
        assertThat(fetch(null, "logo").getResponse().getStatus()).isEqualTo(404);
        assertThat(fetch("acme-asset.kiwiply.com", "favicon").getResponse().getStatus()).as("favicon not set").isEqualTo(404);
        assertThat(fetch("acme-asset.kiwiply.com", "avatar").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aDraftOnlyAssetIsNotServedUntilPublished() throws Exception {
        OrgBranding b = brandings.findByOrgId(acme.getId()).orElseThrow();
        b.setLogoKey(null);
        b.setPublishedAt(null);
        b.setDraftJson("{\"logoKey\":\"" + acmeKey + "\"}");
        brandings.saveAndFlush(b);
        assertThat(fetch("acme-asset.kiwiply.com", "logo").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aStoredKeyOutsideTheOrgsPrefixIsNeverServed() throws Exception {
        OrgBranding b = brandings.findByOrgId(acme.getId()).orElseThrow();
        b.setLogoKey(OrgStorageKeys.brandingKey(beta.getId(), "logo", "bbbbbbbbbbbb", "png"));
        brandings.saveAndFlush(b);
        assertThat(fetch("acme-asset.kiwiply.com", "logo").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aSuspendedOrgIs404AtOnce() throws Exception {
        assertThat(fetch("acme-asset.kiwiply.com", "logo").getResponse().getStatus()).isEqualTo(200);
        acme.setStatus(OrgStatus.SUSPENDED);
        orgs.saveAndFlush(acme);
        resolver.invalidate();
        assertThat(fetch("acme-asset.kiwiply.com", "logo").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void thePublicTenantDtoCarriesTheSameOriginAssetUrl() throws Exception {
        MvcResult r = mockMvc.perform(get("/api/public/tenant").header(HOST, "acme-asset.kiwiply.com")).andReturn();
        String body = r.getResponse().getContentAsString();
        assertThat(body).contains("\"logoUrl\":\"/tenant-assets/logo?v=" + acme.getConfigVersion() + "\"").doesNotContain("org/" + acme.getId());
        assertThat(OrgRole.OWNER).isNotNull();
    }
}
