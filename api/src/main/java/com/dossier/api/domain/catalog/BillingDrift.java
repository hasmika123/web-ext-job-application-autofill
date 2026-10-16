package com.dossier.api.domain.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;

/**
 * What a nightly reconciler found that does not match: kind CATALOG (a Stripe price that differs from the catalog, a snapshot whose hash changed),
 * later PERSONAL / ORG / RETIREMENT from the stories that own those reconcilers. A row is an alert, never a repair: nothing here writes money.
 * An open row has no {@code resolvedAt}.
 */
@Entity
@Table(name = "billing_drift")
public class BillingDrift implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id")
    private Long orgId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind;

    @Column(name = "code", length = 40)
    private String code;

    @Column(name = "subject", length = 160)
    private String subject;

    @Column(name = "expected_json", columnDefinition = "json")
    private String expectedJson;

    @Column(name = "actual_json", columnDefinition = "json")
    private String actualJson;

    @Column(name = "detected_at", nullable = false)
    private Instant detectedAt = Instant.now();

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by", length = 50)
    private String resolvedBy;

    @Column(name = "note", length = 500)
    private String note;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }
    public String getExpectedJson() { return expectedJson; }
    public void setExpectedJson(String expectedJson) { this.expectedJson = expectedJson; }
    public String getActualJson() { return actualJson; }
    public void setActualJson(String actualJson) { this.actualJson = actualJson; }
    public Instant getDetectedAt() { return detectedAt; }
    public void setDetectedAt(Instant detectedAt) { this.detectedAt = detectedAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }
    public String getResolvedBy() { return resolvedBy; }
    public void setResolvedBy(String resolvedBy) { this.resolvedBy = resolvedBy; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
