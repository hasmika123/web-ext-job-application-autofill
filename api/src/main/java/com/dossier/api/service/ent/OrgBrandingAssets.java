package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.OrgBranding;
import com.dossier.api.repository.ent.OrgBrandingRepository;
import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.OrgStorageKeys;
import com.dossier.api.service.storage.StorageObjectNotFoundException;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads an organization's PUBLISHED branding asset (logo, favicon, banner) for the public asset route (X2.13). Only the
 * published key is ever read: a draft upload is invisible here until it is published. The organization comes from the
 * caller (the resolved host), never from a parameter, and a stored key outside {@code org/{orgId}/branding/} is refused.
 */
@Service
public class OrgBrandingAssets {

    /** A published asset's bytes, type and a strong validator (the key already carries a content hash). */
    public record Asset(byte[] content, String contentType, String etag) {}

    private final OrgBrandingRepository brandings;
    private final FileStorage storage;

    public OrgBrandingAssets(OrgBrandingRepository brandings, FileStorage storage) {
        this.brandings = brandings;
        this.storage = storage;
    }

    /** The storage key of the published asset, empty when the kind is unknown, unpublished or unset. */
    @Transactional(readOnly = true)
    public Optional<String> publishedKey(Long orgId, String kind) {
        if (orgId == null || !OrgStorageKeys.BRANDING_KINDS.contains(kind)) return Optional.empty();
        OrgBranding b = brandings.findByOrgId(orgId).filter(x -> x.getPublishedAt() != null).orElse(null);
        if (b == null) return Optional.empty();
        String key = switch (kind) {
            case "logo" -> b.getLogoKey();
            case "favicon" -> b.getFaviconKey();
            default -> b.getLoginBannerKey();
        };
        return OrgStorageKeys.isBrandingKeyOf(orgId, key) ? Optional.of(key) : Optional.empty();
    }

    public static String etagOf(String key) {
        return "\"" + OrgStorageKeys.hashOf(key) + "\"";
    }

    public Optional<Asset> read(Long orgId, String kind) {
        Optional<String> key = publishedKey(orgId, kind);
        if (key.isEmpty()) return Optional.empty();
        try {
            FileStorage.StoredFile f = storage.load(key.get());
            return Optional.of(new Asset(f.content(), contentTypeOf(key.get()), etagOf(key.get())));
        } catch (StorageObjectNotFoundException e) {
            return Optional.empty();
        }
    }

    /** Raster types only; the extension decides (never the stored header), anything else is an opaque download. */
    static String contentTypeOf(String key) {
        String k = key.toLowerCase(Locale.ROOT);
        if (k.endsWith(".png")) return "image/png";
        if (k.endsWith(".jpg") || k.endsWith(".jpeg")) return "image/jpeg";
        if (k.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }
}
