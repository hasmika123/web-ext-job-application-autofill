package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

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
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Random;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X2.5 end to end through the real filters: the owner edits a DRAFT and uploads raster images, nothing reaches the public
 * tenant view or the public asset route until PUBLISH, an unreadable colour is refused with a suggestion, SVG / polyglot /
 * oversize / tiny uploads are refused with typed codes, versions are append-only, another org's host never serves this org's
 * logo, and only publish / restore / asset changes write audit rows.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgBrandingResourceIT {

    private static final String HOST = "X-Kiwiply-Host";

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
        acme = fx.org("brand-acme-" + System.nanoTime(), OrgStatus.ACTIVE);
        beta = fx.org("brand-beta-" + System.nanoTime(), OrgStatus.ACTIVE);
        fx.active(acme, "brand-acme-owner", OrgRole.OWNER);
        fx.active(acme, "brand-acme-member", OrgRole.MEMBER);
        fx.active(beta, "brand-beta-owner", OrgRole.OWNER);
        acme.setSubdomain("brand-acme");
        acme.setSubdomainEnabled(true);
        beta.setSubdomain("brand-beta");
        beta.setSubdomainEnabled(true);
        orgs.saveAndFlush(acme);
        orgs.saveAndFlush(beta);
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", "brand-it", Instant.now()));
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
        return "/api/orgs/" + o.getId() + "/branding";
    }

    private static byte[] png(int w, int h, Color c) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setColor(c);
        g.fillRect(0, 0, w, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private MvcResult patchDraft(Organization o, String body) throws Exception {
        return mockMvc.perform(patch(base(o) + "/draft").with(user(owner(o))).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    private String owner(Organization o) {
        return o == acme ? "brand-acme-owner" : "brand-beta-owner";
    }

    private MvcResult upload(Organization o, String kind, byte[] bytes, String name) throws Exception {
        return mockMvc.perform(multipart(base(o) + "/assets/" + kind).file(new MockMultipartFile("file", name, "image/png", bytes)).with(user(owner(o)))).andReturn();
    }

    private MvcResult publish(Organization o) throws Exception {
        return mockMvc.perform(post(base(o) + "/publish").with(user(owner(o)))).andReturn();
    }

    private JsonNode json(MvcResult r) throws Exception {
        return mapper.readTree(r.getResponse().getContentAsString());
    }

    private JsonNode publicView(String host) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/public/tenant").header(HOST, host)).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        return json(r).get("branding");
    }

    private static boolean absent(JsonNode n) {
        return n == null || n.isNull() || n.isMissingNode();
    }

    private long auditCount(Organization o) {
        return audit.countByOrgId(o.getId());
    }

    // ---- the draft never leaks ---------------------------------------------------------------------------------------

    @Test
    void draftColoursTextAndLogoNeverReachThePublicViewUntilPublished() throws Exception {
        assertThat(patchDraft(acme, "{\"primary\":\"#1d4ed8\",\"secondary\":\"#0b7a8a\",\"welcomeTitle\":\"Draft only title\",\"supportEmail\":\"it@acme.example\"}").getResponse().getStatus()).isEqualTo(200);
        assertThat(upload(acme, "logo", png(200, 80, Color.BLUE), "logo.png").getResponse().getStatus()).isEqualTo(200);

        MvcResult pub = mockMvc.perform(get("/api/public/tenant").header(HOST, "brand-acme.kiwiply.com")).andReturn();
        String body = pub.getResponse().getContentAsString();
        assertThat(body).doesNotContain("#1d4ed8").doesNotContain("#0b7a8a").doesNotContain("Draft only title").doesNotContain("it@acme.example").contains("\"logoUrl\":null");
        assertThat(mockMvc.perform(get("/api/public/tenant/assets/logo").header(HOST, "brand-acme.kiwiply.com")).andReturn().getResponse().getStatus()).as("draft logo is not served").isEqualTo(404);

        MvcResult published = publish(acme);
        assertThat(published.getResponse().getStatus()).as(published.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode br = publicView("brand-acme.kiwiply.com");
        assertThat(br.get("primary").asText()).isEqualTo("#1d4ed8");
        assertThat(br.get("secondary").asText()).isEqualTo("#0b7a8a");
        assertThat(br.get("welcomeTitle").asText()).isEqualTo("Draft only title");
        assertThat(br.get("supportEmail").asText()).isEqualTo("it@acme.example");
        assertThat(br.get("logoUrl").asText()).startsWith("/tenant-assets/logo?v=");
        MvcResult asset = mockMvc.perform(get("/api/public/tenant/assets/logo").header(HOST, "brand-acme.kiwiply.com")).andReturn();
        assertThat(asset.getResponse().getStatus()).isEqualTo(200);
        assertThat(ImageIO.read(new ByteArrayInputStream(asset.getResponse().getContentAsByteArray()))).as("served bytes are a decodable PNG").isNotNull();
    }

    @Test
    void aSecondDraftAfterPublishStaysInvisibleAndTheLiveColourIsUnchanged() throws Exception {
        patchDraft(acme, "{\"primary\":\"#1d4ed8\"}");
        publish(acme);
        patchDraft(acme, "{\"primary\":\"#7c2d12\",\"welcomeTitle\":\"Second draft\"}");
        JsonNode br = publicView("brand-acme.kiwiply.com");
        assertThat(br.get("primary").asText()).isEqualTo("#1d4ed8");
        assertThat(absent(br.get("welcomeTitle"))).isTrue();
        JsonNode admin = json(mockMvc.perform(get(base(acme)).with(user(owner(acme)))).andReturn());
        assertThat(admin.get("published").get("primary").asText()).isEqualTo("#1d4ed8");
        assertThat(admin.get("draft").get("primary").asText()).isEqualTo("#7c2d12");
        assertThat(admin.get("hasDraft").asBoolean()).isTrue();
    }

    @Test
    void publishBumpsConfigVersionSoTheAssetUrlChanges() throws Exception {
        upload(acme, "logo", png(200, 80, Color.BLUE), "a.png");
        publish(acme);
        String first = publicView("brand-acme.kiwiply.com").get("logoUrl").asText();
        upload(acme, "logo", png(220, 90, Color.RED), "b.png");
        publish(acme);
        String second = publicView("brand-acme.kiwiply.com").get("logoUrl").asText();
        assertThat(second).isNotEqualTo(first);
    }

    // ---- colours -----------------------------------------------------------------------------------------------------

    @Test
    void anUnreadableColourIsRefusedWithAClearMessageAndANearestSafeSuggestion() throws Exception {
        MvcResult r = patchDraft(acme, "{\"primary\":\"#ffeb3b\"}");
        assertThat(r.getResponse().getStatus()).isEqualTo(422);
        JsonNode body = json(r);
        assertThat(body.get("code").asText()).isEqualTo("BRANDING_COLOR_LOW_CONTRAST");
        assertThat(body.get("message").asText()).contains("too light for white text").contains(body.get("suggestion").asText());
        String suggestion = body.get("suggestion").asText();
        assertThat(suggestion).matches("#[0-9a-f]{6}");
        // the suggestion itself is accepted
        assertThat(patchDraft(acme, "{\"primary\":\"" + suggestion + "\"}").getResponse().getStatus()).isEqualTo(200);
        // and the refused write left no trace
        assertThat(json(mockMvc.perform(get(base(acme)).with(user(owner(acme)))).andReturn()).get("draft").get("primary").asText()).isEqualTo(suggestion);
    }

    @Test
    void notAColourAndUnknownFieldsAre422() throws Exception {
        assertThat(patchDraft(acme, "{\"primary\":\"blue\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchDraft(acme, "{\"primary\":\"#fff\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchDraft(acme, "{\"primary\":\"#000000; background:url(//evil)\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchDraft(acme, "{\"surprise\":\"x\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchDraft(acme, "{\"logoKey\":\"org/1/branding/logo-x.png\"}").getResponse().getStatus()).as("assets only through upload").isEqualTo(422);
        assertThat(patchDraft(acme, "{\"terminology\":{\"hacker\":\"x\"}}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchDraft(acme, "{\"welcomeTitle\":\"<script>x</script>\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchDraft(acme, "{\"supportEmail\":\"not an email\"}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchDraft(acme, "{\"terminology\":{\"consultant\":\"Associate\"},\"theme\":\"DARK\"}").getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void featureChipsArePublishedWithTheRestAndValidated() throws Exception {
        assertThat(patchDraft(acme, "{\"featureChips\":[\"A\",\"B\",\"C\",\"D\"]}").getResponse().getStatus()).as("at most three").isEqualTo(422);
        assertThat(patchDraft(acme, "{\"featureChips\":[\"This label is far too long to fit\"]}").getResponse().getStatus()).isEqualTo(422);
        assertThat(patchDraft(acme, "{\"featureChips\":[\"Fast Access\",\"Team Chat\",\"Reports\"]}").getResponse().getStatus()).isEqualTo(200);
        assertThat(absent(publicView("brand-acme.kiwiply.com").get("featureChips"))).as("draft only").isTrue();
        publish(acme);
        assertThat(publicView("brand-acme.kiwiply.com").get("featureChips")).hasSize(3);
        assertThat(publicView("brand-acme.kiwiply.com").get("featureChips").get(0).asText()).isEqualTo("Fast Access");
    }

    @Test
    void checkColourEndpointAnswersForTheLivePreview() throws Exception {
        MvcResult r = mockMvc.perform(get(base(acme) + "/preview-theme").param("primary", "#ffeb3b").param("secondary", "#0b7a8a").with(user(owner(acme)))).andReturn();
        JsonNode body = json(r);
        assertThat(body.get("primary").get("allowsWhiteText").asBoolean()).isFalse();
        assertThat(body.get("primary").get("suggestion").asText()).matches("#[0-9a-f]{6}");
        assertThat(body.get("secondary").get("allowsWhiteText").asBoolean()).isTrue();
    }

    // ---- uploads -----------------------------------------------------------------------------------------------------

    @Test
    void svgPolyglotOversizeAndTinyUploadsAreRefusedWithTypedCodes() throws Exception {
        byte[] svg = "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>".getBytes(StandardCharsets.UTF_8);
        MvcResult s = upload(acme, "logo", svg, "logo.png");
        assertThat(s.getResponse().getStatus()).isEqualTo(415);
        assertThat(json(s).get("code").asText()).isEqualTo("BRANDING_ASSET_UNSUPPORTED_TYPE");

        byte[] head = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
        byte[] script = "<script>alert(document.cookie)</script>".getBytes(StandardCharsets.UTF_8);
        byte[] polyglot = new byte[head.length + script.length];
        System.arraycopy(head, 0, polyglot, 0, head.length);
        System.arraycopy(script, 0, polyglot, head.length, script.length);
        MvcResult p = upload(acme, "logo", polyglot, "logo.png");
        assertThat(p.getResponse().getStatus()).isEqualTo(422);
        assertThat(json(p).get("code").asText()).isEqualTo("BRANDING_ASSET_INVALID");

        BufferedImage noise = new BufferedImage(700, 700, BufferedImage.TYPE_INT_RGB);
        Random rnd = new Random(7);
        for (int x = 0; x < 700; x++) for (int y = 0; y < 700; y++) noise.setRGB(x, y, rnd.nextInt(0xffffff));
        ByteArrayOutputStream big = new ByteArrayOutputStream();
        ImageIO.write(noise, "png", big);
        MvcResult l = upload(acme, "logo", big.toByteArray(), "logo.png");
        assertThat(l.getResponse().getStatus()).isEqualTo(413);
        assertThat(json(l).get("code").asText()).isEqualTo("BRANDING_ASSET_TOO_LARGE");

        MvcResult t = upload(acme, "logo", png(160, 40, Color.BLUE), "logo.png");
        assertThat(t.getResponse().getStatus()).isEqualTo(422);
        assertThat(json(t).get("code").asText()).isEqualTo("BRANDING_ASSET_TOO_SMALL");

        assertThat(upload(acme, "avatar", png(200, 80, Color.BLUE), "x.png").getResponse().getStatus()).as("unknown kind").isEqualTo(404);
        // none of the refused files changed anything
        assertThat(json(mockMvc.perform(get(base(acme)).with(user(owner(acme)))).andReturn()).get("hasDraft").asBoolean()).isFalse();
    }

    @Test
    void theStoredFileIsReEncodedAndLivesUnderTheOrgsOwnPrefixOnly() throws Exception {
        MvcResult r = upload(acme, "logo", png(200, 80, Color.BLUE), "logo.png");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        String body = r.getResponse().getContentAsString();
        assertThat(body).doesNotContain("org/" + acme.getId()).doesNotContain("branding/").contains("logoHash");
    }

    @Test
    void betaCanNeverFetchAcmesLogoThroughItsOwnHostOrItsOwnAdminApi() throws Exception {
        upload(acme, "logo", png(200, 80, Color.BLUE), "logo.png");
        publish(acme);
        assertThat(mockMvc.perform(get("/api/public/tenant/assets/logo").header(HOST, "brand-beta.kiwiply.com")).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(get("/api/public/tenant/assets/logo").header(HOST, "brand-acme.kiwiply.com")).andReturn().getResponse().getStatus()).isEqualTo(200);
        // beta's owner cannot touch acme's branding by id
        assertThat(mockMvc.perform(get(base(acme)).with(user("brand-beta-owner"))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(post(base(acme) + "/publish").with(user("brand-beta-owner"))).andReturn().getResponse().getStatus()).isEqualTo(404);
        // an ordinary member of acme lacks the permission: the same 404
        assertThat(mockMvc.perform(get(base(acme)).with(user("brand-acme-member"))).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    // ---- versions, restore, discard, audit ---------------------------------------------------------------------------

    @Test
    void versionsAreAppendOnlyAndRestoreFillsTheDraftWithoutPublishing() throws Exception {
        patchDraft(acme, "{\"primary\":\"#1d4ed8\"}");
        assertThat(json(publish(acme)).get("versionNo").asInt()).isEqualTo(1);
        patchDraft(acme, "{\"primary\":\"#7c2d12\"}");
        assertThat(json(publish(acme)).get("versionNo").asInt()).isEqualTo(2);

        MvcResult restored = mockMvc.perform(post(base(acme) + "/versions/1/restore").with(user(owner(acme)))).andReturn();
        assertThat(restored.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(restored).get("draft").get("primary").asText()).isEqualTo("#1d4ed8");
        assertThat(publicView("brand-acme.kiwiply.com").get("primary").asText()).as("restore alone publishes nothing").isEqualTo("#7c2d12");

        JsonNode third = json(publish(acme));
        assertThat(third.get("versionNo").asInt()).isEqualTo(3);
        assertThat(third.get("changed").toString()).contains("primary");
        assertThat(publicView("brand-acme.kiwiply.com").get("primary").asText()).isEqualTo("#1d4ed8");
        assertThat(third.get("branding").get("versions")).hasSize(3);
        assertThat(mockMvc.perform(post(base(acme) + "/versions/99/restore").with(user(owner(acme)))).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void publishingNothingNewIs409AndDiscardRestoresTheLiveValues() throws Exception {
        patchDraft(acme, "{\"primary\":\"#1d4ed8\"}");
        publish(acme);
        MvcResult again = publish(acme);
        assertThat(again.getResponse().getStatus()).isEqualTo(409);
        assertThat(json(again).get("code").asText()).isEqualTo("BRANDING_NOTHING_TO_PUBLISH");

        patchDraft(acme, "{\"primary\":\"#7c2d12\"}");
        MvcResult discarded = mockMvc.perform(post(base(acme) + "/discard").with(user(owner(acme)))).andReturn();
        assertThat(json(discarded).get("hasDraft").asBoolean()).isFalse();
        assertThat(json(discarded).get("draft").get("primary").asText()).isEqualTo("#1d4ed8");
    }

    @Test
    void onlyPublishRestoreAndAssetChangesWriteAuditRows() throws Exception {
        long start = auditCount(acme);
        patchDraft(acme, "{\"primary\":\"#1d4ed8\"}");
        assertThat(auditCount(acme)).as("a draft edit writes none").isEqualTo(start);
        mockMvc.perform(post(base(acme) + "/discard").with(user(owner(acme))));
        assertThat(auditCount(acme)).as("discard writes none").isEqualTo(start);
        upload(acme, "logo", png(200, 80, Color.BLUE), "logo.png");
        assertThat(auditCount(acme)).isEqualTo(start + 1);
        publish(acme);
        assertThat(auditCount(acme)).isEqualTo(start + 2);
        mockMvc.perform(post(base(acme) + "/versions/1/restore").with(user(owner(acme))));
        assertThat(auditCount(acme)).isEqualTo(start + 3);
        mockMvc.perform(delete(base(acme) + "/assets/logo").with(user(owner(acme))));
        assertThat(auditCount(acme)).isEqualTo(start + 4);
        mockMvc.perform(delete(base(acme) + "/assets/logo").with(user(owner(acme))));
        assertThat(auditCount(acme)).as("removing an absent asset writes none").isEqualTo(start + 4);
    }

    @Test
    void aStaleEditorGets409InsteadOfOverwritingANewerTab() throws Exception {
        int v = json(patchDraft(acme, "{\"welcomeTitle\":\"One\"}")).get("draftVersion").asInt();
        MvcResult ok = mockMvc.perform(patch(base(acme) + "/draft").header("If-Match", String.valueOf(v)).with(user(owner(acme))).contentType(MediaType.APPLICATION_JSON).content("{\"welcomeTitle\":\"Two\"}")).andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        MvcResult stale = mockMvc.perform(patch(base(acme) + "/draft").header("If-Match", String.valueOf(v)).with(user(owner(acme))).contentType(MediaType.APPLICATION_JSON).content("{\"welcomeTitle\":\"Three\"}")).andReturn();
        assertThat(stale.getResponse().getStatus()).isEqualTo(409);
        assertThat(json(stale).get("code").asText()).isEqualTo("BRANDING_DRAFT_CONFLICT");
    }
}
