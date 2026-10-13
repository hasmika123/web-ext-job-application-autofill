package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.domain.ent.OrgBrandingVersion;
import com.dossier.api.domain.enumeration.OrgBrandingTheme;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.repository.ent.OrgBrandingVersionRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.ent.OrgBrandingDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.OrgStorageKeys;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Organization branding with a draft and a published side (X2.5, 11-branding-and-login.md section 1.2).
 *
 * <ul>
 *   <li>The PUBLISHED values live in the {@code org_branding} columns and are the only thing {@code GET /api/public/tenant}
 *       and the public asset route read. The DRAFT is a complete branding object in {@code draft_json}; editing, uploading
 *       and discarding touch only the draft.</li>
 *   <li>{@link #publish} validates the whole draft, copies it into the columns, appends an {@code org_branding_version} row,
 *       bumps {@code organization.config_version} (cache bust of every asset URL) and writes one audit row with the changed keys.</li>
 *   <li>Colours: {@code #rrggbb}, and white text must reach WCAG AA on primary, secondary and accent
 *       ({@link BrandingColors}); a colour that fails is refused with the nearest one that passes.</li>
 *   <li>Assets only through {@link #uploadAsset}: raster, validated and re-encoded by {@link BrandingAssetProcessor}, stored
 *       content-addressed under {@code org/{orgId}/branding/}. Superseded objects are NOT deleted: published versions keep
 *       pointing at their files so a restore always works.</li>
 *   <li>Every method names the organization from the caller's resolved membership; nothing else selects a row.</li>
 * </ul>
 */
@Service
public class OrgBrandingService {

    /** The 22 label keys an organization may rename (11 section 1.3). */
    public static final Set<String> TERMINOLOGY_KEYS = Set.of(
        "consultant", "consultants", "marketer", "marketers", "client", "clients", "placement", "placements",
        "opportunity", "opportunities", "submission", "submissions", "department", "departments", "team", "teams",
        "employee", "employees", "requirement", "requirements", "vendor", "vendors"
    );

    static final String CODE_COLOUR = "BRANDING_COLOR_LOW_CONTRAST";
    static final String CODE_CONFLICT = "BRANDING_DRAFT_CONFLICT";
    static final String CODE_NOTHING = "BRANDING_NOTHING_TO_PUBLISH";

    private static final Set<String> COLOUR_KEYS = Set.of("primary", "secondary", "accent");
    private static final Set<String> TEXT_KEYS = Set.of("welcomeTitle", "welcomeMessage", "supportEmail");
    private static final Set<String> SETTABLE = Set.of("primary", "secondary", "accent", "theme", "welcomeTitle", "welcomeMessage", "supportEmail", "featureChips", "terminology", "navPrefs");
    private static final Set<String> ASSET_KEYS = Set.of("logoKey", "faviconKey", "bannerKey");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@<>\"]{1,64}@[A-Za-z0-9.-]{1,190}\\.[A-Za-z]{2,24}$");
    private static final Pattern NAV_KEY = Pattern.compile("^[a-z0-9._-]{1,40}$");
    private static final TypeReference<LinkedHashMap<String, Object>> MAP = new TypeReference<>() {};

    private final OrganizationRepository orgs;
    private final OrgBrandingRepository brandings;
    private final OrgBrandingVersionRepository versions;
    private final OrgAuditService audit;
    private final FileStorage storage;
    private final BrandingAssetProcessor processor;
    private final ObjectMapper mapper;
    private final ApplicationEventPublisher events;

    public OrgBrandingService(
        OrganizationRepository orgs,
        OrgBrandingRepository brandings,
        OrgBrandingVersionRepository versions,
        OrgAuditService audit,
        FileStorage storage,
        BrandingAssetProcessor processor,
        ObjectMapper mapper,
        ApplicationEventPublisher events
    ) {
        this.orgs = orgs;
        this.brandings = brandings;
        this.versions = versions;
        this.audit = audit;
        this.storage = storage;
        this.processor = processor;
        this.mapper = mapper;
        this.events = events;
    }

    // ---- reads -----------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public OrgBrandingDTO get(OrgMembership me) {
        loadOrg(me);
        return view(me.orgId(), brandings.findByOrgId(me.orgId()).orElse(null));
    }

    /** Colour check for the live preview: can this colour carry white text, and if not what is the nearest that can. */
    public OrgBrandingDTO.ColourCheck checkColour(String color) {
        if (!BrandingColors.isHex(color)) return new OrgBrandingDTO.ColourCheck(color, false, false, 0, null);
        String c = BrandingColors.normalise(color);
        double ratio = BrandingColors.onWhite(c);
        boolean ok = ratio >= BrandingColors.AA_BODY;
        return new OrgBrandingDTO.ColourCheck(c, true, ok, Math.round(ratio * 100) / 100.0, ok ? c : BrandingColors.suggestForWhiteText(c));
    }

    // ---- draft -----------------------------------------------------------------------------------------------------

    /**
     * Merge {@code patch} into the draft. A null value clears a field (back to the default). {@code ifMatch}, when given,
     * must equal the current draft version (the editor's autosave sends it): a stale editor gets a 409 instead of
     * overwriting a newer tab.
     */
    @Transactional
    public OrgBrandingDTO patchDraft(OrgMembership me, Map<String, Object> patch, Integer ifMatch) {
        loadOrg(me);
        OrgBranding b = rowForWrite(me.orgId());
        if (ifMatch != null && ifMatch != b.getDraftVersion()) {
            throw OrgException.coded(409, CODE_CONFLICT, "The draft changed in another tab; reload to continue.", Map.of("draftVersion", b.getDraftVersion()));
        }
        Map<String, Object> draft = effectiveDraft(b);
        for (Map.Entry<String, Object> e : patch.entrySet()) {
            String key = e.getKey();
            if (ASSET_KEYS.contains(key) || key.endsWith("Hash")) throw OrgException.invalid(key, "images are changed through the upload endpoint");
            if (!SETTABLE.contains(key)) throw OrgException.invalid(key, "is not a branding field");
            Object value = e.getValue() == null ? null : validate(key, e.getValue());
            if (value == null) draft.remove(key);
            else draft.put(key, value);
        }
        saveDraft(b, draft, me);
        return view(me.orgId(), b);
    }

    @Transactional
    public OrgBrandingDTO discard(OrgMembership me) {
        loadOrg(me);
        OrgBranding b = brandings.findByOrgId(me.orgId()).orElse(null);
        if (b != null && b.getDraftJson() != null) {
            b.setDraftJson(null);
            b.setDraftVersion(b.getDraftVersion() + 1);
            b.setDraftUpdatedAt(null);
            b.setUpdatedByMemberId(me.memberId());
            brandings.saveAndFlush(b);
        }
        return view(me.orgId(), b);
    }

    /** Copy version {@code versionNo} into the draft (never publishes by itself). */
    @Transactional
    public OrgBrandingDTO restore(OrgMembership me, int versionNo) {
        loadOrg(me);
        OrgBrandingVersion v = versions.findByOrgIdAndVersionNo(me.orgId(), versionNo).orElseThrow(OrgNotFoundException::new);
        OrgBranding b = rowForWrite(me.orgId());
        saveDraft(b, readMap(v.getSnapshotJson()), me);
        audit.record(me, OrgAuditService.BRANDING_RESTORE, OrgAuditService.TARGET_BRANDING, null, String.valueOf(versionNo), "restored version " + versionNo + " into the draft");
        return view(me.orgId(), b);
    }

    // ---- publish ---------------------------------------------------------------------------------------------------

    @Transactional
    public OrgBrandingDTO.Published publish(OrgMembership me) {
        Organization org = loadOrg(me);
        OrgBranding b = rowForWrite(me.orgId());
        if (b.getDraftJson() == null && b.getPublishedAt() != null) {
            throw OrgException.coded(409, CODE_NOTHING, "There is nothing to publish: the draft equals what is live.", Map.of());
        }
        Map<String, Object> before = publishedMap(b);
        Map<String, Object> draft = effectiveDraft(b);
        validateAll(me.orgId(), draft);

        b.setPrimaryColor((String) draft.get("primary"));
        b.setSecondaryColor((String) draft.get("secondary"));
        b.setAccentColor((String) draft.get("accent"));
        b.setTheme(draft.get("theme") == null ? OrgBrandingTheme.SYSTEM : OrgBrandingTheme.valueOf((String) draft.get("theme")));
        b.setWelcomeTitle((String) draft.get("welcomeTitle"));
        b.setWelcomeMessage((String) draft.get("welcomeMessage"));
        b.setSupportEmail((String) draft.get("supportEmail"));
        b.setLoginChipsJson(draft.get("featureChips") == null ? null : write(draft.get("featureChips")));
        b.setTerminologyJson(draft.get("terminology") == null ? null : write(draft.get("terminology")));
        b.setNavPrefsJson(draft.get("navPrefs") == null ? null : write(draft.get("navPrefs")));
        b.setLogoKey((String) draft.get("logoKey"));
        b.setFaviconKey((String) draft.get("faviconKey"));
        b.setLoginBannerKey((String) draft.get("bannerKey"));
        Instant now = Instant.now();
        b.setPublishedAt(now);
        b.setDraftJson(null);
        b.setDraftUpdatedAt(null);
        b.setDraftVersion(b.getDraftVersion() + 1);
        b.setUpdatedByMemberId(me.memberId());
        brandings.saveAndFlush(b);

        Map<String, Object> after = publishedMap(b);
        int versionNo = versions.maxVersionNo(me.orgId()) + 1;
        OrgBrandingVersion v = new OrgBrandingVersion();
        v.setOrgId(me.orgId());
        v.setVersionNo(versionNo);
        v.setSnapshotJson(write(after));
        v.setPublishedAt(now);
        v.setPublishedByMemberId(me.memberId());
        versions.save(v);

        org.setConfigVersion(org.getConfigVersion() + 1);
        orgs.saveAndFlush(org);

        List<String> changed = new ArrayList<>(new TreeSet<>(changedKeys(before, after)));
        audit.record(me, OrgAuditService.BRANDING_PUBLISH, OrgAuditService.TARGET_BRANDING, null, String.valueOf(versionNo), "version " + versionNo + "; changed: " + String.join(",", changed));
        events.publishEvent(new TenantConfigChangedEvent("branding publish"));
        return new OrgBrandingDTO.Published(versionNo, changed, view(me.orgId(), b));
    }

    // ---- assets ----------------------------------------------------------------------------------------------------

    @Transactional
    public OrgBrandingDTO uploadAsset(OrgMembership me, String kind, byte[] content) {
        loadOrg(me);
        requireKind(kind);
        BrandingAssetProcessor.Processed p = processor.process(kind, content);
        String hash = sha256(p.bytes()).substring(0, 12);
        String key = OrgStorageKeys.brandingKey(me.orgId(), kind, hash, p.ext());
        storage.store(key, p.bytes(), p.contentType());
        OrgBranding b = rowForWrite(me.orgId());
        Map<String, Object> draft = effectiveDraft(b);
        draft.put(kind + "Key", key);
        saveDraft(b, draft, me);
        audit.record(me, OrgAuditService.BRANDING_ASSET, OrgAuditService.TARGET_BRANDING, null, kind, "uploaded " + kind + " " + p.width() + "x" + p.height() + " " + p.contentType());
        return view(me.orgId(), b);
    }

    @Transactional
    public OrgBrandingDTO removeAsset(OrgMembership me, String kind) {
        loadOrg(me);
        requireKind(kind);
        OrgBranding b = brandings.findByOrgId(me.orgId()).orElse(null);
        if (b == null) return view(me.orgId(), null);
        Map<String, Object> draft = effectiveDraft(b);
        if (draft.remove(kind + "Key") != null) {
            saveDraft(b, draft, me);
            audit.record(me, OrgAuditService.BRANDING_ASSET, OrgAuditService.TARGET_BRANDING, null, kind, "removed " + kind + " from the draft");
        }
        return view(me.orgId(), b);
    }

    // ---- validation ------------------------------------------------------------------------------------------------

    private Object validate(String key, Object value) {
        if (COLOUR_KEYS.contains(key)) {
            if (!(value instanceof String s) || !BrandingColors.isHex(s)) throw OrgException.invalid(key, "must be a colour like #1e6ff5");
            String c = BrandingColors.normalise(s);
            double ratio = BrandingColors.onWhite(c);
            if (ratio < BrandingColors.AA_BODY) {
                String suggestion = BrandingColors.suggestForWhiteText(c);
                throw OrgException.coded(
                    422,
                    CODE_COLOUR,
                    key + ": " + c + " is too light for white text (contrast " + String.format("%.2f", ratio) + ":1, needs 4.5:1). Try " + suggestion + ".",
                    Map.of("field", key, "color", c, "contrast", Math.round(ratio * 100) / 100.0, "required", BrandingColors.AA_BODY, "suggestion", suggestion)
                );
            }
            return c;
        }
        switch (key) {
            case "theme" -> {
                try {
                    return OrgBrandingTheme.valueOf(String.valueOf(value)).name();
                } catch (IllegalArgumentException e) {
                    throw OrgException.invalid(key, "must be LIGHT, DARK or SYSTEM");
                }
            }
            case "welcomeTitle" -> {
                return text(key, value, 120);
            }
            case "welcomeMessage" -> {
                return text(key, value, 500);
            }
            case "supportEmail" -> {
                String s = text(key, value, 254);
                if (s != null && !EMAIL.matcher(s).matches()) throw OrgException.invalid(key, "must be an email address");
                return s;
            }
            case "featureChips" -> {
                return featureChips(value);
            }
            case "terminology" -> {
                return terminology(value);
            }
            case "navPrefs" -> {
                return navPrefs(value);
            }
            default -> throw OrgException.invalid(key, "is not a branding field");
        }
    }

    private String text(String key, Object value, int max) {
        if (!(value instanceof String s)) throw OrgException.invalid(key, "must be text");
        String t = s.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) throw OrgException.invalid(key, "must be at most " + max + " characters");
        if (t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(key, "must be plain text");
        if (!"supportEmail".equals(key)) SensitiveContent.check(key, key, t);
        return t;
    }

    /** Up to three short plain-text labels for the login's feature chips. */
    private List<String> featureChips(Object value) {
        if (!(value instanceof List<?> list) || list.size() > 3) throw OrgException.invalid("featureChips", "must be a list of at most 3 labels");
        List<String> out = new ArrayList<>();
        for (Object o : list) {
            String t = text("featureChips", o, 24);
            if (t != null) out.add(t);
        }
        return out.isEmpty() ? null : out;
    }

    private Map<String, Object> terminology(Object value) {
        if (!(value instanceof Map<?, ?> m)) throw OrgException.invalid("terminology", "must be an object");
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : m.entrySet()) {
            String k = String.valueOf(e.getKey());
            if (!TERMINOLOGY_KEYS.contains(k)) throw OrgException.invalid("terminology." + k, "is not a label you can rename");
            if (e.getValue() == null) continue;
            String t = text("terminology." + k, e.getValue(), 30);
            if (t != null) out.put(k, t);
        }
        return out.isEmpty() ? null : out;
    }

    private Map<String, Object> navPrefs(Object value) {
        if (!(value instanceof Map<?, ?> m)) throw OrgException.invalid("navPrefs", "must be an object");
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : m.entrySet()) {
            String k = String.valueOf(e.getKey());
            if (!k.equals("hidden") && !k.equals("order")) throw OrgException.invalid("navPrefs." + k, "is not a navigation preference");
            if (!(e.getValue() instanceof List<?> list) || list.size() > 50) throw OrgException.invalid("navPrefs." + k, "must be a list of at most 50 keys");
            List<String> keys = new ArrayList<>();
            for (Object o : list) {
                if (!(o instanceof String s) || !NAV_KEY.matcher(s).matches()) throw OrgException.invalid("navPrefs." + k, "holds an invalid navigation key");
                keys.add(s);
            }
            out.put(k, keys);
        }
        return out.isEmpty() ? null : out;
    }

    /** Re-run every rule over the whole draft at publish time (a stored draft is not trusted), incl. the asset keys. */
    private void validateAll(Long orgId, Map<String, Object> draft) {
        for (String key : SETTABLE) {
            Object v = draft.get(key);
            if (v != null) draft.put(key, validate(key, v));
        }
        for (String key : ASSET_KEYS) {
            Object v = draft.get(key);
            if (v == null) continue;
            if (!(v instanceof String s) || !OrgStorageKeys.isBrandingKeyOf(orgId, s) || !storage.exists(s)) throw OrgException.invalid(key, "refers to a file that is gone; upload it again");
        }
        for (String k : draft.keySet()) {
            if (!SETTABLE.contains(k) && !ASSET_KEYS.contains(k)) throw OrgException.invalid(k, "is not a branding field");
        }
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------

    private Organization loadOrg(OrgMembership me) {
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        if (org.getStatus() == OrgStatus.CLOSED) throw OrgException.notEditable("A closed organization's branding can not be changed.");
        return org;
    }

    private OrgBranding rowForWrite(Long orgId) {
        return brandings.findByOrgId(orgId).orElseGet(() -> {
            OrgBranding b = new OrgBranding();
            b.setOrgId(orgId);
            return brandings.saveAndFlush(b);
        });
    }

    /** The draft as a full object: draft_json when there is one, else a copy of what is published. */
    private Map<String, Object> effectiveDraft(OrgBranding b) {
        return b.getDraftJson() != null ? readMap(b.getDraftJson()) : publishedMap(b);
    }

    private void saveDraft(OrgBranding b, Map<String, Object> draft, OrgMembership me) {
        b.setDraftJson(write(draft));
        b.setDraftVersion(b.getDraftVersion() + 1);
        b.setDraftUpdatedAt(Instant.now());
        b.setUpdatedByMemberId(me.memberId());
        brandings.saveAndFlush(b);
    }

    /** The published columns as a branding object (only set fields appear). */
    Map<String, Object> publishedMap(OrgBranding b) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (b.getPublishedAt() == null) return m; // nothing published yet: the draft starts from the defaults
        put(m, "primary", b.getPrimaryColor());
        put(m, "secondary", b.getSecondaryColor());
        put(m, "accent", b.getAccentColor());
        put(m, "theme", b.getTheme() == null ? null : b.getTheme().name());
        put(m, "welcomeTitle", b.getWelcomeTitle());
        put(m, "welcomeMessage", b.getWelcomeMessage());
        put(m, "supportEmail", b.getSupportEmail());
        if (b.getLoginChipsJson() != null) put(m, "featureChips", readJson(b.getLoginChipsJson()));
        if (b.getTerminologyJson() != null) put(m, "terminology", readJson(b.getTerminologyJson()));
        if (b.getNavPrefsJson() != null) put(m, "navPrefs", readJson(b.getNavPrefsJson()));
        put(m, "logoKey", b.getLogoKey());
        put(m, "faviconKey", b.getFaviconKey());
        put(m, "bannerKey", b.getLoginBannerKey());
        return m;
    }

    private static void put(Map<String, Object> m, String k, Object v) {
        if (v != null) m.put(k, v);
    }

    private static List<String> changedKeys(Map<String, Object> before, Map<String, Object> after) {
        List<String> out = new ArrayList<>();
        Set<String> all = new TreeSet<>(before.keySet());
        all.addAll(after.keySet());
        for (String k : all) {
            if (!java.util.Objects.equals(String.valueOf(before.get(k)), String.valueOf(after.get(k)))) out.add(k.endsWith("Key") ? k.substring(0, k.length() - 3) : k);
        }
        return out;
    }

    private OrgBrandingDTO view(Long orgId, OrgBranding b) {
        List<OrgBrandingDTO.Version> history = versions.findAllByOrgIdNewestFirst(orgId).stream()
            .limit(20)
            .map(v -> new OrgBrandingDTO.Version(v.getVersionNo(), v.getPublishedAt(), v.getPublishedByMemberId()))
            .toList();
        if (b == null) return new OrgBrandingDTO(Map.of(), Map.of(), false, 0, null, null, history);
        return new OrgBrandingDTO(
            external(publishedMap(b)),
            external(effectiveDraft(b)),
            b.getDraftJson() != null,
            b.getDraftVersion(),
            b.getDraftUpdatedAt(),
            b.getPublishedAt(),
            history
        );
    }

    /** Storage keys never leave the API: an asset is shown as its content hash. */
    private static Map<String, Object> external(Map<String, Object> m) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : m.entrySet()) {
            if (e.getKey().endsWith("Key") && e.getValue() instanceof String s) out.put(e.getKey().substring(0, e.getKey().length() - 3) + "Hash", OrgStorageKeys.hashOf(s));
            else out.put(e.getKey(), e.getValue());
        }
        return out;
    }

    private static void requireKind(String kind) {
        if (!OrgStorageKeys.BRANDING_KINDS.contains(kind)) throw new OrgNotFoundException();
    }

    private LinkedHashMap<String, Object> readMap(String json) {
        try {
            return mapper.readValue(json, MAP);
        } catch (Exception e) {
            throw new IllegalStateException("A stored branding object could not be read", e);
        }
    }

    private Object readJson(String json) {
        try {
            JsonNode n = mapper.readTree(json);
            return mapper.convertValue(n, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String write(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
