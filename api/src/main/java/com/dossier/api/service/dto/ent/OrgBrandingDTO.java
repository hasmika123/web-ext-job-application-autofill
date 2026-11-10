package com.dossier.api.service.dto.ent;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The branding admin view (X2.5): the PUBLISHED values, the DRAFT (a full object, equal to the published values until
 * something is edited), the draft's optimistic-lock counter and the version history. Maps use the same keys as the PATCH
 * body: primary, secondary, accent, theme, welcomeTitle, welcomeMessage, supportEmail, terminology, navPrefs and, for the
 * three assets, {@code logoHash} / {@code faviconHash} / {@code bannerHash} (the content hash: storage keys never leave the API).
 */
public record OrgBrandingDTO(
    Map<String, Object> published,
    Map<String, Object> draft,
    boolean hasDraft,
    int draftVersion,
    Instant draftUpdatedAt,
    Instant publishedAt,
    List<Version> versions
) {
    public record Version(int versionNo, Instant publishedAt, Long publishedByMemberId) {}

    /** The result of a publish: the new version and the keys that changed. */
    public record Published(int versionNo, List<String> changed, OrgBrandingDTO branding) {}

    /** Whether one colour can carry white text, with the nearest colour that can when it can not. */
    public record ColourCheck(String color, boolean valid, boolean allowsWhiteText, double contrastOnWhite, String suggestion) {}
}
