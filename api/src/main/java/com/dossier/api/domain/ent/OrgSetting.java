package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A per-organization override of an allow-listed registry setting (03-domain-model.md section 2.1), for example
 * {@code org.invite.require_email_match}. Resolution is org override, then the global registry, then the code default;
 * only keys the service allow-lists can be written. One row per (organization, key).
 */
@Entity
@Table(name = "org_setting")
public class OrgSetting implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "setting_key", length = 100, nullable = false)
    private String settingKey;

    /** The value as JSON (a scalar or an object), validated by the registry key's own rules. */
    @Column(name = "value_json", columnDefinition = "json", nullable = false)
    private String valueJson;

    /** Login of whoever last changed it (a string, so it survives account erasure). */
    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getSettingKey() { return settingKey; }
    public void setSettingKey(String settingKey) { this.settingKey = settingKey; }
    public String getValueJson() { return valueJson; }
    public void setValueJson(String valueJson) { this.valueJson = valueJson; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
