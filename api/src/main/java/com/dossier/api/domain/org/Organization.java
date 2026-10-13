package com.dossier.api.domain.org;

import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A tenant that buys for people (docs/design/org/tenant-model.md section 2.1). It never owns their data: a
 * member's resumes and applications stay under their own account. Never hard-deleted (CLOSED keeps billing
 * history). No sensitive personal data lives here: no tax id, no bank details; money is in the billing tables.
 */
@Entity
@Table(name = "organization")
public class Organization implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "slug", length = 60, nullable = false, unique = true)
    private String slug;

    @Column(name = "name", length = 120, nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", length = 20, nullable = false)
    private OrgType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private OrgStatus status = OrgStatus.DRAFT;

    @Column(name = "stripe_customer_id", length = 64, unique = true)
    private String stripeCustomerId;

    /** Written only by the billing webhook. */
    @Column(name = "setup_fee_paid_at")
    private Instant setupFeePaidAt;

    @Column(name = "billing_email", length = 254)
    private String billingEmail;

    @Column(name = "logo_key")
    private String logoKey;

    @Column(name = "website")
    private String website;

    @Column(name = "size_band", length = 20)
    private String sizeBand;

    @Column(name = "country", length = 2, columnDefinition = "char(2)")
    private String country;

    @Column(name = "timezone", length = 50, nullable = false)
    private String timezone = "UTC";

    /** The {@code OrgSettings} bag as JSON; validated by the service, never free-form. */
    @Column(name = "settings_json", columnDefinition = "json")
    private String settingsJson;

    /** Nullable: set to NULL when the creator erases their account (the org survives). */
    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "closed_at")
    private Instant closedAt;

    /**
     * Enterprise V2 (X1.2): the DNS label of {@code {subdomain}.kiwiply.com}, globally unique, null until an admin sets
     * one. Only meaningful while {@link #subdomainEnabled} is true; written through {@code OrgTenancyService}.
     */
    @Column(name = "subdomain", length = 63)
    private String subdomain;

    @Column(name = "subdomain_enabled", nullable = false)
    private boolean subdomainEnabled;

    /** Bumped by any hostname / branding / status write; the tenant-resolution cache is keyed on it (X1.3). */
    @Column(name = "config_version", nullable = false)
    private int configVersion;

    /** The brand name when it differs from the legal {@link #name}; null otherwise. */
    @Column(name = "display_name", length = 120)
    private String displayName;

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public OrgType getType() { return type; }
    public void setType(OrgType type) { this.type = type; }
    public OrgStatus getStatus() { return status; }
    public void setStatus(OrgStatus status) { this.status = status; }
    public String getStripeCustomerId() { return stripeCustomerId; }
    public void setStripeCustomerId(String stripeCustomerId) { this.stripeCustomerId = stripeCustomerId; }
    public Instant getSetupFeePaidAt() { return setupFeePaidAt; }
    public void setSetupFeePaidAt(Instant setupFeePaidAt) { this.setupFeePaidAt = setupFeePaidAt; }
    public String getBillingEmail() { return billingEmail; }
    public void setBillingEmail(String billingEmail) { this.billingEmail = billingEmail; }
    public String getLogoKey() { return logoKey; }
    public void setLogoKey(String logoKey) { this.logoKey = logoKey; }
    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
    public String getSizeBand() { return sizeBand; }
    public void setSizeBand(String sizeBand) { this.sizeBand = sizeBand; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
    public String getSettingsJson() { return settingsJson; }
    public void setSettingsJson(String settingsJson) { this.settingsJson = settingsJson; }
    public Long getCreatedByUserId() { return createdByUserId; }
    public void setCreatedByUserId(Long createdByUserId) { this.createdByUserId = createdByUserId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getClosedAt() { return closedAt; }
    public void setClosedAt(Instant closedAt) { this.closedAt = closedAt; }
    public String getSubdomain() { return subdomain; }
    public void setSubdomain(String subdomain) { this.subdomain = subdomain; }
    public boolean isSubdomainEnabled() { return subdomainEnabled; }
    public void setSubdomainEnabled(boolean subdomainEnabled) { this.subdomainEnabled = subdomainEnabled; }
    public int getConfigVersion() { return configVersion; }
    public void setConfigVersion(int configVersion) { this.configVersion = configVersion; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
}
