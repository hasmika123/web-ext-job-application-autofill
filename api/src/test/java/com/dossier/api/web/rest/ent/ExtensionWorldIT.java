package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision O4, phase S6 (docs/enterprise-v2/19 sections 6.2 and 6.3): the enterprise extension token ({@code ext=1}, {@code tid}) is accepted on the
 * platform host and reaches the routes the extension really calls, and nothing else; the personal extension token is unchanged; refresh keeps
 * {@code ext} and {@code tid} and refuses the wrong world. Real tokens through the real filter chain; the unit {@code ExtensionRoutesTest} pins the
 * allow-list itself.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ExtensionWorldIT extends AbstractEnterpriseWorldIT {

    private static final List<String> OPEN_ON_PLATFORM = List.of("/api/profile/version", "/api/profile/resumes", "/api/profile/applications", "/api/ai/usage");

    @Test
    void theEnterpriseExtensionTokenCarriesTidAndExtAndNoHostnameAndNeverTheLoginInTheResponse() throws Exception {
        JsonNode session = extensionSession();
        for (String key : new String[] { "accessToken", "refreshToken" }) {
            JsonNode c = claims(session.get(key).asText());
            assertThat(c.get("tid").asLong()).as(key).isEqualTo(acme.getId());
            assertThat(c.get("ext").asInt()).as(key).isEqualTo(1);
            assertThat(c.get("userId").asLong()).as(key).isEqualTo(enterprise.getId());
            assertThat(c.has("hid")).as(key + " is not tied to a hostname").isFalse();
        }
        assertThat(session.get("kind").asText()).isEqualTo("ENTERPRISE");
        assertThat(session.get("orgId").asLong()).isEqualTo(acme.getId());
        assertThat(session.get("userId").asLong()).isEqualTo(enterprise.getId());
        assertThat(session.get("email").asText()).isEqualTo(email);
        assertThat(session.get("orgName").asText()).isEqualTo(acme.getName());
        assertThat(session.has("username")).as("the synthetic login is never sent").isFalse();
        assertThat(session.toString()).doesNotContain("ent#");
    }

    @Test
    void theEnterpriseExtensionTokenWorksOnThePlatformHostForTheRoutesTheExtensionCalls() throws Exception {
        String access = extensionSession().get("accessToken").asText();
        for (String uri : OPEN_ON_PLATFORM) {
            MvcResult r = call("GET", PLATFORM_HOST, access, uri);
            assertThat(r.getResponse().getStatus()).as(uri + " -> " + r.getResponse().getContentAsString()).isEqualTo(200);
        }
        // no host header at all (a script, the service worker behind a proxy) is the platform too
        assertThat(call("GET", null, access, "/api/profile/version").getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void profileVersionNamesTheEnterpriseAccountAndListsOneWorkspaceForOneRelease() throws Exception {
        String access = extensionSession().get("accessToken").asText();
        JsonNode v = mapper.readTree(call("GET", PLATFORM_HOST, access, "/api/profile/version").getResponse().getContentAsString());
        assertThat(v.path("account").path("kind").asText()).isEqualTo("ENTERPRISE");
        assertThat(v.path("account").path("orgId").asLong()).isEqualTo(acme.getId());
        assertThat(v.path("account").path("name").asText()).isEqualTo(acme.getName());
        assertThat(v.path("account").path("consultant").isBoolean()).isTrue();
        assertThat(v.path("account").path("marketer").isBoolean()).isTrue();
        assertThat(v.path("plan").asText()).isEqualTo("FREE");
        assertThat(v.path("workspaces").size()).as("at most the one organization this account belongs to").isLessThanOrEqualTo(1);
    }

    @Test
    void thePersonalAccountOfTheSameAddressIsPersonalWithNoWorkspaces() throws Exception {
        String access = login(PLATFORM_HOST, email, PERSONAL_PW).get("accessToken").asText();
        JsonNode v = mapper.readTree(call("GET", PLATFORM_HOST, access, "/api/profile/version").getResponse().getContentAsString());
        assertThat(v.path("account").path("kind").asText()).isEqualTo("PERSONAL");
        assertThat(v.path("account").path("orgId").isNull()).isTrue();
        assertThat(v.path("account").path("name").isNull()).isTrue();
        assertThat(v.path("account").path("consultant").asBoolean()).isFalse();
        assertThat(v.path("account").path("marketer").asBoolean()).isFalse();
        assertThat(v.path("workspaces").size()).isZero();
    }

    @Test
    void everythingOutsideTheAllowListIsTheGeneric404ForTheEnterpriseExtensionToken() throws Exception {
        String access = extensionSession().get("accessToken").asText();
        List<String[]> refused = List.of(
            new String[] { "GET", "/api/account" },
            new String[] { "GET", "/api/notifications" },
            new String[] { "GET", "/api/billing/me" },
            new String[] { "GET", "/api/profile/inbox" },
            new String[] { "GET", "/api/orgs/" + acme.getId() + "/members" },
            new String[] { "GET", "/api/orgs/" + acme.getId() },
            new String[] { "GET", "/api/orgs/" + other.getId() + "/me-workspace/inbox" },
            new String[] { "GET", "/api/orgs/" + other.getId() + "/con/opportunities" },
            new String[] { "GET", "/api/ent/anything" },
            new String[] { "GET", "/api/me/tenant" },
            new String[] { "POST", "/api/extension/session" },
            new String[] { "POST", "/api/extension/connect-code" },
            new String[] { "GET", "/api/admin/users" }
        );
        for (String[] r : refused) {
            for (String host : new String[] { PLATFORM_HOST, ACME_HOST }) {
                MvcResult res = call(r[0], host, access, r[1]);
                assertThat(res.getResponse().getStatus()).as(r[0] + " " + r[1] + " on " + host + " -> " + res.getResponse().getContentAsString()).isEqualTo(404);
                assertThat(res.getResponse().getContentAsString()).as(r[1]).doesNotContain("forbidden").doesNotContain("permission");
            }
        }
    }

    @Test
    void anEnterpriseTokenWithoutExtIsStillRefusedOnThePlatformHost() throws Exception {
        String ordinary = login(ACME_HOST, email, ENTERPRISE_PW).get("accessToken").asText();
        for (String uri : OPEN_ON_PLATFORM) {
            MvcResult r = call("GET", PLATFORM_HOST, ordinary, uri);
            assertThat(r.getResponse().getStatus()).as(uri).isEqualTo(401);
            assertThat(r.getResponse().getContentAsString()).contains("TOKEN_WRONG_WORLD");
        }
    }

    @Test
    void thePersonalExtensionTokenIsUnchanged() throws Exception {
        String access = login(PLATFORM_HOST, email, PERSONAL_PW).get("accessToken").asText();
        MvcResult session = call("POST", PLATFORM_HOST, access, "/api/extension/session");
        assertThat(session.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = mapper.readTree(session.getResponse().getContentAsString());
        assertThat(body.get("kind").asText()).isEqualTo("PERSONAL");
        assertThat(body.get("userId").asLong()).isEqualTo(personal.getId());
        assertThat(body.get("email").asText()).isEqualTo(email);
        assertThat(body.get("username").asText()).isEqualTo(personal.getLogin());
        assertThat(body.has("orgId")).isFalse();
        for (String key : new String[] { "accessToken", "refreshToken" }) {
            JsonNode c = claims(body.get(key).asText());
            assertThat(c.has("tid")).as(key).isFalse();
            assertThat(c.has("ext")).as(key).isFalse();
            assertThat(c.get("userId").asLong()).isEqualTo(personal.getId());
        }
        String ext = body.get("accessToken").asText();
        for (String uri : List.of("/api/profile/version", "/api/account", "/api/billing/me", "/api/profile/inbox")) {
            assertThat(call("GET", PLATFORM_HOST, ext, uri).getResponse().getStatus()).as("personal extension token on " + uri).isEqualTo(200);
        }
        assertThat(call("POST", PLATFORM_HOST, ext, "/api/extension/connect-code").getResponse().getStatus()).as("a personal account can not mint an enterprise code").isEqualTo(404);
    }

    @Test
    void anEnterpriseTokenOnTheTenantHostCannotUseThePersonalExtensionSessionRoute() throws Exception {
        String ordinary = login(ACME_HOST, email, ENTERPRISE_PW).get("accessToken").asText();
        assertThat(call("POST", ACME_HOST, ordinary, "/api/extension/session").getResponse().getStatus()).isEqualTo(404);
    }

    // ---- refresh -----------------------------------------------------------------------------------------------------------

    @Test
    void anEnterpriseExtensionTokenRefreshesOnThePlatformHostAndStaysExtAndTid() throws Exception {
        String refresh = extensionSession().get("refreshToken").asText();
        MvcResult r = refresh(PLATFORM_HOST, refresh);
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode pair = mapper.readTree(r.getResponse().getContentAsString());
        for (String key : new String[] { "accessToken", "refreshToken" }) {
            JsonNode c = claims(pair.get(key).asText());
            assertThat(c.get("tid").asLong()).as(key).isEqualTo(acme.getId());
            assertThat(c.get("ext").asInt()).as(key).isEqualTo(1);
        }
        // and the refreshed access token still has the same route set
        assertThat(call("GET", PLATFORM_HOST, pair.get("accessToken").asText(), "/api/profile/version").getResponse().getStatus()).isEqualTo(200);
        assertThat(call("GET", PLATFORM_HOST, pair.get("accessToken").asText(), "/api/account").getResponse().getStatus()).isEqualTo(404);
        // rotated: the spent token is dead
        assertThat(refresh(PLATFORM_HOST, refresh).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void theWrongWorldRefreshIsRefused() throws Exception {
        JsonNode session = extensionSession();
        String extRefresh = session.get("refreshToken").asText();
        // an ext token on ANOTHER organization's tenant host
        assertThat(refresh(OTHER_HOST, extRefresh).getResponse().getStatus()).as("ext refresh on another tenant host").isEqualTo(401);
        // an ordinary (non-ext) enterprise refresh token on the platform host
        String ordinaryRefresh = login(ACME_HOST, email, ENTERPRISE_PW).get("refreshToken").asText();
        assertThat(refresh(PLATFORM_HOST, ordinaryRefresh).getResponse().getStatus()).as("enterprise refresh without ext on the platform host").isEqualTo(401);
        assertThat(refresh(null, ordinaryRefresh).getResponse().getStatus()).isEqualTo(401);
        // a personal refresh token on the enterprise tenant host
        String personalRefresh = login(PLATFORM_HOST, email, PERSONAL_PW).get("refreshToken").asText();
        assertThat(refresh(ACME_HOST, personalRefresh).getResponse().getStatus()).as("personal refresh on the tenant host").isEqualTo(401);
        // the ext token itself still refreshes where it belongs
        assertThat(refresh(PLATFORM_HOST, extRefresh).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void anEnterpriseExtensionRefreshStopsWhenTheSeatEnds() throws Exception {
        String refresh = extensionSession().get("refreshToken").asText();
        members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), List.of(OrgMemberStatus.ACTIVE)).forEach(m -> {
            m.setStatus(OrgMemberStatus.SUSPENDED);
            members.save(m);
        });
        assertThat(refresh(PLATFORM_HOST, refresh).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void anAccountRowMovedToAnotherOrganizationKillsItsExtensionSession() throws Exception {
        String refresh = extensionSession().get("refreshToken").asText();
        enterprise.setOrgId(other.getId());
        users.saveAndFlush(enterprise);
        assertThat(refresh(PLATFORM_HOST, refresh).getResponse().getStatus()).isEqualTo(401);
    }
}
