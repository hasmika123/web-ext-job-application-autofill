package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgHostname;
import com.dossier.api.repository.ent.OrgHostnameRepository;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.domains.DnsLookup;
import com.dossier.api.service.ent.domains.OrgDomainService;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Custom domains through the real chain with a scripted DNS (docs/enterprise-v2/CUSTOM-DOMAINS-BUILD.md, A4). A domain is added, its records are
 * published, it verifies and goes live, so the resolver serves the organization there and the edge may issue its certificate. It is then suspended,
 * resumed and removed. Also covered: the refusals, the tenant wall, and the re-check job suspending a domain whose DNS broke past the grace period.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Import(OrgDomainsIT.ScriptedDns.class)
class OrgDomainsIT extends MemberItSupport {

    /** DNS answers the test publishes; anything else is NODATA. */
    @TestConfiguration
    static class ScriptedDns {

        static final Map<String, List<String>> TXT = new ConcurrentHashMap<>();
        static final Map<String, List<String>> CNAME = new ConcurrentHashMap<>();

        @Bean
        @Primary
        DnsLookup scriptedDnsLookup() {
            return new DnsLookup() {
                @Override
                public Answer txt(String name) {
                    return Answer.of(TXT.getOrDefault(name, List.of()));
                }

                @Override
                public Answer cname(String name) {
                    return Answer.of(CNAME.getOrDefault(name, List.of()));
                }

                @Override
                public Answer a(String name) {
                    return Answer.of(List.of());
                }
            };
        }
    }

    @Autowired private OrgHostnameRepository hostnames;
    @Autowired private OrgDomainService domains;
    @Autowired private TenantResolver resolver;

    @BeforeEach
    void domainsOn() {
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_DOMAINS, "{\"on\":true}", WHO, Instant.now()));
        settingsCache.invalidate();
        resolver.invalidate();
    }

    @AfterEach
    void forgetDns() {
        ScriptedDns.TXT.clear();
        ScriptedDns.CNAME.clear();
    }

    private String url(String rest) {
        return "/api/orgs/" + a.getId() + "/hostnames" + rest;
    }

    private JsonNode add(String host) throws Exception {
        MvcResult r = call(login("owner"), post(url("")), "{\"hostname\":\"" + host + "\"}");
        assertStatus(r, 201);
        return json(r);
    }

    private void publish(String host, long id) {
        String token = hostnames.findByOrgIdAndId(a.getId(), id).orElseThrow().getVerificationToken();
        ScriptedDns.TXT.put("_kiwiply-verify." + host, List.of("kiwiply-verify=" + token));
        ScriptedDns.CNAME.put(host, List.of("edge.kiwiply.com"));
    }

    @Test
    void aDomainIsAddedVerifiedAndGoesLiveThenSuspendedResumedAndRemoved() throws Exception {
        String host = "careers-" + p + ".example.org";
        JsonNode d = add(host.toUpperCase());
        long id = d.path("id").asLong();
        assertThat(d.path("hostname").asText()).as("stored lower-case").isEqualTo(host);
        assertThat(d.path("status").asText()).isEqualTo("PENDING");

        JsonNode ins = json(call(login("owner"), get(url("/" + id + "/instructions"))));
        assertThat(ins.path("records").get(0).path("type").asText()).isEqualTo("TXT");
        assertThat(ins.path("records").get(0).path("name").asText()).isEqualTo("_kiwiply-verify." + host);
        assertThat(ins.path("records").get(1).path("type").asText()).isEqualTo("CNAME");
        assertThat(ins.path("records").get(1).path("value").asText()).isEqualTo("edge.kiwiply.com");

        JsonNode missing = json(call(login("owner"), post(url("/" + id + "/verify"))));
        assertThat(missing.path("status").asText()).isEqualTo("PENDING");
        assertThat(missing.path("lastCheckResult").asText()).isEqualTo("TXT_MISSING");
        MvcResult tooSoon = call(login("owner"), post(url("/" + id + "/verify")));
        assertStatus(tooSoon, 429);

        publish(host, id);
        OrgHostname row = hostnames.findByOrgIdAndId(a.getId(), id).orElseThrow();
        row.setLastCheckAt(Instant.now().minus(Duration.ofMinutes(2)));
        hostnames.saveAndFlush(row);
        JsonNode live = json(call(login("owner"), post(url("/" + id + "/verify"))));
        assertThat(live.path("status").asText()).as("auto-activate is on by default").isEqualTo("ACTIVE");
        resolver.invalidate();
        assertThat(resolver.resolve(host).isTenant()).isTrue();
        assertThat(resolver.resolve(host).orgId()).isEqualTo(a.getId());
        assertThat(resolver.certificateAllowed(host)).as("the edge may issue its certificate").isTrue();
        assertThat(audit.findByOrgIdAndAction(a.getId(), "DOMAIN_ACTIVATED", org.springframework.data.domain.PageRequest.of(0, 5)).getTotalElements()).isEqualTo(1);

        assertStatus(call(login("owner"), post(url("/" + id + "/suspend")), "{\"reason\":\"Moving to a new provider\"}"), 200);
        resolver.invalidate();
        assertThat(resolver.resolve(host).isTenant()).isFalse();
        assertThat(resolver.certificateAllowed(host)).isFalse();
        assertThat(json(call(login("owner"), post(url("/" + id + "/resume")))).path("status").asText()).isEqualTo("ACTIVE");

        MvcResult wrong = call(login("owner"), post(url("/" + id + "/remove")), "{\"confirm\":\"something-else.example.org\"}");
        assertStatus(wrong, 422);
        assertThat(json(call(login("owner"), post(url("/" + id + "/remove")), "{\"confirm\":\"" + host + "\"}")).path("status").asText()).isEqualTo("REMOVED");
        resolver.invalidate();
        assertThat(resolver.resolve(host).isTenant()).isFalse();
        assertThat(json(call(login("owner"), get(url("")))).path("domains").toString()).doesNotContain(host);
        assertThat(add(host).path("status").asText()).as("a removed name can be added again").isEqualTo("PENDING");
    }

    @Test
    void kiwiplyNamesIpsAndTakenNamesAreRefusedAndTheWallHolds() throws Exception {
        for (String bad : new String[] { "acme.kiwiply.com", "kiwiply.com", "localhost", "10.0.0.1", "co.uk", "not a domain" }) {
            MvcResult r = call(login("owner"), post(url("")), "{\"hostname\":\"" + bad + "\"}");
            assertThat(r.getResponse().getStatus()).as(bad).isEqualTo(422);
        }
        String host = "jobs-" + p + ".example.org";
        long id = add(host).path("id").asLong();
        MvcResult taken = call(login("bowner"), post("/api/orgs/" + b.getId() + "/hostnames"), "{\"hostname\":\"" + host + "\"}");
        assertThat(taken.getResponse().getStatus()).as(taken.getResponse().getContentAsString()).isIn(409, 404); // 404 when the module is off for B
        assertGeneric404(call(login("bowner"), get(url("/" + id + "/instructions"))), "another organization's domain");
        assertGeneric404(call(login("plain"), get(url(""))), "a member without domains.manage");
    }

    @Test
    void theRecheckSuspendsALiveDomainWhoseDnsBrokePastTheGracePeriod() throws Exception {
        String host = "apply-" + p + ".example.org";
        long id = add(host).path("id").asLong();
        publish(host, id);
        Instant now = Instant.now();
        assertThat(domains.recheck(a.getId(), id, now)).isEqualTo("ACTIVE");
        ScriptedDns.CNAME.remove(host); // the customer changed their DNS
        assertThat(domains.recheck(a.getId(), id, now.plus(Duration.ofHours(25)))).as("inside the grace period it stays live").isEqualTo("ACTIVE");
        assertThat(hostnames.findByOrgIdAndId(a.getId(), id).orElseThrow().getFailingSince()).isNotNull();
        assertThat(domains.recheck(a.getId(), id, now.plus(Duration.ofHours(25 + 73)))).isEqualTo("SUSPENDED");
        assertThat(audit.findByOrgIdAndAction(a.getId(), "DOMAIN_SUSPENDED", org.springframework.data.domain.PageRequest.of(0, 5)).getTotalElements()).isEqualTo(1);
    }
}
