package com.dossier.api.domain.ent;

import com.dossier.api.domain.enumeration.OrgBrandingTheme;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * An organization's portal branding (03-domain-model.md section 2.1): one row per organization, keyed by the
 * organization id. The published columns are what an anonymous visitor may see through {@code GET /api/public/tenant};
 * {@code draftJson} holds unpublished edits and never leaves the admin API. Colours are {@code #rrggbb}; contrast and
 * allow-listed keys are validated by the service that writes them. Asset keys point under {@code org/{orgId}/...}.
 */
@Entity
@Table(name = "org_branding")
public class OrgBranding implements Serializable {

    private static final long serialVersionUID = 1L;

    /** The organization's id (not generated: this row IS the organization's branding). */
    @Id
    @Column(name = "org_id")
    private Long orgId;

    @Column(name = "logo_key")
    private String logoKey;

    @Column(name = "favicon_key")
    private String faviconKey;

    @Column(name = "login_banner_key")
    private String loginBannerKey;

    @Column(name = "primary_color", length = 7, columnDefinition = "char(7)")
    private String primaryColor;

    @Column(name = "secondary_color", length = 7, columnDefinition = "char(7)")
    private String secondaryColor;

    @Column(name = "accent_color", length = 7, columnDefinition = "char(7)")
    private String accentColor;

    @Enumerated(EnumType.STRING)
    @Column(name = "theme", length = 10, nullable = false)
    private OrgBrandingTheme theme = OrgBrandingTheme.SYSTEM;

    @Column(name = "welcome_title", length = 120)
    private String welcomeTitle;

    @Column(name = "welcome_message", length = 500)
    private String welcomeMessage;

    /** Label overrides (allow-listed keys), as JSON. */
    @Column(name = "terminology_json", columnDefinition = "json")
    private String terminologyJson;

    /** Hidden / ordered navigation keys (allow-listed), as JSON. */
    @Column(name = "nav_prefs_json", columnDefinition = "json")
    private String navPrefsJson;

    /** Unpublished edits, as JSON. Never exposed publicly. */
    @Column(name = "draft_json", columnDefinition = "json")
    private String draftJson;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "updated_by_member_id")
    private Long updatedByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getLogoKey() { return logoKey; }
    public void setLogoKey(String logoKey) { this.logoKey = logoKey; }
    public String getFaviconKey() { return faviconKey; }
    public void setFaviconKey(String faviconKey) { this.faviconKey = faviconKey; }
    public String getLoginBannerKey() { return loginBannerKey; }
    public void setLoginBannerKey(String loginBannerKey) { this.loginBannerKey = loginBannerKey; }
    public String getPrimaryColor() { return primaryColor; }
    public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }
    public String getSecondaryColor() { return secondaryColor; }
    public void setSecondaryColor(String secondaryColor) { this.secondaryColor = secondaryColor; }
    public String getAccentColor() { return accentColor; }
    public void setAccentColor(String accentColor) { this.accentColor = accentColor; }
    public OrgBrandingTheme getTheme() { return theme; }
    public void setTheme(OrgBrandingTheme theme) { this.theme = theme; }
    public String getWelcomeTitle() { return welcomeTitle; }
    public void setWelcomeTitle(String welcomeTitle) { this.welcomeTitle = welcomeTitle; }
    public String getWelcomeMessage() { return welcomeMessage; }
    public void setWelcomeMessage(String welcomeMessage) { this.welcomeMessage = welcomeMessage; }
    public String getTerminologyJson() { return terminologyJson; }
    public void setTerminologyJson(String terminologyJson) { this.terminologyJson = terminologyJson; }
    public String getNavPrefsJson() { return navPrefsJson; }
    public void setNavPrefsJson(String navPrefsJson) { this.navPrefsJson = navPrefsJson; }
    public String getDraftJson() { return draftJson; }
    public void setDraftJson(String draftJson) { this.draftJson = draftJson; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant publishedAt) { this.publishedAt = publishedAt; }
    public Long getUpdatedByMemberId() { return updatedByMemberId; }
    public void setUpdatedByMemberId(Long updatedByMemberId) { this.updatedByMemberId = updatedByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
