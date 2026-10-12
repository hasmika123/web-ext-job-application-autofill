package com.dossier.api.service;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.BuiltResumeDTO;
import com.dossier.api.service.dto.ResumeDTO;
import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.dto.ResumePdfDTO;
import com.dossier.api.service.resume.ResumeDocument;
import com.dossier.api.service.resume.ResumeDocumentCanonical;
import com.dossier.api.service.resume.ResumeDocumentJson;
import com.dossier.api.service.resume.ResumeDocumentProjector;
import com.dossier.api.service.resume.ResumeDocumentSeeder;
import com.dossier.api.service.resume.ResumeDocumentText;
import com.dossier.api.service.resume.ResumeDocumentUpgrader;
import com.dossier.api.service.resume.ResumeDocumentValidator;
import com.dossier.api.service.resume.ResumePdfState;
import com.dossier.api.service.resume.ResumeRenderHash;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The Resume Builder document endpoints' logic (R0.3): create a built resume seeded from the
 * profile, load a document, save it under optimistic locking, switch its template, render its text.
 *
 * <p>Every read goes through {@code findByResumeIdAndUserId}: another user's resume id is a 404,
 * indistinguishable from a missing one, for every verb. A save is validated
 * ({@link ResumeDocumentValidator}), hashed ({@link ResumeDocumentCanonical#contentHash}) and written
 * together with its {@code resume.parsed_json} projection, {@code resume.label} (= {@code meta.title})
 * and {@code resume.updated_at} in one transaction, so the extension's mirror never lags the document.
 */
@Service
@Transactional
public class ResumeDocService {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeDocService.class);

    /**
     * Template ids the API accepts. The registry itself lives in {@code packages/ui}; this list is
     * the server-side allow-list and must gain an id when a template ships there.
     */
    public static final Set<String> KNOWN_TEMPLATE_IDS = Set.of("modern", "classic", "compact");

    public static final String DEFAULT_TEMPLATE_ID = "modern";
    /** Photo keys are {@code resume-photos/<userId>/...} (DESIGN 5.3); a save may only echo a key under its owner's prefix. */
    private static final String PHOTO_KEY_PREFIX = "resume-photos/";
    private static final String DEFAULT_TITLE = "My resume";
    /** The theme is a small style object (colors, font, spacing); anything bigger is a mistake. */
    private static final int MAX_THEME_BYTES = 8 * 1024;
    private static final java.util.regex.Pattern HASH_PATTERN = java.util.regex.Pattern.compile("[0-9a-f]{64}");

    private final ResumeDocRepository resumeDocRepository;
    private final ProfileItemRepository profileItemRepository;
    private final BioRepository bioRepository;
    private final UserRepository userRepository;
    private final ProfileService profileService;
    private final ResumeRepository resumeRepository;
    private final ResumeBuilderSettings settings;

    public ResumeDocService(
        ResumeDocRepository resumeDocRepository,
        ProfileItemRepository profileItemRepository,
        BioRepository bioRepository,
        UserRepository userRepository,
        ProfileService profileService,
        ResumeRepository resumeRepository,
        ResumeBuilderSettings settings
    ) {
        this.settings = settings;
        this.resumeDocRepository = resumeDocRepository;
        this.profileItemRepository = profileItemRepository;
        this.bioRepository = bioRepository;
        this.userRepository = userRepository;
        this.profileService = profileService;
        this.resumeRepository = resumeRepository;
    }

    // ---- create -------------------------------------------------------------

    /**
     * Create a BUILT resume and its first document. The plan cap applies exactly as for an upload
     * ({@code 402 RESUME_LIMIT}, thrown before anything is written). The document is seeded from the
     * user's profile items when they have any, otherwise from the bio header alone.
     */
    public BuiltResumeDTO createBuilt(String templateId, String target, String label) {
        String template = templateId == null || templateId.isBlank() ? DEFAULT_TEMPLATE_ID : templateId;
        requireKnownTemplate(template);
        User user = currentUser();

        String title = firstNonBlank(label, target, DEFAULT_TITLE);
        if (title.length() > 200) title = title.substring(0, 200);

        ResumeDTO request = new ResumeDTO();
        request.setLabel(title);
        request.setStatus(ResumeStatus.CONFIRMED); // authored by the user: nothing to review
        ResumeDTO created = profileService.createResume(request, ResumeKind.BUILT);

        Instant now = Instant.now();
        JsonNode bio = bioRepository.findByUserIsCurrentUser().stream().findFirst().map(Bio::getPayload).map(ResumeDocService::parseQuietly).orElse(null);
        var items = profileItemRepository.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(user.getId());
        JsonNode doc = ResumeDocumentSeeder.seed(title, target, bio, items, now);
        // The seeder only emits valid documents; if a future change breaks that, a bare header beats a 500.
        ResumeDocumentValidator.Limits limits = limits();
        if (ResumeDocumentValidator.validate(doc, limits).isPresent()) {
            LOG.warn("Seeded document for user {} failed validation ({}); falling back to the bio header", user.getId(), ResumeDocumentValidator.validate(doc, limits).get());
            doc = ResumeDocumentSeeder.seed(title, target, bio, List.of(), now);
        }

        Resume resume = resumeRepository.findById(created.getId()).orElseThrow();
        ResumeDoc d = new ResumeDoc();
        d.setResume(resume);
        d.setUser(user);
        d.setTemplateId(template);
        d.setThemeJson("{}");
        d.setProfileSyncedAt(now);
        applyContent(d, resume, doc, now);
        markPdfPending(d, false);
        resumeDocRepository.saveAndFlush(d);

        created.setKind(ResumeKind.BUILT);
        created.setTemplateId(template);
        created.setParsedJson(resume.getParsedJson());
        return new BuiltResumeDTO(created, toDto(d, resume));
    }

    // ---- read ---------------------------------------------------------------

    @Transactional(readOnly = true)
    public ResumeDocDTO get(Long resumeId) {
        ResumeDoc d = ownedDoc(resumeId);
        return toDto(d, d.getResume());
    }

    /**
     * The document by resume id, with no owner check - for the PDF worker only ({@code /api/internal/**}, which
     * is token-guarded and never reachable with a user's JWT). 404 when there is no such document.
     */
    @Transactional(readOnly = true)
    public ResumeDocDTO getForWorker(Long resumeId) {
        ResumeDoc d = resumeDocRepository.findById(resumeId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume document not found"));
        return toDto(d, d.getResume());
    }

    @Transactional(readOnly = true)
    public String text(Long resumeId) {
        return ResumeDocumentText.render(parseQuietly(ownedDoc(resumeId).getDocJson()));
    }

    // ---- write --------------------------------------------------------------

    /**
     * Save the whole document ({@code body = {doc, theme?}}) if {@code ifMatch} names the version the
     * client loaded. Order of refusals: 404 (not yours) before 428 (no If-Match) before 409 (stale)
     * before 413/422 (the document itself), so a stale client always learns the server's state.
     */
    public ResumeDocDTO put(Long resumeId, String ifMatch, JsonNode body) {
        ResumeDoc d = ownedDoc(resumeId);
        if (ifMatch == null || ifMatch.isBlank()) {
            throw ResumeDocException.ifMatchRequired();
        }
        Integer expected = parseVersion(ifMatch);
        if (expected == null || expected != d.getDocVersion()) {
            throw conflict(d);
        }

        if (body == null || !body.isObject()) {
            throw ResumeDocException.invalid("$", "body must be an object {doc, theme?}");
        }
        // A v1 document is accepted and stored as v2 (DESIGN 3.6): upgrade first, then validate as v2.
        JsonNode doc = ResumeDocumentUpgrader.upgrade(body.get("doc"));
        // meta.tailoredFrom is server-written: a save may echo the stored value, never introduce, change or drop it.
        JsonNode storedTailoredFrom = tailoredFromOf(ResumeDocumentUpgrader.upgrade(parseQuietly(d.getDocJson())));
        JsonNode incomingTailoredFrom = tailoredFromOf(doc);
        boolean tailoredFromUnchanged = canonicalOrNull(storedTailoredFrom).equals(canonicalOrNull(incomingTailoredFrom));
        ResumeDocumentValidator.Options options = ResumeDocumentValidator.Options.DEFAULTS.withAllowTailoredFrom(
            tailoredFromUnchanged && storedTailoredFrom != null
        ).withPhotoKeyPrefix(PHOTO_KEY_PREFIX + d.getUser().getId() + "/").withLimits(limits());
        ResumeDocumentValidator.validate(doc, options).ifPresent(v -> {
            throw v.tooLarge() ? ResumeDocException.tooLarge(v.message()) : ResumeDocException.invalid(v.path(), v.message());
        });
        if (!tailoredFromUnchanged) {
            throw ResumeDocException.invalid("$.meta.tailoredFrom", "is set by the server and cannot be changed by a save");
        }
        JsonNode theme = body.get("theme");
        if (theme != null && !theme.isNull()) {
            if (!theme.isObject()) throw ResumeDocException.invalid("$.theme", "must be an object");
            if (ResumeDocumentJson.write(theme, 0).length() > MAX_THEME_BYTES) {
                throw ResumeDocException.invalid("$.theme", "must be at most " + MAX_THEME_BYTES + " bytes");
            }
            d.setThemeJson(ResumeDocumentJson.write(theme, 0));
        }

        Instant now = Instant.now();
        applyContent(d, d.getResume(), doc, now);
        markPdfPending(d, false);
        resumeDocRepository.saveAndFlush(d);
        return toDto(d, d.getResume());
    }

    /**
     * Switch the template. Needs no If-Match (choosing a template never loses typed text) but bumps
     * the version, so the response's ETag is what the editor must send next. Touches neither
     * {@code parsed_json} nor {@code label}, hence leaves {@link ProfileVersion} where it was.
     */
    public ResumeDocDTO setTemplate(Long resumeId, String templateId) {
        ResumeDoc d = ownedDoc(resumeId);
        requireKnownTemplate(templateId);
        d.setTemplateId(templateId);
        d.setUpdatedAt(Instant.now());
        d.getResume().setUpdatedAt(d.getUpdatedAt());
        markPdfPending(d, true); // a template switch is a checkpoint: no settle delay
        resumeDocRepository.saveAndFlush(d);
        return toDto(d, d.getResume());
    }

    /**
     * Record that a PDF of the document with content hash {@code hash} was exported and stored (R0.6).
     * Sets {@code exported_at} and {@code exported_hash} only: it never bumps {@code doc_version} or
     * touches the content, so an open editor's ETag stays valid. Whether the PDF is "out of date" is
     * then simply {@code exportedHash != contentHash}.
     */
    public void recordExport(Long resumeId, String hash) {
        ResumeDoc d = ownedDoc(resumeId);
        if (hash == null || !HASH_PATTERN.matcher(hash).matches()) {
            throw ResumeDocException.invalid("$.hash", "must be a 64-character lowercase hex content hash");
        }
        // A bulk update, not d.setExportedHash(..) + save: the entity's @Version would tick and the
        // editor's next autosave (If-Match: the old version) would 409 right after an export.
        resumeDocRepository.recordExport(d.getResumeId(), hash, Instant.now());
        // A synchronous export that stored the CURRENT render leaves nothing for the worker to do.
        if (hash.equals(renderHash(d))) {
            resumeDocRepository.markReadyNow(d.getResumeId());
        }
    }

    // ---- the async PDF pipeline's side of a save (R3.7, DESIGN 8.5) -----------------------------

    /**
     * The render hash of the document as stored now: {@code sha256(contentHash|templateId|canonical theme)}.
     * The stored PDF is up to date exactly when its {@code exported_hash} equals this.
     */
    public static String renderHash(ResumeDoc d) {
        return ResumeRenderHash.computeFromThemeJson(d.getContentHash(), d.getTemplateId(), d.getThemeJson());
    }

    /**
     * Called inside every write that can change the render hash (content or theme save, template switch,
     * and - as those stories land - photo, AI apply, restore, tailor-copy, checkpoint). If the stored PDF is
     * not this render, the row becomes (or stays) PENDING with its next attempt {@code settleMs} away - a
     * typing burst keeps pushing it out, so only the last state is rendered - or right now for a
     * checkpoint ({@code immediate}). The row itself is the job; nothing else is queued. If the stored PDF
     * already is this render (an edit was undone) the row is simply READY again.
     */
    public void markPdfPending(ResumeDoc d, boolean immediate) {
        String rh = renderHash(d);
        Instant now = Instant.now();
        if (rh.equals(d.getExportedHash())) {
            if (!ResumePdfState.RUNNING.equals(d.getPdfStatus()) && !ResumePdfState.READY.equals(d.getPdfStatus())) {
                d.setPdfStatus(ResumePdfState.READY);
                d.setPdfAttempts(0);
                d.setPdfError(null);
                d.setPdfNextAttemptAt(null);
            }
            return;
        }
        long delay = immediate ? 0 : settings.getInt(ResumeBuilderSettingKeys.PDF_SETTLE_MS);
        d.setPdfStatus(ResumePdfState.PENDING);
        d.setPdfRequestedAt(now);
        d.setPdfNextAttemptAt(now.plusMillis(delay));
        d.setPdfAttempts(0);
        d.setPdfError(null);
        d.setPdfLeaseUntil(null);
        d.setPdfWorker(null);
    }

    /** {@code GET .../doc/pdf-status}: the stored PDF's state, with the editor's polling hints. */
    @Transactional(readOnly = true)
    public ResumePdfDTO pdfStatus(Long resumeId) {
        return pdfOf(ownedDoc(resumeId));
    }

    /**
     * {@code POST .../doc/pdf-now}: leaving the editor, or Retry after FAILED. Queues the row immediately when
     * its stored PDF is not the current render (clearing a FAILED row's attempts); a no-op when it is current or
     * a render is already in flight. Never bumps the document version.
     */
    public void requestPdfNow(Long resumeId) {
        ResumeDoc d = ownedDoc(resumeId);
        resumeDocRepository.requestNow(d.getResumeId(), renderHash(d), Instant.now());
    }

    /** The server's document for a client that lost an optimistic-lock race (the 409 body). */
    @Transactional(readOnly = true)
    public ResumeDocException conflictFor(Long resumeId) {
        return conflict(ownedDoc(resumeId));
    }

    // ---- helpers ------------------------------------------------------------

    /** The document limits from the settings seam (resume.doc.limits.*, DESIGN 15.2). */
    private ResumeDocumentValidator.Limits limits() {
        return new ResumeDocumentValidator.Limits(
            settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_SECTIONS),
            settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_ITEMS),
            settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_BULLETS),
            settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_BULLET_CHARS),
            settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_SUMMARY_CHARS),
            settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_MARKS),
            settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_DOC_BYTES)
        );
    }

    /** Writes a validated document and everything derived from it onto the entity and its resume. */
    private void applyContent(ResumeDoc d, Resume resume, JsonNode doc, Instant now) {
        d.setDocJson(ResumeDocumentJson.write(doc, 0));
        d.setSchemaVersion(ResumeDocument.SCHEMA_VERSION);
        JsonNode photoKey = doc.path("basics").path("photo").get("key");
        d.setPhotoKey(photoKey != null && photoKey.isTextual() ? photoKey.textValue() : null);
        d.setContentHash(ResumeDocumentCanonical.contentHash(doc));
        d.setUpdatedAt(now);
        resume.setParsedJson(ResumeDocumentProjector.toStructuredJson(doc));
        String title = ResumeDocument.trimWs(doc.path("meta").path("title").asText(""));
        if (!title.isEmpty()) resume.setLabel(title);
        resume.setUpdatedAt(now);
    }

    private static void requireKnownTemplate(String templateId) {
        if (templateId == null || !KNOWN_TEMPLATE_IDS.contains(templateId)) {
            throw ResumeDocException.invalid("$.templateId", "unknown template '" + (templateId == null ? "" : templateId) + "'");
        }
    }

    private ResumeDocException conflict(ResumeDoc d) {
        return ResumeDocException.conflict(d.getDocVersion(), storedDoc(d));
    }

    /** The stored document as the current schema: a v1 row is upgraded in memory, never rewritten by a read. */
    private static JsonNode storedDoc(ResumeDoc d) {
        return ResumeDocumentUpgrader.upgrade(parseQuietly(d.getDocJson()));
    }

    private static JsonNode tailoredFromOf(JsonNode doc) {
        JsonNode tf = doc == null ? null : doc.path("meta").get("tailoredFrom");
        return tf == null || tf.isNull() ? null : tf;
    }

    private static String canonicalOrNull(JsonNode n) {
        return n == null ? "null" : ResumeDocumentCanonical.canonicalJson(n);
    }

    /** {@code "7"}, {@code 7} and {@code W/"7"} all mean version 7; anything else is {@code null}. */
    static Integer parseVersion(String ifMatch) {
        String s = ifMatch.trim();
        if (s.startsWith("W/")) s = s.substring(2);
        if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) s = s.substring(1, s.length() - 1);
        try {
            return Integer.valueOf(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private ResumeDocDTO toDto(ResumeDoc d, Resume resume) {
        ResumeDocDTO dto = new ResumeDocDTO();
        dto.setResumeId(d.getResumeId());
        dto.setLabel(resume.getLabel());
        dto.setKind(resume.getKind());
        dto.setDoc(storedDoc(d));
        dto.setSchemaVersion(ResumeDocument.SCHEMA_VERSION);
        dto.setTemplateId(d.getTemplateId());
        dto.setTheme(parseQuietly(d.getThemeJson()));
        dto.setDocVersion(d.getDocVersion());
        dto.setContentHash(d.getContentHash());
        dto.setProfileSyncedAt(d.getProfileSyncedAt());
        dto.setExportedAt(d.getExportedAt());
        dto.setExportedHash(d.getExportedHash());
        dto.setUpdatedAt(d.getUpdatedAt());
        dto.setRenderHash(renderHash(d));
        dto.setPdf(pdfOf(d));
        return dto;
    }

    /** The PDF state of a row, with the editor's poll cadence and window (both settings). */
    private ResumePdfDTO pdfOf(ResumeDoc d) {
        ResumePdfDTO pdf = ResumePdfState.toDto(d.getPdfStatus(), d.getExportedHash(), d.getExportedAt(), renderHash(d), d.getPdfAttempts(), d.getPdfError());
        pdf.setPollMs(settings.getInt(ResumeBuilderSettingKeys.PDF_STATUS_POLL_MS));
        pdf.setPollWindowMs(settings.getInt(ResumeBuilderSettingKeys.PDF_STATUS_WINDOW_MS));
        return pdf;
    }

    private ResumeDoc ownedDoc(Long resumeId) {
        return resumeDocRepository
            .findByResumeIdAndUserId(resumeId, currentUser().getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume document not found"));
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository.findOneByLogin(login).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found")
        );
    }

    private static JsonNode parseQuietly(String json) {
        try {
            return ResumeDocument.parse(json);
        } catch (RuntimeException e) {
            return JsonNodeFactory.instance.objectNode();
        }
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v.trim();
        }
        return "";
    }
}
