package com.dossier.api.service.dto.ent;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

/**
 * What an anonymous visitor of a tenant host may learn (04-tenancy-and-security.md section 2.4): the organization's display
 * name, its PUBLISHED branding, the sign-in options and the status. Never an id, a count, a setting or a member. On a
 * platform host only {@code kind} is present. The asset URLs are null until the branding-publish story issues signed,
 * short-lived URLs for the organization's logo, favicon and banner.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PublicTenantDTO(String kind, String displayName, Branding branding, Login login, String status) {

    public static PublicTenantDTO platform() {
        return new PublicTenantDTO("PLATFORM", null, null, null, null);
    }

    /** Published branding. Colours are {@code #rrggbb}; {@code theme} is LIGHT, DARK or SYSTEM; every field may be null. */
    public record Branding(
        String logoUrl,
        String faviconUrl,
        String bannerUrl,
        String primary,
        String secondary,
        String accent,
        String theme,
        String welcomeTitle,
        String welcomeMessage,
        Map<String, String> terminology
    ) {}

    /** The sign-in methods the login page offers on this host. */
    public record Login(boolean password, boolean google, boolean mfaRequired) {}
}
