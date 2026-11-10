package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeDocVersionRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.resume.TemplateThemeDefaults;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageKeys;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@link ResumePhotoResource} (Resume Builder R7.4): upload with the metadata stripped, serve with a key ETag, replace
 * (the old file goes), remove, the refusals (413 / 415 / 422 / 403 feature switch), ownership (the generic 404 for every verb, nothing stored
 * for a stranger), a save that tries to name a photo key (422) or leave it out (the stored one stays), the PHOTO version row, an untouched
 * profile projection, and the purge of the files with the account.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class ResumePhotoResourceIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository userRepository;
    @Autowired private ResumeRepository resumeRepository;
    @Autowired private ResumeDocRepository resumeDocRepository;
    @Autowired private ResumeDocVersionRepository versions;
    @Autowired private AppSettingRepository appSettingRepository;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private FileStorage storage;
    @Autowired private AccountDeletionService accountDeletionService;

    @MockitoBean private TemplateThemeDefaults templateDefaults;

    /** Stripe is not what this test is about (the deletion test erases an account). */
    @MockitoBean private StripeGateway stripeGateway;

    private final List<String> keysToClean = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        for (String key : keysToClean) storage.delete(key);
        for (String login : List.of("user", "admin")) {
            userRepository.findOneByLogin(login).ifPresent(u -> storage.list(StorageKeys.RESUME_PHOTOS + "/" + u.getId() + "/", null).keys().forEach(storage::delete));
        }
        settings.invalidate();
    }

    // ---- helpers ------------------------------------------------------------

    private User owner() {
        return userRepository.findOneByLogin("user").orElseThrow();
    }

    private void setting(String key, String value) {
        appSettingRepository.saveAndFlush(new AppSetting(key, value, "it", Instant.now()));
        settings.invalidate();
    }

    private Long createResume() throws Exception {
        String res = mockMvc
            .perform(post("/api/profile/resumes/built").contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"Photo test\"}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
        return om.readTree(res).at("/resume/id").asLong();
    }

    /** Another user's built resume with a document, written straight through the repositories. */
    private Long strangersResume() {
        User other = userRepository.findOneByLogin("admin").orElseThrow();
        Resume r = new Resume().label("Theirs").r2ObjectKey("").status(ResumeStatus.CONFIRMED).createdAt(Instant.now());
        r.setKind(ResumeKind.BUILT);
        r.setUser(other);
        r = resumeRepository.saveAndFlush(r);
        ResumeDoc d = new ResumeDoc();
        d.setResume(r);
        d.setUser(other);
        d.setDocJson("{\"schema\":2,\"meta\":{\"title\":\"Theirs\"},\"basics\":{\"name\":\"Grace\"},\"sections\":[]}");
        d.setThemeJson("{}");
        d.setContentHash("0".repeat(64));
        resumeDocRepository.saveAndFlush(d);
        return r.getId();
    }

    private static BufferedImage picture(int w, int h) {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(40, 90, 160));
        g.fillRect(0, 0, w, h);
        g.setColor(Color.ORANGE);
        g.fillOval(w / 4, h / 4, w / 2, h / 2);
        g.dispose();
        return img;
    }

    private static byte[] encode(BufferedImage img, String fmt) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, fmt, out);
        return out.toByteArray();
    }

    /** A JPEG with an EXIF APP1 segment that carries a GPS-looking string. */
    private static byte[] jpegWithGps(int w, int h) throws IOException {
        byte[] jpeg = encode(picture(w, h), "jpeg");
        byte[] payload = ("Exif\0\0MM\0*\0\0\0\b\0\0\0\0\0\0GPSLatitude=51.5074N").getBytes(StandardCharsets.ISO_8859_1);
        int len = payload.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2);
        out.write(0xff);
        out.write(0xe1);
        out.write(len >> 8);
        out.write(len & 0xff);
        out.writeBytes(payload);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    private static boolean contains(byte[] bytes, String needle) {
        return new String(bytes, StandardCharsets.ISO_8859_1).contains(needle);
    }

    private org.springframework.test.web.servlet.ResultActions upload(Long id, byte[] bytes, String contentType) throws Exception {
        return mockMvc.perform(multipart("/api/profile/resumes/" + id + "/photo").file(new MockMultipartFile("file", "me.bin", contentType, bytes)));
    }

    private JsonNode doc(Long id) throws Exception {
        return om.readTree(mockMvc.perform(get("/api/profile/resumes/" + id + "/doc")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private String photoKey(Long id) throws Exception {
        JsonNode k = doc(id).at("/doc/basics/photo/key");
        return k.isMissingNode() || k.isNull() ? null : k.asText();
    }

    // ---- upload / serve / replace / remove -----------------------------------------------------------------------

    @Test
    void uploadStripsMetadataStoresUnderTheOwnersPrefixAndServesIt() throws Exception {
        Long id = createResume();
        String parsedBefore = resumeRepository.findById(id).orElseThrow().getParsedJson();
        int versionBefore = doc(id).get("docVersion").asInt();
        byte[] original = jpegWithGps(900, 600);
        assertThat(contains(original, "GPSLatitude")).isTrue();

        MvcResult up = upload(id, original, "image/jpeg")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.doc.basics.photo.key").value(org.hamcrest.Matchers.startsWith("resume-photos/" + owner().getId() + "/" + id + "-")))
            .andExpect(jsonPath("$.doc.basics.photo.updatedAt").exists())
            .andReturn();
        JsonNode saved = om.readTree(up.getResponse().getContentAsString());
        String key = saved.at("/doc/basics/photo/key").asText();
        assertThat(key).endsWith("-photo.jpg");
        assertThat(saved.get("docVersion").asInt()).as("a new ETag").isGreaterThan(versionBefore);
        assertThat(up.getResponse().getHeader(HttpHeaders.ETAG)).isEqualTo("\"" + saved.get("docVersion").asInt() + "\"");

        // the stored file is the rewritten one: a 512 px JPEG with no EXIF, no GPS
        FileStorage.StoredFile stored = storage.load(key);
        assertThat(stored.contentType()).isEqualTo("image/jpeg");
        assertThat(contains(stored.content(), "Exif")).isFalse();
        assertThat(contains(stored.content(), "GPS")).isFalse();
        BufferedImage img = ImageIO.read(new java.io.ByteArrayInputStream(stored.content()));
        assertThat(img.getWidth()).isEqualTo(512);
        assertThat(img.getHeight()).isEqualTo(512);

        // served to the owner, with the key as the ETag; a matching If-None-Match is a 304
        MvcResult served = mockMvc
            .perform(get("/api/profile/resumes/" + id + "/photo"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
            .andExpect(header().string(HttpHeaders.ETAG, "\"" + key + "\""))
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, org.hamcrest.Matchers.allOf(org.hamcrest.Matchers.containsString("private"), org.hamcrest.Matchers.containsString("max-age=300"))))
            .andReturn();
        assertThat(served.getResponse().getContentAsByteArray()).isEqualTo(stored.content());
        mockMvc.perform(get("/api/profile/resumes/" + id + "/photo").header(HttpHeaders.IF_NONE_MATCH, "\"" + key + "\"")).andExpect(status().isNotModified());

        // a PHOTO version row; the profile projection (what autofill reads) did not change
        assertThat(versions.findAll().stream().filter(v -> v.getResumeId().equals(id)).map(v -> v.getReason())).contains("PHOTO");
        assertThat(resumeRepository.findById(id).orElseThrow().getParsedJson()).isEqualTo(parsedBefore);
        assertThat(resumeDocRepository.findByResumeIdAndUserId(id, owner().getId()).orElseThrow().getPhotoKey()).isEqualTo(key);
        // the PDF is queued at once (the photo changes the render)
        assertThat(doc(id).at("/pdf/status").asText()).isIn("PENDING", "RUNNING", "READY");
    }

    @Test
    void pngAndWebpAreAccepted() throws Exception {
        Long id = createResume();
        upload(id, encode(picture(300, 300), "png"), "image/png").andExpect(status().isOk());
        assertThat(photoKey(id)).endsWith(".jpg");

        // a minimal extended WebP (the processor rebuilds the container; it does not decode the bitstream)
        ByteArrayOutputStream chunks = new ByteArrayOutputStream();
        byte[] vp8x = new byte[10];
        vp8x[4] = (byte) 255; vp8x[5] = 0; vp8x[7] = (byte) 255; vp8x[8] = 0; // 256 x 256
        writeChunk(chunks, "VP8X", vp8x);
        writeChunk(chunks, "VP8L", new byte[] { 0x2f, 1, 2, 3, 4, 5, 6, 7 });
        writeChunk(chunks, "EXIF", "GPSLatitude=51.5074N".getBytes(StandardCharsets.ISO_8859_1));
        ByteArrayOutputStream webp = new ByteArrayOutputStream();
        webp.writeBytes("RIFF".getBytes(StandardCharsets.ISO_8859_1));
        writeLe32(webp, 4 + chunks.size());
        webp.writeBytes("WEBP".getBytes(StandardCharsets.ISO_8859_1));
        webp.writeBytes(chunks.toByteArray());
        upload(id, webp.toByteArray(), "image/webp").andExpect(status().isOk());
        String key = photoKey(id);
        assertThat(key).endsWith(".webp");
        FileStorage.StoredFile stored = storage.load(key);
        assertThat(stored.contentType()).isEqualTo("image/webp");
        assertThat(contains(stored.content(), "GPS")).isFalse();
        mockMvc.perform(get("/api/profile/resumes/" + id + "/photo")).andExpect(status().isOk()).andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/webp"));
    }

    private static void writeLe32(ByteArrayOutputStream o, int v) {
        o.write(v & 0xff);
        o.write((v >> 8) & 0xff);
        o.write((v >> 16) & 0xff);
        o.write((v >> 24) & 0xff);
    }

    private static void writeChunk(ByteArrayOutputStream o, String id, byte[] payload) {
        o.writeBytes(id.getBytes(StandardCharsets.ISO_8859_1));
        writeLe32(o, payload.length);
        o.writeBytes(payload);
        if ((payload.length & 1) == 1) o.write(0);
    }

    @Test
    void replacingDeletesTheOldFileAndRemovingDeletesTheLast() throws Exception {
        Long id = createResume();
        upload(id, encode(picture(400, 400), "png"), "image/png").andExpect(status().isOk());
        String first = photoKey(id);
        assertThat(storage.exists(first)).isTrue();

        upload(id, encode(picture(500, 500), "png"), "image/png").andExpect(status().isOk());
        String second = photoKey(id);
        assertThat(second).isNotEqualTo(first);
        assertThat(storage.exists(first)).as("the replaced photo is deleted").isFalse();
        assertThat(storage.exists(second)).isTrue();

        mockMvc
            .perform(delete("/api/profile/resumes/" + id + "/photo"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.doc.basics.photo").value(org.hamcrest.Matchers.nullValue()));
        assertThat(storage.exists(second)).isFalse();
        assertThat(resumeDocRepository.findByResumeIdAndUserId(id, owner().getId()).orElseThrow().getPhotoKey()).isNull();
        mockMvc.perform(get("/api/profile/resumes/" + id + "/photo")).andExpect(status().isNotFound());
        // removing again is fine (idempotent) and writes nothing
        mockMvc.perform(delete("/api/profile/resumes/" + id + "/photo")).andExpect(status().isOk());
    }

    // ---- refusals -------------------------------------------------------------------------------------------------

    @Test
    void refusalsStoreNothing() throws Exception {
        Long id = createResume();
        String prefix = StorageKeys.RESUME_PHOTOS + "/" + owner().getId() + "/";

        // 415: a GIF, a PDF, an SVG with a script
        for (byte[] bytes : new byte[][] {
            "GIF89a.......".getBytes(StandardCharsets.ISO_8859_1),
            "%PDF-1.7 ......".getBytes(StandardCharsets.ISO_8859_1),
            "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>".getBytes(StandardCharsets.UTF_8),
        }) {
            upload(id, bytes, "image/jpeg") // the declared type is never believed
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("PHOTO_FORMAT"));
        }
        // 422: a JPEG that does not decode
        byte[] truncated = java.util.Arrays.copyOf(encode(picture(300, 300), "jpeg"), 60);
        upload(id, truncated, "image/jpeg").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PHOTO_INVALID"));
        // 413: over resume.photo.maxBytes (the setting's floor is 1 MB)
        byte[] big = new byte[5_242_880 + 10];
        big[0] = (byte) 0xff; big[1] = (byte) 0xd8; big[2] = (byte) 0xff;
        upload(id, big, "image/jpeg").andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.code").value("PHOTO_TOO_LARGE")).andExpect(jsonPath("$.maxBytes").value(5_242_880));
        setting("resume.photo.maxBytes", "1048576");
        byte[] mid = new byte[1_048_576 + 10];
        mid[0] = (byte) 0xff; mid[1] = (byte) 0xd8; mid[2] = (byte) 0xff;
        upload(id, mid, "image/jpeg").andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.maxBytes").value(1_048_576));

        assertThat(storage.list(prefix, null).keys()).as("a refused upload leaves no file").isEmpty();
        assertThat(photoKey(id)).isNull();
    }

    @Test
    void theAdminSwitchTurnsUploadsOffButNotRemoval() throws Exception {
        Long id = createResume();
        upload(id, encode(picture(300, 300), "png"), "image/png").andExpect(status().isOk());
        setting("feature.resume_photo.enabled", "false");

        upload(id, encode(picture(300, 300), "png"), "image/png").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FEATURE_DISABLED"));
        mockMvc.perform(delete("/api/profile/resumes/" + id + "/photo")).andExpect(status().isOk());
        assertThat(photoKey(id)).isNull();
    }

    // ---- ownership --------------------------------------------------------------------------------------------------

    @Test
    void anotherUsersResumeIsTheGeneric404ForEveryVerbAndNothingIsStored() throws Exception {
        Long theirs = strangersResume();
        Long strangerId = userRepository.findOneByLogin("admin").orElseThrow().getId();

        upload(theirs, encode(picture(300, 300), "png"), "image/png").andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/profile/resumes/" + theirs + "/photo")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/profile/resumes/" + theirs + "/photo")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/profile/resumes/999999999/photo")).andExpect(status().isNotFound());
        assertThat(storage.list(StorageKeys.RESUME_PHOTOS + "/" + strangerId + "/", null).keys()).isEmpty();
        assertThat(storage.list(StorageKeys.RESUME_PHOTOS + "/" + owner().getId() + "/", null).keys()).isEmpty();
    }

    @Test
    void theOwnersPhotoIsA404ToEveryoneElse() throws Exception {
        Long id = createResume();
        upload(id, encode(picture(300, 300), "png"), "image/png").andExpect(status().isOk());

        mockMvc.perform(get("/api/profile/resumes/" + id + "/photo").with(user("admin"))).andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/profile/resumes/" + id + "/photo").with(user("admin"))).andExpect(status().isNotFound());
        assertThat(photoKey(id)).as("still there").isNotNull();
    }

    // ---- a save and the photo key -----------------------------------------------------------------------------------

    private org.springframework.test.web.servlet.ResultActions save(Long id, JsonNode docResponse, ObjectNode doc) throws Exception {
        return mockMvc.perform(
            put("/api/profile/resumes/" + id + "/doc")
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.IF_MATCH, "\"" + docResponse.get("docVersion").asInt() + "\"")
                .content(om.writeValueAsString(Map.of("doc", doc)))
        );
    }

    @Test
    void aSaveCanOnlyNameThisResumesOwnPhotoKey() throws Exception {
        Long id = createResume();
        Long other = createResume();
        JsonNode before = doc(id);

        // another user's prefix, another resume's key (same user), a path trick: all 422 on the photo key
        String[] refused = {
            "resume-photos/" + (owner().getId() + 1) + "/" + id + "-x-photo.jpg",
            "resume-photos/" + owner().getId() + "/" + other + "-x-photo.jpg",
            "resume-photos/" + owner().getId() + "/" + id + "0-x-photo.jpg",
            "resume-photos/" + owner().getId() + "/../" + id + "-x-photo.jpg",
            "resumes/" + owner().getId() + "/" + id + "-x-photo.jpg",
        };
        for (String key : refused) {
            ObjectNode d = (ObjectNode) before.get("doc").deepCopy();
            ((ObjectNode) d.get("basics")).putObject("photo").put("key", key);
            save(id, before, d).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("DOC_INVALID")).andExpect(jsonPath("$.path").value("$.basics.photo.key"));
        }
        assertThat(photoKey(id)).isNull();
    }

    @Test
    void aSaveEchoesTheStoredPhotoAndMayTakeItOut() throws Exception {
        Long id = createResume();
        upload(id, encode(picture(300, 300), "png"), "image/png").andExpect(status().isOk());
        JsonNode withPhoto = doc(id);
        String stored = withPhoto.at("/doc/basics/photo/key").asText();

        ObjectNode echoed = (ObjectNode) withPhoto.get("doc").deepCopy();
        ((ObjectNode) echoed.get("basics")).put("name", "Ada L.");
        save(id, withPhoto, echoed).andExpect(status().isOk()).andExpect(jsonPath("$.doc.basics.photo.key").value(stored));
        assertThat(storage.exists(stored)).isTrue();

        JsonNode afterEcho = doc(id);
        ObjectNode dropped = (ObjectNode) afterEcho.get("doc").deepCopy();
        ((ObjectNode) dropped.get("basics")).putNull("photo");
        save(id, afterEcho, dropped).andExpect(status().isOk()).andExpect(jsonPath("$.doc.basics.photo").value(org.hamcrest.Matchers.nullValue()));
        assertThat(storage.exists(stored)).as("the file nothing points at any more is removed").isFalse();
    }

    @Test
    void theThemeSwitchForThePhotoIsPlainThemeData() throws Exception {
        Long id = createResume();
        mockMvc
            .perform(patch("/api/profile/resumes/" + id + "/doc/theme").contentType(MediaType.APPLICATION_JSON).content("{\"theme\":{\"showPhoto\":true}}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.theme.showPhoto").value(true));
    }

    // ---- erasure ---------------------------------------------------------------------------------------------------

    @Test
    void deletingTheAccountErasesEveryPhotoFileAndOnlyTheirs() throws Exception {
        Long id = createResume();
        upload(id, encode(picture(300, 300), "png"), "image/png").andExpect(status().isOk());
        String key = photoKey(id);
        // an orphan no row points at (a replaced photo whose delete failed) and a stranger's photo
        String orphan = "resume-photos/" + owner().getId() + "/" + id + "-it-orphan-photo.jpg";
        storage.store(orphan, new byte[] { 1, 2, 3 }, "image/jpeg");
        String stranger = "resume-photos/" + (owner().getId() + 100_000) + "/1-it-stranger-photo.jpg";
        storage.store(stranger, new byte[] { 9 }, "image/jpeg");
        keysToClean.add(stranger);
        assertThat(storage.exists(key)).isTrue();

        // MockMvc's security filter cleared the test thread's authentication when the last request ended: sign the same user in again.
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
            new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("user", "n/a", org.springframework.security.core.authority.AuthorityUtils.createAuthorityList("ROLE_USER"))
        );
        accountDeletionService.deleteCurrentUserAccount();

        assertThat(storage.exists(key)).isFalse();
        assertThat(storage.exists(orphan)).isFalse();
        assertThat(storage.exists(stranger)).as("another account's photo is untouched").isTrue();
        assertThat(userRepository.findOneByLogin("user")).isEmpty();
    }
}
