package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ExtConnectCode;
import com.dossier.api.repository.ExtConnectCodeRepository;
import com.dossier.api.service.ExtensionConnectCodeService;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decision O4, phase S6 (docs/enterprise-v2/19 section 6.3): the one-time code that connects the browser extension to an enterprise account. Single
 * use, 60 seconds, bound to the account and its organization, stored only as a hash, rate limited, and the same empty answer for every failure.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConnectCodeIT extends AbstractEnterpriseWorldIT {

    @Autowired private ExtConnectCodeRepository codes;
    @Autowired private ExtensionConnectCodeService service;

    private String tenantAccess() throws Exception {
        return login(ACME_HOST, email, ENTERPRISE_PW).get("accessToken").asText();
    }

    private ExtConnectCode rowOf(String code) {
        return codes.findByCodeHash(sha256(code)).orElseThrow();
    }

    private static String sha256(String s) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ---- minting ---------------------------------------------------------------------------------------------------------

    @Test
    void anEnterpriseSessionMintsACodeThatIsALinkOnThePlatformAndStoredOnlyAsAHashBoundToAccountAndOrganization() throws Exception {
        MvcResult r = call("POST", ACME_HOST, tenantAccess(), "/api/extension/connect-code");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = mapper.readTree(r.getResponse().getContentAsString());
        assertThat(body.get("expiresInSeconds").asInt()).isEqualTo(60);
        String url = body.get("connectUrl").asText();
        assertThat(url).contains("/connect?code=").doesNotContain("acme-extw");
        String code = url.substring(url.indexOf("code=") + 5);
        assertThat(code).matches("[A-Za-z0-9_-]{43}");

        ExtConnectCode row = rowOf(code);
        assertThat(row.getCodeHash()).isNotEqualTo(code).hasSize(64);
        assertThat(row.getUserId()).isEqualTo(enterprise.getId());
        assertThat(row.getOrgId()).isEqualTo(acme.getId());
        assertThat(row.getUsedAt()).isNull();
        assertThat(Duration.between(row.getCreatedAt(), row.getExpiresAt()).getSeconds()).isEqualTo(60);
        assertThat(codes.findAll()).extracting(ExtConnectCode::getCodeHash).doesNotContain(code);
    }

    @Test
    void onlyAnEnterpriseSessionOfAnActiveSeatCanMint() throws Exception {
        assertThat(mockMvc.perform(post("/api/extension/connect-code").header(HOST, ACME_HOST)).andReturn().getResponse().getStatus()).as("no token").isEqualTo(401);
        String personalAccess = login(PLATFORM_HOST, email, PERSONAL_PW).get("accessToken").asText();
        assertThat(call("POST", PLATFORM_HOST, personalAccess, "/api/extension/connect-code").getResponse().getStatus()).as("personal token").isEqualTo(404);
        // an enterprise account whose seat is gone
        String access = tenantAccess();
        members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), List.of(com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE)).forEach(m -> {
            m.setStatus(com.dossier.api.domain.enumeration.OrgMemberStatus.SUSPENDED);
            members.save(m);
        });
        assertThat(call("POST", ACME_HOST, access, "/api/extension/connect-code").getResponse().getStatus()).as("suspended seat").isEqualTo(404);
        assertThat(codes.count()).isZero();
    }

    @Test
    void mintingIsRateLimitedPerAccount() throws Exception {
        String access = tenantAccess();
        for (int i = 0; i < 10; i++) assertThat(call("POST", ACME_HOST, access, "/api/extension/connect-code").getResponse().getStatus()).as("try " + i).isEqualTo(200);
        MvcResult limited = call("POST", ACME_HOST, access, "/api/extension/connect-code");
        assertThat(limited.getResponse().getStatus()).isEqualTo(429);
        assertThat(limited.getResponse().getHeader("Retry-After")).isNotNull();
    }

    // ---- exchanging ------------------------------------------------------------------------------------------------------

    @Test
    void aCodeIsSingleUseAndTheSecondExchangeIsRefused() throws Exception {
        String code = mintCode(tenantAccess());
        MvcResult first = exchange(code);
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        JsonNode tokens = mapper.readTree(first.getResponse().getContentAsString());
        assertThat(claims(tokens.get("accessToken").asText()).get("userId").asLong()).isEqualTo(enterprise.getId());
        assertThat(rowOf(code).getUsedAt()).isNotNull();
        assertThat(exchange(code).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void theSingleUseGateIsExactlyOnce() {
        String code = service.mint(enterprise.getId(), acme.getId());
        assertThat(service.spend(code)).hasValueSatisfying(spent -> {
            assertThat(spent.userId()).isEqualTo(enterprise.getId());
            assertThat(spent.orgId()).isEqualTo(acme.getId());
        });
        assertThat(service.spend(code)).as("the second spend finds it used").isEmpty();
        assertThat(codes.consume(sha256(code), Instant.now())).as("and so does a direct conditional update").isZero();
    }

    @Test
    void anExpiredCodeIsRefused() throws Exception {
        String code = mintCode(tenantAccess());
        ExtConnectCode row = rowOf(code);
        row.setExpiresAt(Instant.now().minusSeconds(1));
        codes.saveAndFlush(row);
        assertThat(exchange(code).getResponse().getStatus()).isEqualTo(401);
        assertThat(rowOf(code).getUsedAt()).as("an expired code is not even marked used").isNull();
    }

    @Test
    void aCodeBoundToTheWrongUserOrOrganizationIsRefused() throws Exception {
        // wrong user: the row names the personal account of the same address (no org_id): never an enterprise session
        String code1 = mintCode(tenantAccess());
        ExtConnectCode a = rowOf(code1);
        a.setUserId(personal.getId());
        codes.saveAndFlush(a);
        assertThat(exchange(code1).getResponse().getStatus()).as("wrong user").isEqualTo(401);

        // wrong tid: the row names another organization than the account's
        String code2 = mintCode(tenantAccess());
        ExtConnectCode b = rowOf(code2);
        b.setOrgId(other.getId());
        codes.saveAndFlush(b);
        assertThat(exchange(code2).getResponse().getStatus()).as("wrong tid").isEqualTo(401);

        // the right pair works, and the session is for that account only
        String code3 = mintCode(tenantAccess());
        MvcResult ok = exchange(code3);
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        JsonNode c = claims(mapper.readTree(ok.getResponse().getContentAsString()).get("accessToken").asText());
        assertThat(c.get("userId").asLong()).isEqualTo(enterprise.getId());
        assertThat(c.get("tid").asLong()).isEqualTo(acme.getId());
    }

    @Test
    void aCodeDiesWithTheSeatAndWithAnAccountThatMustChangeItsPassword() throws Exception {
        String code = mintCode(tenantAccess());
        members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), List.of(com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE)).forEach(m -> {
            m.setStatus(com.dossier.api.domain.enumeration.OrgMemberStatus.REMOVED);
            members.save(m);
        });
        assertThat(exchange(code).getResponse().getStatus()).isEqualTo(401);

        // an account that must still change an administrator-issued password can not start an extension session either
        members.findByOrgIdAndUserIdAndStatusIn(acme.getId(), enterprise.getId(), List.of(com.dossier.api.domain.enumeration.OrgMemberStatus.REMOVED)).forEach(m -> {
            m.setStatus(com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE);
            members.save(m);
        });
        String again = service.mint(enterprise.getId(), acme.getId());
        enterprise.setPasswordChangeRequired(true);
        users.saveAndFlush(enterprise);
        assertThat(exchange(again).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void everyFailureIsTheSameEmptyAnswerSoACodeRevealsNothing() throws Exception {
        String spent = mintCode(tenantAccess());
        assertThat(exchange(spent).getResponse().getStatus()).isEqualTo(200);
        String expired = mintCode(tenantAccess());
        ExtConnectCode row = rowOf(expired);
        row.setExpiresAt(Instant.now().minusSeconds(5));
        codes.saveAndFlush(row);

        List<MvcResult> failures = List.of(
            exchange(spent), // already used
            exchange(expired), // expired
            exchange("A".repeat(43)), // well-formed but unknown
            exchange("short"), // malformed
            exchange(""), // empty
            mockMvc.perform(post("/api/extension/connect-code/exchange").contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn(), // no code
            mockMvc.perform(post("/api/extension/connect-code/exchange").contentType(MediaType.APPLICATION_JSON).content("{\"code\":12}")).andReturn() // not a string
        );
        for (MvcResult f : failures) {
            assertThat(f.getResponse().getStatus()).isEqualTo(401);
            assertThat(f.getResponse().getContentAsString()).as("no body, no hint").isEmpty();
        }
    }

    @Test
    void theExchangeIsPublicAndRateLimitedPerClientAddress() throws Exception {
        for (int i = 0; i < 60; i++) assertThat(exchange("B".repeat(43)).getResponse().getStatus()).isEqualTo(401);
        MvcResult limited = exchange("B".repeat(43));
        assertThat(limited.getResponse().getStatus()).isEqualTo(429);
        assertThat(limited.getResponse().getHeader("Retry-After")).isNotNull();
    }

    @Test
    void theExtensionSessionNamesTheAccountButNeverTheSyntheticLogin() throws Exception {
        JsonNode s = extensionSession();
        assertThat(s.get("kind").asText()).isEqualTo("ENTERPRISE");
        assertThat(s.get("userId").asLong()).isEqualTo(enterprise.getId());
        assertThat(s.get("orgId").asLong()).isEqualTo(acme.getId());
        assertThat(s.get("email").asText()).isEqualTo(email);
        assertThat(s.has("username")).isFalse();
        assertThat(mapper.writeValueAsString(s)).doesNotContain("ent#");
        // a fresh refresh family each time: two connects never share a rotation chain
        JsonNode t = extensionSession();
        assertThat(claims(s.get("refreshToken").asText()).get("jti").asText()).isNotEqualTo(claims(t.get("refreshToken").asText()).get("jti").asText());
    }

    @Test
    void nothingStoredOrReturnedMentionsThePersonalAccountOfTheSameAddress() throws Exception {
        String code = mintCode(tenantAccess());
        ExtConnectCode row = rowOf(code);
        assertThat(row.getUserId()).isNotEqualTo(personal.getId());
        String body = exchange(code).getResponse().getContentAsString();
        assertThat(body).doesNotContain(personal.getLogin());
        assertThat(mapper.readTree(body).get("userId").asLong()).isNotEqualTo(personal.getId());
    }
}
