package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One Stream Rule of an organization (Default Keywords, Client Mapping, Duplicate Detection, Auto-Publish). Table {@code mkt_stream_rule}, unique per (org, rule_key). */
@Entity
@Table(name = "mkt_stream_rule")
public class MktStreamRule implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String DEFAULT_KEYWORDS = "DEFAULT_KEYWORDS";
    public static final String CLIENT_MAPPING = "CLIENT_MAPPING";
    public static final String DUPLICATE_DETECTION = "DUPLICATE_DETECTION";
    public static final String AUTO_PUBLISH = "AUTO_PUBLISH";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "rule_key", length = 30, nullable = false)
    private String ruleKey;

    @Column(name = "value", columnDefinition = "text")
    private String value;

    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getRuleKey() { return ruleKey; }
    public void setRuleKey(String ruleKey) { this.ruleKey = ruleKey; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
