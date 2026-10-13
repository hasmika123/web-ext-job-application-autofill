package com.dossier.api.service.storage;

import java.util.Set;

/**
 * Key scheme for files an ORGANIZATION owns (Enterprise V2, 04-tenancy-and-security.md section 4): everything lives under
 * {@code org/{orgId}/...}, so an org's files can be listed, exported and erased by prefix and never collide with the
 * per-user prefixes of {@link StorageKeys}. Branding assets are content-addressed: {@code org/{orgId}/branding/{kind}-{hash}.{ext}}.
 */
public final class OrgStorageKeys {

    public static final String ORG = "org";
    /** The three branding asset kinds. */
    public static final Set<String> BRANDING_KINDS = Set.of("logo", "favicon", "banner");

    private OrgStorageKeys() {}

    public static String orgPrefix(Long orgId) {
        return ORG + "/" + orgId + "/";
    }

    public static String brandingPrefix(Long orgId) {
        return orgPrefix(orgId) + "branding/";
    }

    /** {@code org/{orgId}/branding/{kind}-{hash}.{ext}}; {@code hash} is the first 12 hex chars of the SHA-256 of the stored bytes. */
    public static String brandingKey(Long orgId, String kind, String hash, String ext) {
        if (!BRANDING_KINDS.contains(kind)) throw new IllegalArgumentException("unknown branding asset kind");
        return brandingPrefix(orgId) + kind + "-" + hash + "." + ext;
    }

    /** True when {@code key} is a branding object of this organization (a stored key is never trusted to name another org's file). */
    public static boolean isBrandingKeyOf(Long orgId, String key) {
        return key != null && key.startsWith(brandingPrefix(orgId)) && !key.contains("..");
    }

    /** The content hash inside a branding key ({@code kind-HASH.ext}), used as the ETag; the whole key when it has none. */
    public static String hashOf(String key) {
        String file = key.substring(key.lastIndexOf('/') + 1);
        int dash = file.indexOf('-');
        int dot = file.lastIndexOf('.');
        return dash > 0 && dot > dash ? file.substring(dash + 1, dot) : file;
    }
}
