package com.dossier.api.service.ent.consultantws;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/** Wire shapes of the Consultant workspace Settings page (docs/enterprise-v2/page-consultant-settings.md). Nothing here is a secret: no password, token, key or phone number. */
public final class ConsultantSettingsDTO {

    private ConsultantSettingsDTO() {}

    /** Name, email and location come from the profile (read only here); there is no phone field because a phone number is never collected. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Account(String name, String email, String location) {}

    /** {@code percent} is consultant_profile.profile_completeness. */
    public record ProfileStatusTile(int percent, boolean complete) {}

    /** {@code level} is PERSONAL | SHARED | PRIVATE, derived from the stored settings; {@code orgName} is the organization named in "Visible to ... only". */
    public record PrivacyTile(String level, String orgName) {}

    /** Connections need the integrations module, which does not exist: connected is always what is stored (none) and available is the catalog size. */
    public record ConnectedToolsTile(int connected, int total) {}

    public record Tiles(ProfileStatusTile profileStatus, PrivacyTile privacy, ConnectedToolsTile connectedTools) {}

    /** What the consultant prefers, READ from the Profile tables (edited on the Profile page). Rates are minor units per hour, record only. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record CareerPreferences(
        List<String> employmentTypes,
        String workMode,
        List<String> targetRoles,
        List<String> locations,
        Long rateMinMinor,
        Long rateMaxMinor,
        String availabilityStatus
    ) {}

    /** One catalog row. {@code state} is always NOT_AVAILABLE until the integrations module exists. */
    public record Tool(String key, String name, String state) {}

    /** {@code isDefault} = no row stored yet, these are the defaults. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Settings(
        String profileVisibility,
        boolean shareProfileWithEmployers,
        boolean showContactInformation,
        boolean allowAnalytics,
        String theme,
        String language,
        String timezone,
        boolean isDefault,
        Instant updatedAt
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Documents(long resumes) {}

    /** {@code kind}: PRIVACY | APPEARANCE | PROFILE | AVAILABILITY. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Activity(String kind, String label, String detail, Instant at) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Response(
        long orgId,
        Instant generatedAt,
        String name,
        String orgName,
        Account account,
        Tiles tiles,
        CareerPreferences careerPreferences,
        Settings settings,
        List<Tool> tools,
        Documents documents,
        List<Activity> activity,
        List<String> languages
    ) {}

    /** Every field is optional: null keeps the stored value. */
    public record PrivacyRequest(String profileVisibility, Boolean shareProfileWithEmployers, Boolean showContactInformation, Boolean allowAnalytics) {}

    /** Every field is optional: null keeps the stored value. */
    public record AppearanceRequest(String theme, String language, String timezone) {}
}
