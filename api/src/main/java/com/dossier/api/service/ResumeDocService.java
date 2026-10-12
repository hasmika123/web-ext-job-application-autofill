package com.dossier.api.service;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.ResumeDocVersion;
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
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.resume.ResumeDocument;
import com.dossier.api.service.resume.ResumeDocumentIds;
import com.dossier.api.service.resume.ResumeDocumentCanonical;
import com.dossier.api.service.resume.ResumeMetaMirror;
import com.dossier.api.service.resume.ResumeDocumentJson;
import com.dossier.api.service.resume.ResumeDocumentProjector;
import com.dossier.api.service.resume.ResumeDocumentSeeder;
import com.dossier.api.service.resume.ResumeDocumentText;
import com.dossier.api.service.resume.ResumeDocumentUpgrader;
import com.dossier.api.service.resume.ResumeDocumentValidator;
import com.dossier.api.service.resume.ResumePdfState;
import com.dossier.api.service.resume.ResumeRenderHash;
import com.dossier.api.service.resume.ResumeThemeValidator;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageObjectNotFoundException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
 * together with its {@code resume.parsed_json} projection and {@code resume.updated_at}/{@code updated_by_login}
 * in one transaction, so the extension's mirror never lags the document. Since R3.9 the resume's
 * {@code label} (name) and {@code target} are the truth and the document's {@code meta.title}/{@code meta.target}
 * are mirrors the server writes ({@link ResumeMetaMirror}); renaming goes through {@code PATCH .../meta}.
 */
@Service
@Transactional
public class ResumeDocService {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeDocService.class);

    /**
     * Template ids that can ever exist. The registry itself lives in {@code packages/ui}; this list must
     * gain an id when a template ships there, and it is what {@code resume.templates.*} settings are
     * validated against. Which of them a user may pick is the {@code resume.templates.enabled} setting
     * (DESIGN 6.3), read through {@link #enabledTemplateIds()}.
     */
    public static final Set<String> KNOWN_TEMPLATE_IDS = Set.of("modern", "classic", "compact");

    public static final String DEFAULT_TEMPLATE_ID = "modern";
    /** Photo keys are {@code resume-photos/<userId>/...} (DESIGN 5.3); a save may only echo a key under its owner's prefix. */
    private static final String PHOTO_KEY_PREFIX = "resume-photos/";
    private static final String DEFAULT_TITLE = "My resume";
    /** The theme is a small style object (colors, font, spacing); anything bigger is a mistake. */
    private static final int MAX_THEME_BYTES = 8 * 1024;
    /** The persisted score record (DESIGN 9.2 / 11.5): {rulesetVersion, score, groups[<= 6]}, at most 4 KB. */
    private static final int MAX_SCORE_BYTES = 4 * 1024;
    private static final int MAX_SCORE_GROUPS = 6;
    private static final java.util.regex.Pattern HASH_PATTERN = java.util.regex.Pattern.compile("[0-9a-f]{64}");

    private final ResumeDocRepository resumeDocRepository;
    private final ProfileItemRepository profileItemRepository;
    private final BioRepository bioRepository;
    private final UserRepository userRepository;
    private final ProfileService profileService;
    private final ResumeRepository resumeRepository;
    private final ResumeBuilderSettings settings;
    private final ResumeDocVersionService versionService;
    private final FileStorage storage;

    public ResumeDocService(
        ResumeDocRepository resumeDocRepository,
        ProfileItemRepository profileItemRepository,
        BioRepository bioRepository,
        UserRepository userRepository,
        ProfileService profileService,
        ResumeRepository resumeRepository,
        ResumeBuilderSettings settings,
        ResumeDocVersionService versionService,
        FileStorage storage
    ) {
        this.storage = storage;
        this.settings = settings;
        this.versionService = versionService;
        this.resumeDocRepository = resumeDocRepository;
        this.profileItemRepository = profileItemRepository;
        this.bioRepository = bioRepository;
        this.userRepository = userRepository;
        this.profileService = profileService;
        this.resumeRepository = resumeRepository;
    }

    // ---- create -------------------------------------------------------------

    /** The ways a new built resume can start (DESIGN 8.8 / 9.10). {@code SCRATCH} is stored as {@code PROFILE} (a header from the bio, nothing else). */
    public enum Source {
        PROFILE,
        SCRATCH,
        UPLOAD,
        COPY;

        static Source parse(String s) {
            if (s != null) {
                for (Source v : values()) if (v.name().equalsIgnoreCase(s.trim())) return v;
            }
            return null;
        }
    }

    /** {@code source.kind} values as the API stores them in {@code resume_doc.source_kind}. */
    static final String SOURCE_PROFILE = "PROFILE";
    static final String SOURCE_UPLOAD = "UPLOAD";
    static final String SOURCE_COPY = "COPY";
    static final String SOURCE_IMPORT = "IMPORT";
    /** Where a created-from-upload resume's untouched original file lives (never the PDF slot, which the PDF job replaces). */
    static final String ORIGINAL_KEY_PREFIX = "resume-originals/";
    private static final int MAX_FILE_NAME = 200;

    /**
     * Create a BUILT resume from the user's profile (the R0.3 behaviour). Kept for callers that pass no source.
     */
    public BuiltResumeDTO createBuilt(String templateId, String target, String label) {
        return createBuilt(templateId, target, label, null);
    }

    /**
     * Create a BUILT resume and its first document from {@code source} (DESIGN 9.10), a string or
     * {@code {kind, ...}}: {@code profile} (default; profile items, else the bio header), {@code scratch} (the
     * bio header only), {@code upload} ({@code structured, bio?, fileName?, keep?}: a parsed resume file) or
     * {@code copy} ({@code fromResumeId}: an independent deep copy with new ids). The plan cap applies first
     * ({@code 402 RESUME_LIMIT}, before anything is parsed, scanned or copied); a copy source that is not the
     * caller's is a 404; a parsed upload that carries a never-collected value is refused with
     * {@code 422 SENSITIVE_CONTENT} naming the item.
     */
    public BuiltResumeDTO createBuilt(String templateId, String target, String label, JsonNode source) {
        profileService.assertCanCreateResume();
        Source kind = sourceKindOf(source);
        User user = currentUser();
        Instant now = Instant.now();

        Resume from = null;
        ResumeDoc fromDoc = null;
        if (kind == Source.COPY) {
            from = ownedResume(user, longOrNull(source, "fromResumeId"), "$.source.fromResumeId");
            fromDoc = resumeDocRepository.findByResumeIdAndUserId(from.getId(), user.getId()).orElse(null);
        }

        String template = firstNonBlank(templateId);
        if (template.isEmpty()) {
            template = fromDoc != null && enabledTemplateIds().contains(fromDoc.getTemplateId()) ? fromDoc.getTemplateId() : defaultTemplateId();
        }
        requireEnabledTemplate(template);

        String cleanTarget = ProfileService.clipTarget(target);
        String title = switch (kind) {
            case UPLOAD -> firstNonBlank(label, stripExtension(textOrNull(source, "fileName")), cleanTarget, DEFAULT_TITLE);
            case COPY -> firstNonBlank(label, (from.getLabel() == null || from.getLabel().isBlank() ? "Resume" : from.getLabel()) + " (copy)");
            default -> firstNonBlank(label, cleanTarget, DEFAULT_TITLE);
        };
        if (title.length() > 200) title = title.substring(0, 200);

        JsonNode bio = bioRepository.findByUserIsCurrentUser().stream().findFirst().map(Bio::getPayload).map(ResumeDocService::parseQuietly).orElse(null);
        ResumeDocumentValidator.Limits limits = limits();
        JsonNode doc;
        String sourceKind = SOURCE_PROFILE;
        switch (kind) {
            case UPLOAD -> {
                doc = seedFromUpload(title, cleanTarget, source, bio, now);
                sourceKind = SOURCE_UPLOAD;
            }
            case COPY -> {
                doc = copyOf(from, fromDoc, title, bio, now);
                sourceKind = SOURCE_COPY;
            }
            case SCRATCH -> doc = ResumeDocumentSeeder.seed(title, cleanTarget, bio, List.of(), now);
            default -> {
                var items = profileItemRepository.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(user.getId());
                doc = ResumeDocumentSeeder.seed(title, cleanTarget, bio, items, now);
                // The seeder only emits valid documents; if a future change breaks that, a bare header beats a 500.
                if (ResumeDocumentValidator.validate(doc, limits).isPresent()) {
                    LOG.warn("Seeded document for user {} failed validation ({}); falling back to the bio header", user.getId(), ResumeDocumentValidator.validate(doc, limits).get());
                    doc = ResumeDocumentSeeder.seed(title, cleanTarget, bio, List.of(), now);
                }
            }
        }
        // A copy's photo is attached after the resume exists (its file gets a key of its own), so it is validated then.
        JsonNode copiedPhoto = kind == Source.COPY ? detachPhoto(doc) : null;
        if (kind == Source.UPLOAD || kind == Source.COPY) {
            ResumeDocumentValidator.validate(doc, limits).ifPresent(v -> {
                throw v.tooLarge() ? ResumeDocException.tooLarge(v.message()) : ResumeDocException.invalid(v.path(), v.message());
            });
        }

        ResumeDTO request = new ResumeDTO();
        request.setLabel(title);
        request.setTarget(cleanTarget);
        request.setStatus(ResumeStatus.CONFIRMED); // authored by the user: nothing to review
        ResumeDTO created = profileService.createResume(request, ResumeKind.BUILT);
        Resume resume = resumeRepository.findById(created.getId()).orElseThrow();

        String photoCopyKey = null;
        if (copiedPhoto != null) {
            photoCopyKey = copyPhoto(user, resume, copiedPhoto);
            if (photoCopyKey != null) {
                ObjectNode photo = ((ObjectNode) doc.get("basics")).putObject("photo");
                photo.put("key", photoCopyKey);
                photo.put("updatedAt", now.toString());
            }
        }

        ResumeDoc d = new ResumeDoc();
        d.setResume(resume);
        d.setUser(user);
        d.setTemplateId(template);
        d.setThemeJson(kind == Source.COPY && fromDoc != null && fromDoc.getThemeJson() != null ? fromDoc.getThemeJson() : "{}");
        d.setSourceKind(sourceKind);
        if (kind == Source.COPY) d.setParentResumeId(from.getId());
        d.setProfileSyncedAt(kind == Source.COPY && fromDoc != null && fromDoc.getProfileSyncedAt() != null ? fromDoc.getProfileSyncedAt() : now);
        try {
            if (photoCopyKey != null) {
                ResumeDocumentValidator.validate(doc, ResumeDocumentValidator.Options.DEFAULTS.withPhotoKeyPrefix(PHOTO_KEY_PREFIX + user.getId() + "/").withLimits(limits)).ifPresent(v -> {
                    throw ResumeDocException.invalid(v.path(), v.message());
                });
            }
            applyContent(d, resume, doc, now);
            markPdfPending(d, false);
            resumeDocRepository.saveAndFlush(d);
        } catch (RuntimeException e) {
            if (photoCopyKey != null) deleteQuietly(photoCopyKey);
            throw e;
        }
        // The first snapshot: what the resume looked like when it was made (a base for Restore and Compare).
        versionService.record(d, ResumeDocVersionService.IMPORT, null, user.getLogin());

        created.setKind(ResumeKind.BUILT);
        created.setTemplateId(template);
        created.setParsedJson(resume.getParsedJson());
        return new BuiltResumeDTO(created, toDto(d, resume));
    }

    /** {@code POST .../doc/duplicate}: an alias of {@code source: copy} for the list's duplicate button. */
    public BuiltResumeDTO duplicate(Long resumeId, String label) {
        ObjectNode source = JsonNodeFactory.instance.objectNode();
        source.put("kind", "copy");
        source.put("fromResumeId", resumeId);
        return createBuilt(null, null, label, source);
    }

    /**
     * "Open in builder" on an uploaded resume ({@code POST .../doc/import}): the file's parsed structure becomes
     * a document and the resume becomes BUILT in place (same id, name, target, flags and applications). The
     * uploaded file is kept as {@code meta.originalFileKey}; the resume's own file slot is then free for the
     * generated PDF. 409 {@code ALREADY_BUILT} when it already is.
     */
    public BuiltResumeDTO importUploaded(Long resumeId) {
        User user = currentUser();
        Resume resume = ownedResume(user, resumeId, "$.id");
        if (resume.getKind() == ResumeKind.BUILT || resumeDocRepository.existsById(resumeId)) {
            throw new ResumeDocException(409, "ALREADY_BUILT", "This resume is already in the builder", java.util.Map.of());
        }
        Instant now = Instant.now();
        JsonNode structured = parseQuietly(resume.getParsedJson());
        if (!structured.isObject()) structured = JsonNodeFactory.instance.objectNode();
        // The structure was stored by an earlier, already-guarded write; scrub a straggler rather than refuse the import.
        structured = structured.deepCopy();
        SensitiveContent.redact(structured);
        JsonNode bio = bioRepository.findByUserIsCurrentUser().stream().findFirst().map(Bio::getPayload).map(ResumeDocService::parseQuietly).orElse(null);
        String title = firstNonBlank(resume.getLabel(), DEFAULT_TITLE);
        ObjectNode doc = ResumeDocumentSeeder.fromStructured(title, resume.getTarget(), structured, null, bio, null, now);
        String originalKey = copyOriginalAside(user, resume);
        if (originalKey != null) ((ObjectNode) doc.get("meta")).put("originalFileKey", originalKey);
        ResumeDocumentValidator.validate(doc, limits()).ifPresent(v -> {
            throw v.tooLarge() ? ResumeDocException.tooLarge(v.message()) : ResumeDocException.invalid(v.path(), v.message());
        });

        resume.setKind(ResumeKind.BUILT);
        ResumeDoc d = new ResumeDoc();
        d.setResume(resume);
        d.setUser(user);
        d.setTemplateId(defaultTemplateId());
        d.setThemeJson("{}");
        d.setSourceKind(SOURCE_IMPORT);
        d.setProfileSyncedAt(now);
        applyContent(d, resume, doc, now);
        markPdfPending(d, false);
        resumeDocRepository.saveAndFlush(d);
        versionService.record(d, ResumeDocVersionService.IMPORT, null, user.getLogin());

        ResumeDTO dto = profileService.listResumes().stream().filter(r -> resumeId.equals(r.getId())).findFirst().orElseGet(ResumeDTO::new);
        dto.setKind(ResumeKind.BUILT);
        dto.setTemplateId(d.getTemplateId());
        return new BuiltResumeDTO(dto, toDto(d, resume));
    }

    // ---- the uploaded original ------------------------------------------------

    /**
     * True when a file posted to this resume is the user's uploaded original rather than a generated PDF: a BUILT
     * resume that started from an upload (or was imported) and has no original yet. {@code ResumeFileResource}
     * then stores it under {@code resume-originals/...} and calls {@link #noteOriginalFile}.
     */
    @Transactional(readOnly = true)
    public boolean wantsOriginal(Resume resume) {
        if (resume.getKind() != ResumeKind.BUILT) return false;
        return resumeDocRepository
            .findById(resume.getId())
            .filter(d -> SOURCE_UPLOAD.equals(d.getSourceKind()) || SOURCE_IMPORT.equals(d.getSourceKind()))
            .map(d -> originalKeyOf(storedDoc(d)) == null)
            .orElse(false);
    }

    /**
     * Record {@code key} as the document's {@code meta.originalFileKey}. A document write like any other
     * (it ticks the version and changes the content hash), which is why the web waits for the upload to finish
     * before it opens the editor.
     */
    public void noteOriginalFile(Long resumeId, String key) {
        ResumeDoc d = ownedDoc(resumeId);
        ObjectNode doc = (ObjectNode) storedDoc(d).deepCopy();
        JsonNode meta = doc.get("meta");
        if (meta == null || !meta.isObject()) return;
        ((ObjectNode) meta).put("originalFileKey", key);
        Instant now = Instant.now();
        applyContent(d, d.getResume(), doc, now);
        markPdfPending(d, false);
        resumeDocRepository.saveAndFlush(d);
    }

    /** The uploaded original: its bytes and type. 404 when there is none (owner only). */
    @Transactional(readOnly = true)
    public StoredOriginal original(Long resumeId) {
        User user = currentUser();
        ResumeDoc d = ownedDoc(resumeId);
        String key = originalKeyOf(storedDoc(d));
        // Server-written, but never trust a key outside the caller's own prefix.
        if (key == null || !key.startsWith(ORIGINAL_KEY_PREFIX + user.getId() + "/")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No original file");
        }
        try {
            FileStorage.StoredFile f = storage.load(key);
            return new StoredOriginal(f.content(), f.contentType(), downloadName(d.getResume(), key));
        } catch (StorageObjectNotFoundException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "FILE_MISSING");
        }
    }

    /** Whether the document keeps the file it was made from (so the metadata can offer "Download original"). */
    public boolean hasOriginal(ResumeDoc d) {
        return originalKeyOf(storedDoc(d)) != null;
    }

    /** The original file for download. */
    public record StoredOriginal(byte[] content, String contentType, String fileName) {}

    /** Overwrites {@code doc.meta.originalFileKey} with the stored document's, so a client save can neither set nor drop it. */
    private static void keepOriginalFileKey(JsonNode doc, JsonNode stored) {
        if (doc == null || !doc.path("meta").isObject()) return;
        ObjectNode meta = (ObjectNode) doc.get("meta");
        String key = originalKeyOf(stored);
        if (key == null) {
            if (meta.has("originalFileKey")) meta.putNull("originalFileKey");
        } else {
            meta.put("originalFileKey", key);
        }
    }

    private static String originalKeyOf(JsonNode doc) {
        JsonNode k = doc == null ? null : doc.path("meta").get("originalFileKey");
        return k != null && k.isTextual() && !k.textValue().isBlank() ? k.textValue() : null;
    }

    private static String downloadName(Resume resume, String key) {
        String ext = key.contains(".") ? key.substring(key.lastIndexOf('.')) : "";
        String base = resume.getLabel() == null ? "resume" : resume.getLabel().replaceAll("[^A-Za-z0-9._-]+", "_");
        return (base.isBlank() ? "resume" : base) + ext.replaceAll("[^A-Za-z0-9.]", "");
    }

    /** Copy the uploaded file in a resume's own slot to the originals prefix so the PDF job cannot delete it; null when none. */
    private String copyOriginalAside(User user, Resume resume) {
        String key = resume.getr2ObjectKey();
        if (key == null || key.isBlank()) return null;
        try {
            FileStorage.StoredFile f = storage.load(key);
            String ext = key.contains(".") ? key.substring(key.lastIndexOf('.')) : ".pdf";
            String newKey = storage.objectKeyFor("resume-originals", user.getId(), resume.getId(), "original" + ext.replaceAll("[^A-Za-z0-9.]", ""));
            storage.store(newKey, f.content(), f.contentType());
            return newKey;
        } catch (RuntimeException e) {
            LOG.warn("Could not keep the original file of resume {} aside: {}", resume.getId(), e.getMessage());
            return null;
        }
    }

    // ---- create helpers -------------------------------------------------------------------------

    private static Source sourceKindOf(JsonNode source) {
        if (source == null || source.isNull()) return Source.PROFILE;
        String kind = source.isTextual() ? source.textValue() : source.isObject() ? textOrNull(source, "kind") : null;
        if (kind == null || kind.isBlank()) {
            if (source.isObject()) return Source.PROFILE;
            throw ResumeDocException.invalid("$.source", "must be a source kind or an object {kind, ...}");
        }
        Source parsed = Source.parse(kind);
        if (parsed == null) throw ResumeDocException.invalid("$.source.kind", "unknown source '" + kind + "' (profile, scratch, upload or copy)");
        return parsed;
    }

    private ObjectNode seedFromUpload(String title, String target, JsonNode source, JsonNode userBio, Instant now) {
        if (!source.isObject()) throw ResumeDocException.invalid("$.source", "an upload needs {kind, structured, fileName}");
        JsonNode structured = source.get("structured");
        if (structured == null || !structured.isObject()) throw ResumeDocException.invalid("$.source.structured", "is required for an upload");
        JsonNode fileBio = source.get("bio");
        if (fileBio != null && !fileBio.isNull() && !fileBio.isObject()) throw ResumeDocException.invalid("$.source.bio", "must be an object");
        ResumeDocumentSeeder.KeepMask keep = keepMaskOf(source.get("keep"));
        guardSensitive(structured, fileBio, keep);
        return ResumeDocumentSeeder.fromStructured(title, target, structured, fileBio, userBio, keep, now);
    }

    /**
     * Refuses never-collected values in what the user KEPT: each kept entry is scanned on its own, so the 422
     * names the entry by its index in the uploaded arrays ({@code structured.experience[2]}) and unticking it fixes it.
     */
    private static void guardSensitive(JsonNode structured, JsonNode fileBio, ResumeDocumentSeeder.KeepMask keep) {
        for (String section : new String[] { "experience", "education", "projects" }) {
            java.util.Set<Integer> kept = switch (section) {
                case "experience" -> keep.experience();
                case "education" -> keep.education();
                default -> keep.projects();
            };
            JsonNode arr = structured.get(section);
            if (arr == null || !arr.isArray()) continue;
            for (int i = 0; i < arr.size(); i++) {
                if (ResumeDocumentSeeder.KeepMask.has(kept, i)) SensitiveContent.check("structured." + section + "[" + i + "]", arr.get(i));
            }
        }
        if (keep.keepsSkills()) SensitiveContent.check("structured.skills", structured.get("skills"));
        if (keep.keepsSummary()) SensitiveContent.check("structured.summary", "summary", structured.path("summary").asText(""));
        SensitiveContent.check("structured.languages", structured.get("languages"));
        if (fileBio != null) SensitiveContent.check("bio", fileBio);
    }

    private static ResumeDocumentSeeder.KeepMask keepMaskOf(JsonNode keep) {
        if (keep == null || !keep.isObject()) return ResumeDocumentSeeder.KeepMask.ALL;
        return new ResumeDocumentSeeder.KeepMask(
            indexSet(keep.get("experience")),
            indexSet(keep.get("education")),
            indexSet(keep.get("projects")),
            keep.hasNonNull("skills") ? keep.get("skills").asBoolean(true) : null,
            keep.hasNonNull("summary") ? keep.get("summary").asBoolean(true) : null
        );
    }

    private static java.util.Set<Integer> indexSet(JsonNode n) {
        if (n == null || !n.isArray()) return null;
        java.util.Set<Integer> out = new java.util.HashSet<>();
        for (JsonNode i : n) if (i.isInt() && i.intValue() >= 0) out.add(i.intValue());
        return out;
    }

    /**
     * The copy's document: the source's with every id regenerated, no job target, no tailoring lineage, no
     * original-file link. A source that is only an uploaded file (no document) is built from its parsed structure.
     */
    private JsonNode copyOf(Resume from, ResumeDoc fromDoc, String title, JsonNode userBio, Instant now) {
        if (fromDoc == null) {
            JsonNode structured = parseQuietly(from.getParsedJson());
            structured = structured.isObject() ? structured.deepCopy() : JsonNodeFactory.instance.objectNode();
            SensitiveContent.redact(structured);
            return ResumeDocumentSeeder.fromStructured(title, null, structured, null, userBio, null, now);
        }
        JsonNode copy = ResumeDocumentIds.regenerate(storedDoc(fromDoc));
        ObjectNode meta = copy.has("meta") && copy.get("meta").isObject() ? (ObjectNode) copy.get("meta") : ((ObjectNode) copy).putObject("meta");
        meta.remove("tailoredFrom");
        meta.putNull("originalFileKey");
        ResumeMetaMirror.apply(copy, title, null);
        return copy;
    }

    /** Takes {@code basics.photo} out of a document and returns it (null when none). */
    private static JsonNode detachPhoto(JsonNode doc) {
        JsonNode basics = doc.get("basics");
        if (basics == null || !basics.isObject()) return null;
        JsonNode photo = basics.get("photo");
        ((ObjectNode) basics).remove("photo");
        return photo != null && photo.hasNonNull("key") ? photo : null;
    }

    /** A photo is content, so a copy gets a file of its own (same bytes, new key); null if the bytes cannot be copied. */
    private String copyPhoto(User user, Resume resume, JsonNode photo) {
        String key = photo.get("key").asText("");
        if (!key.startsWith(PHOTO_KEY_PREFIX + user.getId() + "/")) return null;
        try {
            FileStorage.StoredFile f = storage.load(key);
            String ext = key.contains(".") ? key.substring(key.lastIndexOf('.')).replaceAll("[^A-Za-z0-9.]", "") : ".jpg";
            String newKey = storage.objectKeyFor("resume-photos", user.getId(), resume.getId(), "photo" + ext);
            storage.store(newKey, f.content(), f.contentType());
            return newKey;
        } catch (RuntimeException e) {
            LOG.warn("Could not copy the photo of resume {} into its copy: {}", resume.getId(), e.getMessage());
            return null;
        }
    }

    private void deleteQuietly(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            LOG.warn("Could not delete {}: {}", key, e.getMessage());
        }
    }

    private Resume ownedResume(User user, Long resumeId, String path) {
        if (resumeId == null) throw ResumeDocException.invalid(path, "is required");
        return resumeRepository
            .findById(resumeId)
            .filter(r -> r.getUser() != null && user.getId().equals(r.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume not found"));
    }

    private static String textOrNull(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v != null && v.isTextual() ? v.textValue() : null;
    }

    private static Long longOrNull(JsonNode n, String field) {
        JsonNode v = n == null ? null : n.get(field);
        return v != null && v.canConvertToLong() ? v.longValue() : null;
    }

    /** {@code "My CV.final.pdf"} -> {@code "My CV.final"}; null/blank -> null. */
    private static String stripExtension(String fileName) {
        if (fileName == null || fileName.isBlank()) return null;
        String name = fileName.strip();
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) name = name.substring(slash + 1);
        int dot = name.lastIndexOf('.');
        if (dot > 0) name = name.substring(0, dot);
        name = name.strip();
        return name.isEmpty() ? null : (name.length() > MAX_FILE_NAME ? name.substring(0, MAX_FILE_NAME) : name);
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

    /**
     * The document by resume id with no owner check, for {@code ResumeAccessService} only (R3.11): it has already
     * decided that the viewer (a grantee, an org pairing or a link holder) may read this resume, and it scrubs the
     * result. 404 when there is no such document.
     */
    @Transactional(readOnly = true)
    public ResumeDocDTO getForViewer(Long resumeId) {
        return getForWorker(resumeId);
    }

    @Transactional(readOnly = true)
    public String text(Long resumeId) {
        return ResumeDocumentText.render(parseQuietly(ownedDoc(resumeId).getDocJson()));
    }

    // ---- write --------------------------------------------------------------

    /**
     * Save the whole document ({@code body = {doc, theme?, score?}}) if {@code ifMatch} names the version the
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
        // The name and target are the resume's (DESIGN 8.6): the document only mirrors them, so whatever the client
        // sent in meta.title / meta.target is overwritten, not rejected.
        ResumeMetaMirror.apply(doc, d.getResume().getLabel(), d.getResume().getTarget());
        // meta.originalFileKey is server-written too (it names a stored file the owner may download): a save never sets it.
        keepOriginalFileKey(doc, storedDoc(d));
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
        String previousHash = d.getContentHash();
        applyScore(d, body.get("score"), now);

        applyContent(d, d.getResume(), doc, now);
        markPdfPending(d, false);
        resumeDocRepository.saveAndFlush(d);
        versionService.recordAutosave(d, previousHash, currentLogin());
        return toDto(d, d.getResume());
    }

    /**
     * Switch the template. Needs no If-Match (choosing a template never loses typed text) but bumps
     * the version, so the response's ETag is what the editor must send next. Touches neither
     * {@code parsed_json} nor {@code label}, hence leaves {@link ProfileVersion} where it was.
     */
    public ResumeDocDTO setTemplate(Long resumeId, String templateId) {
        ResumeDoc d = ownedDoc(resumeId);
        requireEnabledTemplate(templateId);
        d.setTemplateId(templateId);
        d.setUpdatedAt(Instant.now());
        d.getResume().setUpdatedAt(d.getUpdatedAt());
        d.getResume().setUpdatedByLogin(currentLogin());
        markPdfPending(d, true); // a template switch is a checkpoint: no settle delay
        resumeDocRepository.saveAndFlush(d);
        versionService.record(d, ResumeDocVersionService.TEMPLATE_SWITCH, null, currentLogin());
        return toDto(d, d.getResume());
    }

    /**
     * Replace the presentation (Customize Template: accent, font, spacing, page length; DESIGN 4, R2.4).
     * {@code body = {theme}}. Like the template switch it needs no If-Match (it never reads or writes the
     * typed content), bumps {@code doc_version} (the response's ETag is what the editor sends next),
     * writes no version row and leaves {@link ProfileVersion} where it was: only {@code theme_json} changes.
     * The theme is validated and re-written by {@link ResumeThemeValidator} (bounded fields only, 422
     * {@code THEME_INVALID}).
     */
    public ResumeDocDTO setTheme(Long resumeId, JsonNode body) {
        ResumeDoc d = ownedDoc(resumeId);
        if (body == null || !body.isObject() || !body.hasNonNull("theme")) {
            throw ResumeDocException.themeInvalid("$.theme", "body must be an object {theme}");
        }
        d.setThemeJson(ResumeDocumentJson.write(ResumeThemeValidator.sanitize(body.get("theme")), 0));
        d.setUpdatedAt(Instant.now());
        d.getResume().setUpdatedAt(d.getUpdatedAt());
        d.getResume().setUpdatedByLogin(currentLogin());
        // A theme change alters the render (DESIGN 8.5): a settled save, so the usual settle delay applies.
        markPdfPending(d, false);
        resumeDocRepository.saveAndFlush(d);
        return toDto(d, d.getResume());
    }

    /**
     * Restore an earlier version (R3.10, DESIGN 9.2): the document, theme and (when it is still enabled) template of
     * version {@code versionNo} become the current ones. What the resume holds now is written as its own row first
     * (unless the newest row already is that content), so a restore never loses work; the restored state is then
     * recorded as a {@code RESTORE} row. The resume's name, target and {@code meta.tailoredFrom} stay what they are
     * now (the name is the resume's truth, DESIGN 8.6, and {@code tailoredFrom} is server-written). No If-Match: the
     * answer carries the new ETag, which the editor adopts. 404 when there is no such version.
     */
    public ResumeDocDTO restore(Long resumeId, int versionNo) {
        ResumeDoc d = ownedDoc(resumeId);
        ResumeDocVersion v = versionService
            .find(d.getResumeId(), d.getUser().getId(), versionNo)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Version not found"));
        String login = currentLogin();

        // Keep what is here now, unless the newest row already holds exactly it.
        boolean captured = versionService
            .latest(d.getResumeId(), d.getUser().getId())
            .map(latest -> latest.getContentHash().equals(d.getContentHash()) && latest.getTemplateId().equals(d.getTemplateId()) && latest.getThemeJson().equals(d.getThemeJson()))
            .orElse(false);
        if (!captured) versionService.record(d, ResumeDocVersionService.AUTOSAVE, null, login);

        JsonNode doc = ResumeDocumentUpgrader.upgrade(parseQuietly(v.getDocJson()));
        JsonNode keepTailoredFrom = tailoredFromOf(storedDoc(d));
        if (doc.path("meta").isObject()) {
            ObjectNode meta = (ObjectNode) doc.get("meta");
            if (keepTailoredFrom == null) meta.remove("tailoredFrom");
            else meta.set("tailoredFrom", keepTailoredFrom);
        }
        if (enabledTemplateIds().contains(v.getTemplateId())) d.setTemplateId(v.getTemplateId());
        d.setThemeJson(v.getThemeJson());
        applyContent(d, d.getResume(), doc, Instant.now());
        markPdfPending(d, true); // a restore is a checkpoint: no settle delay
        resumeDocRepository.saveAndFlush(d);
        versionService.record(d, ResumeDocVersionService.RESTORE, null, login);
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

    /**
     * A checkpoint (the editor's explicit Save): queue the PDF with no settle delay. Same effect as
     * {@code markPdfPending(d, true)} but as a bulk update, so {@code doc_version} does not tick and the
     * open editor's ETag stays valid. A row already RUNNING or already current is left alone.
     */
    public void requestPdfImmediately(ResumeDoc d) {
        resumeDocRepository.requestNow(d.getResumeId(), renderHash(d), Instant.now());
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

    /**
     * Stores the Resume Score the BFF computed with the shared TypeScript engine (DESIGN 11.5, DECISIONS #7):
     * Java never evaluates the rules, it only checks the record's shape and keeps it. Absent or null leaves the
     * stored score as it is; a score of an unknown {@code rulesetVersion} is ignored (not an error); more than
     * {@value #MAX_SCORE_BYTES} bytes or a malformed record is 422 DOC_INVALID at {@code $.score...}.
     */
    private void applyScore(ResumeDoc d, JsonNode score, Instant now) {
        if (score == null || score.isNull()) return;
        if (!score.isObject()) throw ResumeDocException.invalid("$.score", "must be an object");
        if (ResumeDocumentJson.write(score, 0).getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_SCORE_BYTES) {
            throw ResumeDocException.invalid("$.score", "must be at most " + MAX_SCORE_BYTES + " bytes");
        }
        JsonNode ruleset = score.get("rulesetVersion");
        if (ruleset == null || !ruleset.isTextual() || !ruleset.textValue().equals(settings.getString(ResumeBuilderSettingKeys.SCORE_RULESET_VERSION))) {
            return;
        }
        JsonNode value = score.get("score");
        if (value == null || !value.isIntegralNumber() || value.asInt() < 0 || value.asInt() > 100) {
            throw ResumeDocException.invalid("$.score.score", "must be an integer from 0 to 100");
        }
        JsonNode groups = score.get("groups");
        if (groups == null || !groups.isArray() || groups.size() > MAX_SCORE_GROUPS) {
            throw ResumeDocException.invalid("$.score.groups", "must be an array of at most " + MAX_SCORE_GROUPS + " groups");
        }
        for (int i = 0; i < groups.size(); i++) {
            JsonNode g = groups.get(i);
            JsonNode fraction = g.get("fraction");
            if (
                !g.isObject() ||
                !g.path("id").isTextual() ||
                !g.path("pass").isBoolean() ||
                fraction == null ||
                !fraction.isNumber() ||
                fraction.asDouble() < 0 ||
                fraction.asDouble() > 1
            ) {
                throw ResumeDocException.invalid("$.score.groups[" + i + "]", "must be {id, pass, fraction 0-1}");
            }
        }
        // Only the known fields are kept; the server stamps when it was stored.
        com.fasterxml.jackson.databind.node.ObjectNode stored = JsonNodeFactory.instance.objectNode();
        stored.set("rulesetVersion", ruleset);
        stored.set("score", value);
        stored.set("groups", groups);
        stored.put("computedAt", now.toString());
        d.setScoreJson(ResumeDocumentJson.write(stored, 0));
        d.setScore(value.asInt());
    }

    /** Writes a validated document and everything derived from it onto the entity and its resume. */
    private void applyContent(ResumeDoc d, Resume resume, JsonNode doc, Instant now) {
        // The resume owns its name and target; the document repeats them (a no-op after put()'s own mirror).
        ResumeMetaMirror.apply(doc, resume.getLabel(), resume.getTarget());
        d.setDocJson(ResumeDocumentJson.write(doc, 0));
        d.setSchemaVersion(ResumeDocument.SCHEMA_VERSION);
        JsonNode photoKey = doc.path("basics").path("photo").get("key");
        d.setPhotoKey(photoKey != null && photoKey.isTextual() ? photoKey.textValue() : null);
        d.setContentHash(ResumeDocumentCanonical.contentHash(doc));
        d.setUpdatedAt(now);
        resume.setParsedJson(ResumeDocumentProjector.toStructuredJson(doc));
        resume.setUpdatedAt(now);
        resume.setUpdatedByLogin(currentLogin());
    }

    /** The template ids the picker offers, from {@code resume.templates.enabled} (default {@code ["modern"]}), in setting order. */
    public List<String> enabledTemplateIds() {
        String[] ids = settings.getJson(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, String[].class);
        return ids == null || ids.length == 0 ? List.of(DEFAULT_TEMPLATE_ID) : List.of(ids);
    }

    /** The template a new resume starts with: {@code resume.templates.default} when it is enabled, else the first enabled one. */
    private String defaultTemplateId() {
        List<String> enabled = enabledTemplateIds();
        String configured = settings.getString(ResumeBuilderSettingKeys.TEMPLATES_DEFAULT);
        return enabled.contains(configured) ? configured : enabled.get(0);
    }

    /** 422 {@code $.templateId} unless the id is a known template that the {@code resume.templates.enabled} setting offers. */
    private void requireEnabledTemplate(String templateId) {
        String shown = templateId == null ? "" : templateId;
        if (templateId == null || !KNOWN_TEMPLATE_IDS.contains(templateId)) {
            throw ResumeDocException.invalid("$.templateId", "unknown template '" + shown + "'");
        }
        if (!enabledTemplateIds().contains(templateId)) {
            throw ResumeDocException.invalid("$.templateId", "template '" + shown + "' is not enabled");
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
        if (d.getScore() != null) {
            dto.setScore(new ResumeDocDTO.ScoreSummary(d.getScore(), parseQuietly(d.getScoreJson()).path("rulesetVersion").asText(null)));
        }
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

    private static String currentLogin() {
        return SecurityUtils.getCurrentUserLogin().orElse(null);
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
