package com.dossier.api.domain.catalog;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One catalog write (docs/subscriptions/08-data-model.md section 2.4): the entity kind, its id, the state before and after as JSON, who did it
 * and why. Append-only: nothing updates or deletes a row. Table {@code catalog_change}; platform data, no org_id.
 */
@Entity
@Table(name = "catalog_change")
public class CatalogChange implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "entity", length = 30, nullable = false)
    private String entity;

    @Column(name = "entity_id", length = 80, nullable = false)
    private String entityId;

    @Column(name = "before_json", columnDefinition = "json")
    private String beforeJson;

    @Column(name = "after_json", columnDefinition = "json")
    private String afterJson;

    @Column(name = "actor_login", length = 50, nullable = false)
    private String actorLogin;

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getEntity() { return entity; }
    public void setEntity(String entity) { this.entity = entity; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getBeforeJson() { return beforeJson; }
    public void setBeforeJson(String beforeJson) { this.beforeJson = beforeJson; }
    public String getAfterJson() { return afterJson; }
    public void setAfterJson(String afterJson) { this.afterJson = afterJson; }
    public String getActorLogin() { return actorLogin; }
    public void setActorLogin(String actorLogin) { this.actorLogin = actorLogin; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
