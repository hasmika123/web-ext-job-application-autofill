package com.dossier.api.service;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.enumeration.Provenance;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.ProfileItemRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.ProfileItemDTO;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.privacy.SensitiveContentException;
import com.dossier.api.service.resume.ProfileCompleteness;
import com.dossier.api.service.resume.ProfileItemMerge;
import com.dossier.api.service.resume.ProfileMeta;
import com.dossier.api.service.resume.ProfileSeed;
import com.dossier.api.service.resume.ResumeDocument;
import com.dossier.api.service.resume.ResumeDocumentJson;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The Common Profile's career lists (Resume Builder R1.1, DESIGN v1 2.2 / 2.4 / 6.1): CRUD, reorder,
 * import, the one-time seed from the default resume, and the completeness meter.
 *
 * <p>Every query is scoped to the authenticated user ({@code findByIdAndUserId}): another user's item
 * id is a 404 for every verb. Every string a client submits passes
 * {@link SensitiveContent} first - an SSN, bank number, tax id, passport / visa number or date of
 * birth is refused with 422 {@code SENSITIVE_CONTENT {path, class}} and nothing is written. The seed
 * path redacts instead, because that text was stored before this check existed.
 *
 * <p>Writes keep {@code bio.meta_json.completeness} fresh without touching {@code bio.updatedAt} or
 * {@code payload}, so the extension's profile version does not move for item edits.
 */
@Service
@Transactional
public class ProfileItemService {

    private static final Logger LOG = LoggerFactory.getLogger(ProfileItemService.class);

    /** One item's serialised data. Resume bullets are 600 characters and an item has a dozen at most. */
    public static final int MAX_ITEM_BYTES = 16 * 1024;
    /** Live (not deleted) items per user, all sections together. */
    public static final int MAX_LIVE_ITEMS = 500;
    /** Items in one {@code /import} call. */
    public static final int MAX_IMPORT_ITEMS = 200;
    /** Longest bio value an import writes (the summary is the one long one). */
    static final int MAX_BIO_VALUE = 500;
    static final int MAX_BIO_SUMMARY = 2000;

    /**
     * The flat bio keys an import may write (the identity / contact / link fields a resume header
     * yields, plus headline and summary). Anything else in the request - EEO answers, preferences,
     * onboarding flags - is ignored: those are only ever set from the profile editor.
     */
    public static final Set<String> BIO_IMPORT_KEYS = Set.of(
        "firstName",
        "lastName",
        "preferredName",
        "email",
        "phone",
        "addressLine1",
        "addressLine2",
        "city",
        "state",
        "postalCode",
        "country",
        "linkedin",
        "github",
        "website",
        "headline",
        "summary"
    );

    private static final Set<String> BIO_PROVENANCE = Set.of("parsed", "user", "learned");

    // ---- request / response shapes (bound directly by ProfileItemResource) -----------------------

    /** {@code POST /api/profile/items}. {@code dataJson} is the item object ({@code data} is accepted as an alias). */
    public record NewItem(
        ProfileSection section,
        @JsonAlias("data") JsonNode dataJson,
        Provenance provenance,
        Integer position
    ) {}

    /** {@code PUT /api/profile/items/{id}}: only the fields sent are changed. */
    public record ItemPatch(
        @JsonAlias("data") JsonNode dataJson,
        Boolean hidden,
        Integer position,
        Provenance provenance
    ) {}

    /** {@code POST /api/profile/items/reorder}. */
    public record Reorder(ProfileSection section, List<Long> ids) {}

    /** One item of an import. {@code provenance} defaults to PARSED. */
    public record ImportItem(
        ProfileSection section,
        @JsonAlias("data") JsonNode dataJson,
        Provenance provenance,
        Long sourceResumeId
    ) {}

    /** {@code POST /api/profile/items/import}: items, optionally flat bio values and their provenance. */
    public record ImportRequest(List<ImportItem> items, JsonNode bio, String provenanceBio) {}

    /** {@code created} new items, {@code merged} items that matched an existing one, whether the bio changed. */
    public record ImportResult(int created, int merged, boolean updatedBio) {}

    /** {@code GET /api/profile/completeness}. */
    public record CompletenessDTO(int score, Map<String, ProfileCompleteness.Part> parts, ProfileCompleteness.NextAction nextAction) {}

    private record Incoming(ProfileSection section, ObjectNode data, Provenance provenance, Long sourceResumeId) {}

    private record Merged(int created, int merged) {}

    private final ProfileItemRepository itemRepository;
    private final BioRepository bioRepository;
    private final ResumeRepository resumeRepository;
    private final UserRepository userRepository;
    private final EntityManager em;
    private final ObjectMapper om = new ObjectMapper();

    public ProfileItemService(
        ProfileItemRepository itemRepository,
        BioRepository bioRepository,
        ResumeRepository resumeRepository,
        UserRepository userRepository,
        EntityManager em
    ) {
        this.itemRepository = itemRepository;
        this.bioRepository = bioRepository;
        this.resumeRepository = resumeRepository;
        this.userRepository = userRepository;
        this.em = em;
    }

    // ---- read -------------------------------------------------------------------------------------

    /** The user's live items (hidden included), in (section, position) order; one section when given. */
    public List<ProfileItemDTO> list(ProfileSection section) {
        User user = currentUser();
        ensureSeeded(user);
        List<ProfileItem> rows = section == null
            ? itemRepository.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(user.getId())
            : itemRepository.findByUserIdAndSectionAndDeletedAtIsNullOrderByPosition(user.getId(), section);
        return rows.stream().map(this::toDto).toList();
    }

    /** The meter, recomputed from the current bio and items, and its cache in {@code bio.meta_json} refreshed. */
    public CompletenessDTO completeness() {
        User user = currentUser();
        ensureSeeded(user);
        Bio bio = bioOf(user.getId());
        ProfileCompleteness.Result r = compute(bio, user.getId());
        if (bio != null) {
            refreshCompleteness(bio, user.getId());
            bioRepository.save(bio);
        }
        return new CompletenessDTO(r.score(), r.parts(), r.nextAction());
    }

    // ---- create / update / delete / reorder ------------------------------------------------------

    public ProfileItemDTO create(NewItem req) {
        User user = currentUser();
        if (req == null || req.section() == null) throw ProfileItemException.invalid("section", "is required");
        ObjectNode data = validData("dataJson", req.dataJson());
        ensureSeeded(user);

        List<ProfileItem> live = itemRepository.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(user.getId());
        if (live.size() >= MAX_LIVE_ITEMS) {
            throw ProfileItemException.limit("A profile holds at most " + MAX_LIVE_ITEMS + " items", MAX_LIVE_ITEMS);
        }
        List<ProfileItem> inSection = new ArrayList<>(live.stream().filter(i -> i.getSection() == req.section()).toList());

        ProfileItem row = newRow(user, req.section(), data, req.provenance() == null ? Provenance.USER : req.provenance(), null);
        row.setPosition(inSection.size());
        row = itemRepository.save(row);
        if (req.position() != null) {
            inSection.add(row);
            reposition(inSection, row, req.position());
        }
        touchCompleteness(user.getId());
        return toDto(row);
    }

    public ProfileItemDTO update(Long id, ItemPatch patch) {
        User user = currentUser();
        ProfileItem row = owned(id, user.getId());
        if (patch != null) {
            if (patch.dataJson() != null) row.setDataJson(ResumeDocumentJson.write(validData("dataJson", patch.dataJson()), 0));
            if (patch.hidden() != null) row.setHidden(patch.hidden());
            if (patch.provenance() != null) row.setProvenance(patch.provenance());
            row.setUpdatedAt(Instant.now());
            itemRepository.save(row);
            if (patch.position() != null) {
                reposition(liveIn(user.getId(), row.getSection()), row, patch.position());
            }
        }
        touchCompleteness(user.getId());
        return toDto(row);
    }

    /** Soft delete: the row stays (deleted_at) for the retention purge; the section is re-numbered. */
    public void delete(Long id) {
        User user = currentUser();
        ProfileItem row = owned(id, user.getId());
        row.setDeletedAt(Instant.now());
        row.setUpdatedAt(row.getDeletedAt());
        itemRepository.save(row);
        renumber(liveIn(user.getId(), row.getSection()));
        touchCompleteness(user.getId());
    }

    /**
     * Put {@code ids} first, in that order; items of the section not listed keep their relative
     * order after them (so an item added elsewhere meanwhile is not lost). An id that is not a live
     * item of this user in this section is a 404; a repeated id is a 422.
     */
    public void reorder(Reorder req) {
        User user = currentUser();
        if (req == null || req.section() == null) throw ProfileItemException.invalid("section", "is required");
        if (req.ids() == null) throw ProfileItemException.invalid("ids", "is required");
        List<ProfileItem> live = liveIn(user.getId(), req.section());
        Map<Long, ProfileItem> byId = new HashMap<>();
        live.forEach(i -> byId.put(i.getId(), i));
        Set<Long> seen = new LinkedHashSet<>();
        List<ProfileItem> ordered = new ArrayList<>();
        for (Long id : req.ids()) {
            if (id == null || !byId.containsKey(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile item not found");
            if (!seen.add(id)) throw ProfileItemException.invalid("ids", "contains " + id + " twice");
            ordered.add(byId.get(id));
        }
        live.stream().filter(i -> !seen.contains(i.getId())).forEach(ordered::add);
        renumber(ordered);
    }

    // ---- import -----------------------------------------------------------------------------------

    /**
     * One transaction: every item and bio value is checked (size, shape, never-collected values)
     * before anything is written, so a refusal changes nothing. Items merge into matching existing
     * ones (see {@link ProfileItemMerge}); bio values overwrite - the client sends what the user
     * confirmed. An import also counts as the profile's seeding (the user chose what to keep, so the
     * default resume must not later be copied in over it).
     */
    public ImportResult importItems(ImportRequest req) {
        User user = currentUser();
        Long uid = user.getId();
        if (req == null) throw ProfileItemException.invalid("body", "is required");
        List<ImportItem> items = req.items() == null ? List.of() : req.items();
        if (items.size() > MAX_IMPORT_ITEMS) {
            throw ProfileItemException.limit("One import holds at most " + MAX_IMPORT_ITEMS + " items", MAX_IMPORT_ITEMS);
        }

        Set<Long> ownedResumeIds = new HashSet<>();
        resumeRepository.findByUserId(uid).forEach(r -> ownedResumeIds.add(r.getId()));
        List<Incoming> incoming = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            ImportItem it = items.get(i);
            String path = "items[" + i + "]";
            if (it == null || it.section() == null) throw ProfileItemException.invalid(path + ".section", "is required");
            ObjectNode data = validData(path + ".dataJson", it.dataJson());
            Long src = it.sourceResumeId() != null && ownedResumeIds.contains(it.sourceResumeId()) ? it.sourceResumeId() : null;
            incoming.add(new Incoming(it.section(), data, it.provenance() == null ? Provenance.PARSED : it.provenance(), src));
        }
        Map<String, String> bioValues = validBio(req.bio());
        String bioSource = req.provenanceBio() != null && BIO_PROVENANCE.contains(req.provenanceBio()) ? req.provenanceBio() : "parsed";

        // -- writes from here on --
        Bio bio = bioOf(uid);
        Long markerResumeId = null;
        if (bio == null || !ProfileMeta.isSeeded(ProfileMeta.read(bio.getMetaJson()))) {
            markerResumeId = defaultResume(uid)
                .map(Resume::getId)
                .orElseGet(() -> incoming.stream().map(Incoming::sourceResumeId).filter(Objects::nonNull).findFirst().orElse(null));
        }
        if (bio == null && (!bioValues.isEmpty() || markerResumeId != null)) {
            bio = newBio(user);
        }

        boolean updatedBio = false;
        if (bio != null && !bioValues.isEmpty()) {
            updatedBio = writeBioValues(bio, bioValues, bioSource);
        }
        Merged m = addOrMerge(user, incoming);
        if (bio != null) {
            ObjectNode meta = ProfileMeta.read(bio.getMetaJson());
            if (markerResumeId != null && !ProfileMeta.isSeeded(meta)) ProfileMeta.markSeeded(meta, markerResumeId);
            bio.setMetaJson(ProfileMeta.write(meta));
            refreshCompleteness(bio, uid);
            bioRepository.save(bio);
        }
        return new ImportResult(m.created(), m.merged(), updatedBio);
    }

    // ---- seeding ----------------------------------------------------------------------------------

    /**
     * Copy the default resume's {@code parsed_json} lists into profile items, once per user
     * ({@code bio.meta_json.seededFromResumeId}). Nothing happens when the user has no default resume
     * (it is retried on the next call, so a first upload seeds the profile). The marker needs a bio
     * row; if the user has none yet an empty one ({@code {}}) is created - the web reads an empty
     * payload and a missing profile the same way. The copy goes through {@link ProfileSeed}, then
     * {@link SensitiveContent#redact} (resumes stored before the check existed may hold a never-collected
     * value; it is removed, not imported), then the same merge as {@code /import}. Concurrent first
     * calls are serialised by a row lock on the bio.
     */
    public void ensureSeeded(User user) {
        Long uid = user.getId();
        Bio bio = bioOf(uid);
        if (bio != null && ProfileMeta.isSeeded(ProfileMeta.read(bio.getMetaJson()))) return;
        Resume def = defaultResume(uid).orElse(null);
        if (def == null) return;

        if (bio == null) {
            bio = newBio(user);
        } else {
            em.refresh(bio, LockModeType.PESSIMISTIC_WRITE); // wait for a concurrent seed, then re-read its result
            if (ProfileMeta.isSeeded(ProfileMeta.read(bio.getMetaJson()))) return;
        }

        List<Incoming> incoming = new ArrayList<>();
        for (ProfileSeed.Seeded s : ProfileSeed.fromStructured(parseQuiet(def.getParsedJson()))) {
            int removed = SensitiveContent.redact(s.data());
            if (removed > 0) LOG.info("Removed {} never-collected value(s) while seeding the profile of user {}", removed, uid);
            try {
                SensitiveContent.check("", s.data());
            } catch (SensitiveContentException e) {
                continue; // cannot happen after redact; never import it if it somehow does
            }
            incoming.add(new Incoming(s.section(), s.data(), Provenance.PARSED, def.getId()));
        }
        try {
            addOrMerge(user, incoming);
        } catch (ProfileItemException e) {
            LOG.warn("Seeding the profile of user {} stopped early: {}", uid, e.getMessage());
        }
        ObjectNode meta = ProfileMeta.read(bio.getMetaJson());
        ProfileMeta.markSeeded(meta, def.getId());
        bio.setMetaJson(ProfileMeta.write(meta));
        refreshCompleteness(bio, uid);
        bioRepository.save(bio);
    }

    // ---- bio hooks (called by ProfileService) ---------------------------------------------------

    /**
     * A bio payload was written: stamp {@code meta.provenance[key] = source} for every key that was
     * added or changed (and drop it for removed keys), then refresh the cached completeness. Sets
     * {@code bio.metaJson}; the caller saves the bio. A payload that is not a JSON object is left alone.
     */
    public void onBioWritten(Bio bio, String oldPayload, String newPayload, String source) {
        ObjectNode meta = ProfileMeta.read(bio.getMetaJson());
        JsonNode before = parseObject(oldPayload);
        JsonNode after = parseObject(newPayload);
        if (after != null) {
            Set<String> changed = new LinkedHashSet<>();
            Iterator<String> names = after.fieldNames();
            while (names.hasNext()) {
                String k = names.next();
                if (before == null || !Objects.equals(before.get(k), after.get(k))) changed.add(k);
            }
            Set<String> removed = new LinkedHashSet<>();
            if (before != null) before.fieldNames().forEachRemaining(k -> {
                if (!after.has(k)) removed.add(k);
            });
            ProfileMeta.stamp(meta, changed, source);
            ProfileMeta.unstamp(meta, removed);
        }
        bio.setMetaJson(ProfileMeta.write(meta));
        refreshCompleteness(bio, bio.getUser().getId());
    }

    // ---- internals --------------------------------------------------------------------------------

    /** Recompute the score and next action from the bio payload and live items and store them in {@code bio.metaJson}. */
    void refreshCompleteness(Bio bio, Long userId) {
        ProfileCompleteness.Result r = compute(bio, userId);
        ObjectNode meta = ProfileMeta.read(bio.getMetaJson());
        ProfileMeta.putCompleteness(meta, r, Instant.now());
        bio.setMetaJson(ProfileMeta.write(meta));
    }

    private ProfileCompleteness.Result compute(Bio bio, Long userId) {
        List<ProfileItem> live = itemRepository.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(userId);
        return ProfileCompleteness.compute(bio == null ? null : parseObject(bio.getPayload()), live);
    }

    private void touchCompleteness(Long userId) {
        Bio bio = bioOf(userId);
        if (bio != null) {
            refreshCompleteness(bio, userId);
            bioRepository.save(bio);
        }
    }

    private Merged addOrMerge(User user, List<Incoming> incoming) {
        Long uid = user.getId();
        List<ProfileItem> live = new ArrayList<>(itemRepository.findByUserIdAndDeletedAtIsNullOrderBySectionAscPositionAsc(uid));
        Map<String, ProfileItem> byKey = new HashMap<>();
        Map<ProfileSection, Integer> next = new EnumMap<>(ProfileSection.class);
        for (ProfileItem it : live) {
            String key = ProfileItemMerge.identityKey(it.getSection(), parseObjectOrEmpty(it.getDataJson()));
            if (key != null) byKey.putIfAbsent(key, it);
            next.merge(it.getSection(), 1, Integer::sum);
        }
        int created = 0;
        int merged = 0;
        for (Incoming in : incoming) {
            String key = ProfileItemMerge.identityKey(in.section(), in.data());
            ProfileItem hit = key == null ? null : byKey.get(key);
            if (hit != null) {
                ObjectNode current = parseObjectOrEmpty(hit.getDataJson());
                if (ProfileItemMerge.merge(current, in.data())) {
                    hit.setDataJson(ResumeDocumentJson.write(current, 0));
                    hit.setUpdatedAt(Instant.now());
                    itemRepository.save(hit);
                }
                merged++;
                continue;
            }
            if (live.size() >= MAX_LIVE_ITEMS) {
                throw ProfileItemException.limit("A profile holds at most " + MAX_LIVE_ITEMS + " items", MAX_LIVE_ITEMS);
            }
            ProfileItem row = newRow(user, in.section(), in.data(), in.provenance(), in.sourceResumeId());
            row.setPosition(next.merge(in.section(), 1, Integer::sum) - 1);
            row = itemRepository.save(row);
            live.add(row);
            if (key != null) byKey.put(key, row);
            created++;
        }
        return new Merged(created, merged);
    }

    /** Check a bio import object: allowed keys only, scalar values, length-capped, never-collected values refused. */
    private Map<String, String> validBio(JsonNode bio) {
        Map<String, String> out = new java.util.LinkedHashMap<>();
        if (bio == null || bio.isNull()) return out;
        if (!bio.isObject()) throw ProfileItemException.invalid("bio", "must be an object");
        Iterator<Map.Entry<String, JsonNode>> it = bio.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            String key = e.getKey();
            if (!BIO_IMPORT_KEYS.contains(key)) continue;
            JsonNode v = e.getValue();
            if (v == null || v.isNull()) continue;
            if (!v.isTextual() && !v.isNumber()) throw ProfileItemException.invalid("bio." + key, "must be text");
            String value = ResumeDocument.trimWs(v.asText());
            if (value.isEmpty()) continue;
            int max = "summary".equals(key) ? MAX_BIO_SUMMARY : MAX_BIO_VALUE;
            if (value.length() > max) throw ProfileItemException.invalid("bio." + key, "is over " + max + " characters");
            SensitiveContent.check("bio." + key, key, value);
            out.put(key, value);
        }
        return out;
    }

    /** Merge {@code values} into the bio payload, stamp provenance; true when any value actually changed. */
    private boolean writeBioValues(Bio bio, Map<String, String> values, String source) {
        ObjectNode payload;
        try {
            JsonNode n = bio.getPayload() == null || bio.getPayload().isBlank() ? om.createObjectNode() : om.readTree(bio.getPayload());
            if (!(n instanceof ObjectNode o)) throw new IllegalStateException();
            payload = o;
        } catch (Exception e) {
            // Same refusal as ProfileSuggestionService: never overwrite a payload we cannot read.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Your profile couldn't be read; edit it on the profile page first");
        }
        Set<String> changed = new LinkedHashSet<>();
        values.forEach((k, v) -> {
            JsonNode cur = payload.get(k);
            if (cur == null || !cur.isTextual() || !cur.textValue().equals(v)) {
                payload.put(k, v);
                changed.add(k);
            }
        });
        if (changed.isEmpty()) return false;
        bio.setPayload(payload.toString());
        bio.setUpdatedAt(Instant.now());
        ObjectNode meta = ProfileMeta.read(bio.getMetaJson());
        ProfileMeta.stamp(meta, changed, source);
        bio.setMetaJson(ProfileMeta.write(meta));
        return true;
    }

    /** The item object for storage: shape, size and never-collected check, in that order. */
    private ObjectNode validData(String path, JsonNode node) {
        JsonNode n = node;
        if (n != null && n.isTextual()) {
            try {
                n = ResumeDocument.parse(n.textValue());
            } catch (RuntimeException e) {
                throw ProfileItemException.invalid(path, "must be a JSON object");
            }
        }
        if (!(n instanceof ObjectNode obj)) throw ProfileItemException.invalid(path, "must be a JSON object");
        if (ResumeDocumentJson.write(obj, 0).getBytes(StandardCharsets.UTF_8).length > MAX_ITEM_BYTES) {
            throw ProfileItemException.tooLarge(path, MAX_ITEM_BYTES);
        }
        SensitiveContent.check(path, obj);
        return obj;
    }

    private ProfileItem newRow(User user, ProfileSection section, ObjectNode data, Provenance provenance, Long sourceResumeId) {
        ProfileItem row = new ProfileItem();
        row.setUser(user);
        row.setSection(section);
        row.setDataJson(ResumeDocumentJson.write(data, 0));
        row.setProvenance(provenance);
        row.setSourceResumeId(sourceResumeId);
        return row;
    }

    private List<ProfileItem> liveIn(Long userId, ProfileSection section) {
        return new ArrayList<>(itemRepository.findByUserIdAndSectionAndDeletedAtIsNullOrderByPosition(userId, section));
    }

    /** Move {@code moved} to {@code target} (clamped) among {@code sectionItems} and re-number. */
    private void reposition(List<ProfileItem> sectionItems, ProfileItem moved, int target) {
        List<ProfileItem> ordered = new ArrayList<>(sectionItems);
        ordered.removeIf(i -> Objects.equals(i.getId(), moved.getId()));
        ordered.add(Math.max(0, Math.min(target, ordered.size())), moved);
        renumber(ordered);
    }

    private void renumber(List<ProfileItem> ordered) {
        for (int i = 0; i < ordered.size(); i++) {
            ProfileItem it = ordered.get(i);
            if (it.getPosition() != i) {
                it.setPosition(i);
                itemRepository.save(it);
            }
        }
    }

    private ProfileItem owned(Long id, Long userId) {
        return itemRepository
            .findByIdAndUserId(id, userId)
            .filter(i -> i.getDeletedAt() == null)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile item not found"));
    }

    private java.util.Optional<Resume> defaultResume(Long userId) {
        return resumeRepository.findByUserId(userId).stream().filter(r -> Boolean.TRUE.equals(r.getDefaultResume())).findFirst();
    }

    private Bio bioOf(Long userId) {
        return bioRepository.findByUserId(userId).stream().findFirst().orElse(null);
    }

    private Bio newBio(User user) {
        Bio bio = new Bio();
        bio.setPayload("{}");
        bio.setUpdatedAt(Instant.now());
        bio.setUser(user);
        return bioRepository.saveAndFlush(bio);
    }

    private ProfileItemDTO toDto(ProfileItem p) {
        return new ProfileItemDTO(p.getId(), p.getSection(), p.getPosition(), parseObjectOrEmpty(p.getDataJson()), p.getProvenance(), p.getSourceResumeId(), p.isHidden(), p.getUpdatedAt());
    }

    private JsonNode parseQuiet(String json) {
        try {
            return json == null || json.isBlank() ? null : om.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private JsonNode parseObject(String json) {
        JsonNode n = parseQuiet(json);
        return n != null && n.isObject() ? n : null;
    }

    private ObjectNode parseObjectOrEmpty(String json) {
        JsonNode n = parseQuiet(json);
        return n instanceof ObjectNode o ? o : om.createObjectNode();
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository
            .findOneByLogin(login)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
