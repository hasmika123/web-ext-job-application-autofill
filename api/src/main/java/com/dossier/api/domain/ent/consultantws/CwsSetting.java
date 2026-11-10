package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** The consultant's own workspace settings (privacy and appearance). Table {@code cws_setting}, one row per consultant; no row means the defaults. Never holds a password, token or phone number. */
@Entity
@Table(name = "cws_setting")
public class CwsSetting implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String ORG_ONLY = "ORG_ONLY";
    public static final String APPROVED_EMPLOYERS = "APPROVED_EMPLOYERS";
    public static final String PRIVATE = "PRIVATE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "profile_visibility", length = 20, nullable = false)
    private String profileVisibility = ORG_ONLY;

    @Column(name = "share_profile_with_employers", nullable = false)
    private boolean shareProfileWithEmployers = false;

    @Column(name = "show_contact_information", nullable = false)
    private boolean showContactInformation = false;

    @Column(name = "allow_analytics", nullable = false)
    private boolean allowAnalytics = false;

    @Column(name = "theme", length = 10, nullable = false)
    private String theme = "SYSTEM";

    @Column(name = "language", length = 10, nullable = false)
    private String language = "en-US";

    @Column(name = "timezone", length = 60, nullable = false)
    private String timezone = "UTC";

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getProfileVisibility() { return profileVisibility; }
    public void setProfileVisibility(String profileVisibility) { this.profileVisibility = profileVisibility; }
    public boolean isShareProfileWithEmployers() { return shareProfileWithEmployers; }
    public void setShareProfileWithEmployers(boolean v) { this.shareProfileWithEmployers = v; }
    public boolean isShowContactInformation() { return showContactInformation; }
    public void setShowContactInformation(boolean v) { this.showContactInformation = v; }
    public boolean isAllowAnalytics() { return allowAnalytics; }
    public void setAllowAnalytics(boolean v) { this.allowAnalytics = v; }
    public String getTheme() { return theme; }
    public void setTheme(String theme) { this.theme = theme; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
