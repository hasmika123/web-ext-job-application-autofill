package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tenant policy pages end to end through the real filters (docs/enterprise-v2/62): the template shows until a policy is published, a
 * draft or an in-review body is never public, only a Kiwiply admin publishes (the organization's own owner cannot), the reviewer's
 * comment reaches the organization, the body is sanitized, another organization can neither read nor change a policy, and turning
 * the review setting off lets a submission publish at once.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgPolicyResourceIT {

    private static final String HOST = "X-Kiwiply-Host";
    private static final String ACME_HOST = "pol-acme.kiwiply.com";
    private static final String BETA_HOST = "pol-beta.kiwiply.com";
    private static final String BODY = "{\"body\":\"# Acme privacy\\n\\nWe keep **little** data. Write to [us](mailto:privacy@acme.example).\"}";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AppSettingRepository rows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private TenantResolver resolver;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgAuditEventRepository audit;

    private Organization acme;
    private Organization beta;

    @BeforeEach
    void seed() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        acme = fx.org("pol-acme-" + System.nanoTime(), OrgStatus.ACTIVE);
        beta = fx.org("pol-beta-" + System.nanoTime(), OrgStatus.ACTIVE);
        fx.active(acme, "pol-acme-owner", OrgRole.OWNER);
        fx.active(acme, "pol-acme-member", OrgRole.MEMBER);
        fx.active(beta, "pol-beta-owner", OrgRole.OWNER);
        acme.setSubdomain("pol-acme");
        acme.setSubdomainEnabled(true);
        acme.setDisplayName("Acme Staffing");
        beta.setSubdomain("pol-beta");
        beta.setSubdomainEnabled(true);
        beta.setDisplayName("Beta Talent");
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", "pol-it", Instant.now()));
        cache.invalidate();
        resolver.invalidate();
    }

    @AfterEach
    void drop() {
        resolver.invalidate();
        cache.invalidate();
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------

    private String base(Organization o) {
        return "/api/orgs/" + o.getId() + "/policies";
    }

    private String owner(Organization o) {
        return o == acme ? "pol-acme-owner" : "pol-beta-owner";
    }

    private MvcResult saveDraft(Organization o, String body) throws Exception {
        return mockMvc.perform(put(base(o) + "/PRIVACY/draft").with(user(owner(o))).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    private MvcResult orgPost(Organization o, String path) throws Exception {
        return mockMvc.perform(post(base(o) + path).with(user(owner(o)))).andReturn();
    }

    private MvcResult reviewer(String path, String body) throws Exception {
        return mockMvc.perform(post("/api/admin/org-policies" + path).with(user("kiwiply-reviewer").authorities(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN)))
            .contentType(MediaType.APPLICATION_JSON).content(body == null ? "{}" : body)).andReturn();
    }

    private JsonNode json(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private MvcResult publicPolicy(String host, String kind) throws Exception {
        return mockMvc.perform(get("/api/public/tenant/policies/" + kind).header(HOST, host)).andReturn();
    }

    private long queueId(String orgName) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/admin/org-policies").with(user("kiwiply-reviewer").authorities(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN)))).andReturn();
        for (JsonNode row : json(r)) {
            if (orgName.equals(row.get("orgName").asText())) return row.get("id").asLong();
        }
        throw new AssertionError("no queued submission of " + orgName + " in " + r.getResponse().getContentAsString());
    }

    private void reviewOn(boolean on) {
        rows.save(new AppSetting(EnterpriseSettingKeys.POLICIES_REQUIRE_REVIEW, String.valueOf(on), "pol-it", Instant.now()));
        cache.invalidate();
    }

    // ---- the template -------------------------------------------------------------------------------------------------

    @Test
    void neverPublishedShowsTheNeutralTemplateWithTheOrganizationNameAndNoKiwiply() throws Exception {
        for (String kind : new String[] { "PRIVACY", "TERMS", "ACCEPTABLE_USE", "SUPPORT_CONTACT", "privacy", "acceptable-use", "support" }) {
            MvcResult r = publicPolicy(ACME_HOST, kind);
            assertThat(r.getResponse().getStatus()).as(kind).isEqualTo(200);
            JsonNode p = json(r);
            assertThat(p.get("source").asText()).isEqualTo("TEMPLATE");
            assertThat(p.get("orgName").asText()).isEqualTo("Acme Staffing");
            assertThat(p.get("body").asText()).contains("Acme Staffing").doesNotContainIgnoringCase("kiwiply");
        }
        assertThat(publicPolicy(ACME_HOST, "PRIVACY").getResponse().getHeader("Cache-Control")).contains("max-age=60").contains("public");
    }

    @Test
    void theIndexListsTheConfiguredKindsWithTheirPaths() throws Exception {
        JsonNode kinds = json(mockMvc.perform(get("/api/public/tenant/policies").header(HOST, ACME_HOST)).andReturn());
        assertThat(kinds).hasSize(4);
        assertThat(kinds.get(0).get("path").asText()).isEqualTo("/privacy");
        assertThat(kinds.get(2).get("path").asText()).isEqualTo("/acceptable-use");
        assertThat(kinds.get(3).get("path").asText()).isEqualTo("/support");
    }

    @Test
    void aPlatformHostAnUnknownHostAnUnknownKindAndNoHostAreTheSameGeneric404() throws Exception {
        assertThat(publicPolicy("kiwiply.com", "PRIVACY").getResponse().getStatus()).isEqualTo(404);
        assertThat(publicPolicy("nobody.kiwiply.com", "PRIVACY").getResponse().getStatus()).isEqualTo(404);
        assertThat(publicPolicy(ACME_HOST, "NOT_A_KIND").getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(get("/api/public/tenant/policies/PRIVACY")).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void startFromTemplateFillsTheDraftWithTheOrganizationsNameAndStaysPrivate() throws Exception {
        MvcResult r = orgPost(acme, "/PRIVACY/template");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(r).get("draftBody").asText()).contains("Acme Staffing").doesNotContainIgnoringCase("kiwiply");
        assertThat(audit.countByOrgId(acme.getId())).isPositive();
    }

    // ---- the workflow -----------------------------------------------------------------------------------------------------

    @Test
    void aDraftAndAnInReviewBodyAreNeverPublicAndOnlyAReviewerPublishes() throws Exception {
        assertThat(saveDraft(acme, BODY).getResponse().getStatus()).isEqualTo(200);
        assertThat(json(publicPolicy(ACME_HOST, "PRIVACY")).get("source").asText()).as("draft is not public").isEqualTo("TEMPLATE");

        MvcResult submitted = orgPost(acme, "/PRIVACY/request-review");
        assertThat(submitted.getResponse().getStatus()).as(submitted.getResponse().getContentAsString()).isEqualTo(200);
        assertThat(json(submitted).get("state").asText()).isEqualTo("IN_REVIEW");
        assertThat(publicPolicy(ACME_HOST, "PRIVACY").getResponse().getContentAsString()).as("in review is not public").doesNotContain("Acme privacy");

        // the organization's own owner has no way to publish, and cannot edit while it is in review
        assertThat(saveDraft(acme, BODY).getResponse().getStatus()).isEqualTo(409);
        assertThat(mockMvc.perform(post("/api/admin/org-policies/1/approve").with(user(owner(acme))).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().getResponse().getStatus()).isIn(401, 403);

        long id = queueId("Acme Staffing");
        MvcResult approved = reviewer("/" + id + "/approve", "{\"comment\":\"Looks good\"}");
        assertThat(approved.getResponse().getStatus()).as(approved.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode live = json(publicPolicy(ACME_HOST, "PRIVACY"));
        assertThat(live.get("source").asText()).isEqualTo("PUBLISHED");
        assertThat(live.get("version").asInt()).isEqualTo(1);
        assertThat(live.get("body").asText()).contains("# Acme privacy");
        assertThat(live.has("state")).isFalse();
        assertThat(live.has("reviewComment")).isFalse();

        JsonNode detail = json(mockMvc.perform(get(base(acme) + "/PRIVACY").with(user(owner(acme)))).andReturn());
        assertThat(detail.get("state").asText()).isEqualTo("PUBLISHED");
        assertThat(detail.get("liveVersion").asInt()).isEqualTo(1);
        assertThat(audit.findByOrgId(acme.getId(), org.springframework.data.domain.Pageable.unpaged()).getContent()).extracting(e -> e.getAction()).contains("POLICY_SUBMIT", "POLICY_APPROVE");
        assertThat(audit.findByOrgId(acme.getId(), org.springframework.data.domain.Pageable.unpaged()).getContent().stream().filter(e -> "POLICY_APPROVE".equals(e.getAction())).findFirst().orElseThrow().getActorLogin()).isEqualTo("kiwiply-reviewer");
    }

    @Test
    void aNewDraftOverALivePolicyKeepsTheLiveTextPublicAndASecondApprovalSupersedesTheFirst() throws Exception {
        saveDraft(acme, BODY);
        orgPost(acme, "/PRIVACY/request-review");
        reviewer("/" + queueId("Acme Staffing") + "/approve", null);

        assertThat(saveDraft(acme, "{\"body\":\"# Acme privacy v2\\n\\nNew text.\"}").getResponse().getStatus()).isEqualTo(200);
        assertThat(json(publicPolicy(ACME_HOST, "PRIVACY")).get("body").asText()).contains("# Acme privacy").doesNotContain("v2");
        orgPost(acme, "/PRIVACY/request-review");
        long second = queueId("Acme Staffing");
        JsonNode review = json(mockMvc.perform(get("/api/admin/org-policies/" + second).with(user("kiwiply-reviewer").authorities(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN)))).andReturn());
        assertThat(review.get("liveBody").asText()).contains("# Acme privacy").doesNotContain("v2");
        assertThat(review.get("proposedBody").asText()).contains("v2");

        reviewer("/" + second + "/approve", null);
        JsonNode live = json(publicPolicy(ACME_HOST, "PRIVACY"));
        assertThat(live.get("version").asInt()).isEqualTo(2);
        JsonNode versions = json(mockMvc.perform(get(base(acme) + "/PRIVACY").with(user(owner(acme)))).andReturn()).get("versions");
        assertThat(versions.get(0).get("status").asText()).isEqualTo("PUBLISHED");
        assertThat(versions.get(1).get("status").asText()).isEqualTo("SUPERSEDED");
    }

    @Test
    void requestChangesNeedsACommentAndTheOrganizationSeesIt() throws Exception {
        saveDraft(acme, BODY);
        orgPost(acme, "/PRIVACY/request-review");
        long id = queueId("Acme Staffing");
        assertThat(reviewer("/" + id + "/request-changes", "{}").getResponse().getStatus()).isEqualTo(422);
        MvcResult sent = reviewer("/" + id + "/request-changes", "{\"comment\":\"Please name your data protection contact.\"}");
        assertThat(sent.getResponse().getStatus()).as(sent.getResponse().getContentAsString()).isEqualTo(200);

        JsonNode detail = json(mockMvc.perform(get(base(acme) + "/PRIVACY").with(user(owner(acme)))).andReturn());
        assertThat(detail.get("state").asText()).isEqualTo("CHANGES_REQUESTED");
        assertThat(detail.get("reviewComment").asText()).contains("data protection contact");
        assertThat(json(publicPolicy(ACME_HOST, "PRIVACY")).get("source").asText()).isEqualTo("TEMPLATE");
        // already decided: a second decision is a state conflict, and the organization can edit and resubmit
        assertThat(reviewer("/" + id + "/approve", null).getResponse().getStatus()).isEqualTo(409);
        assertThat(saveDraft(acme, "{\"body\":\"# Acme privacy\\n\\nData protection contact: dpo@acme.example\"}").getResponse().getStatus()).isEqualTo(200);
        assertThat(json(orgPost(acme, "/PRIVACY/request-review")).get("state").asText()).isEqualTo("IN_REVIEW");
    }

    @Test
    void theOrgAdminCanWithdrawAnInReviewSubmissionAndTheReviewerCanNoLongerDecideIt() throws Exception {
        saveDraft(acme, BODY);
        orgPost(acme, "/PRIVACY/request-review");
        long id = queueId("Acme Staffing");
        MvcResult w = orgPost(acme, "/PRIVACY/withdraw");
        assertThat(w.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(w).get("state").asText()).isEqualTo("DRAFT");
        assertThat(reviewer("/" + id + "/approve", null).getResponse().getStatus()).isEqualTo(409);
        assertThat(orgPost(acme, "/PRIVACY/withdraw").getResponse().getStatus()).as("nothing left to withdraw").isEqualTo(409);
        assertThat(json(publicPolicy(ACME_HOST, "PRIVACY")).get("source").asText()).isEqualTo("TEMPLATE");
    }

    @Test
    void submittingTextEqualToTheLiveOneIsRefused() throws Exception {
        saveDraft(acme, BODY);
        orgPost(acme, "/PRIVACY/request-review");
        reviewer("/" + queueId("Acme Staffing") + "/approve", null);
        saveDraft(acme, BODY); // same text again
        MvcResult r = orgPost(acme, "/PRIVACY/request-review");
        assertThat(r.getResponse().getStatus()).isEqualTo(409);
        assertThat(r.getResponse().getContentAsString()).contains("POLICY_NOTHING_TO_SEND");
    }

    @Test
    void withReviewSwitchedOffASubmissionPublishesAtOnce() throws Exception {
        reviewOn(false);
        saveDraft(acme, BODY);
        MvcResult r = orgPost(acme, "/PRIVACY/request-review");
        assertThat(json(r).get("state").asText()).isEqualTo("PUBLISHED");
        assertThat(json(publicPolicy(ACME_HOST, "PRIVACY")).get("source").asText()).isEqualTo("PUBLISHED");
    }

    // ---- sanitizing --------------------------------------------------------------------------------------------------

    @Test
    void htmlScriptsImagesAndUnsafeLinksAreRefusedWithATypedCode() throws Exception {
        String[] bad = {
            "# T\\n\\n<script>alert(1)</script>",
            "# T\\n\\n<b>bold</b>",
            "# T\\n\\n![tracker](https://evil.example/p.png)",
            "# T\\n\\n[click](javascript:alert(1))",
            "# T\\n\\n[click](data:text/html;base64,AAAA)",
            "# T\\n\\n[click](//evil.example/x)",
            "# T\\n\\n[ref]: https://evil.example",
            "",
        };
        for (String b : bad) {
            MvcResult r = saveDraft(acme, "{\"body\":\"" + b + "\"}");
            assertThat(r.getResponse().getStatus()).as(b).isEqualTo(422);
            assertThat(r.getResponse().getContentAsString()).as(b).contains("POLICY_BODY_INVALID");
        }
        assertThat(saveDraft(acme, "{\"body\":\"# T\\n\\n[ok](https://acme.example/x) and [mail](mailto:a@acme.example) and [here](/support)\"}").getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void aBodyOverTheAdminCapIsRefused() throws Exception {
        rows.save(new AppSetting(EnterpriseSettingKeys.POLICIES_MAX_CHARS, "500", "pol-it", Instant.now()));
        cache.invalidate();
        MvcResult r = saveDraft(acme, "{\"body\":\"" + "word ".repeat(120) + "\"}");
        assertThat(r.getResponse().getStatus()).isEqualTo(422);
        assertThat(r.getResponse().getContentAsString()).contains("POLICY_BODY_INVALID");
    }

    @Test
    void aStaleEditorGetsAConflict() throws Exception {
        JsonNode first = json(saveDraft(acme, BODY));
        int v = first.get("draftVersion").asInt();
        assertThat(mockMvc.perform(put(base(acme) + "/PRIVACY/draft").with(user(owner(acme))).header("If-Match", String.valueOf(v - 1)).contentType(MediaType.APPLICATION_JSON).content(BODY)).andReturn().getResponse().getStatus()).isEqualTo(409);
        assertThat(mockMvc.perform(put(base(acme) + "/PRIVACY/draft").with(user(owner(acme))).header("If-Match", String.valueOf(v)).contentType(MediaType.APPLICATION_JSON).content(BODY)).andReturn().getResponse().getStatus()).isEqualTo(200);
    }

    // ---- isolation ---------------------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationCannotReadOrChangeAPolicyAndEachHostServesItsOwn() throws Exception {
        saveDraft(acme, BODY);
        orgPost(acme, "/PRIVACY/request-review");
        reviewer("/" + queueId("Acme Staffing") + "/approve", null);

        // beta's owner naming acme's org id: the generic 404, nothing changed
        assertThat(mockMvc.perform(get(base(acme)).with(user(owner(beta)))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(put(base(acme) + "/PRIVACY/draft").with(user(owner(beta))).contentType(MediaType.APPLICATION_JSON).content(BODY)).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(post(base(acme) + "/PRIVACY/request-review").with(user(owner(beta)))).andReturn().getResponse().getStatus()).isEqualTo(404);
        // a plain member of acme has no permission: also the generic 404
        assertThat(mockMvc.perform(get(base(acme)).with(user("pol-acme-member"))).andReturn().getResponse().getStatus()).isEqualTo(404);

        // each host serves its own organization only
        assertThat(json(publicPolicy(BETA_HOST, "PRIVACY")).get("body").asText()).contains("Beta Talent").doesNotContain("Acme");
        assertThat(json(publicPolicy(ACME_HOST, "PRIVACY")).get("body").asText()).contains("# Acme privacy").doesNotContain("Beta Talent");
    }

    @Test
    void theReviewQueueNeedsThePlatformAdminAuthority() throws Exception {
        assertThat(mockMvc.perform(get("/api/admin/org-policies").with(user(owner(acme)))).andReturn().getResponse().getStatus()).isIn(401, 403);
        assertThat(mockMvc.perform(get("/api/admin/org-policies")).andReturn().getResponse().getStatus()).isIn(401, 403);
    }
}
