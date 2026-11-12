package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * What one licence change will cost, shown before it is confirmed (docs/enterprise-v2/ORG-BILLING-BUILD.md step 1b, ADR-019). Table {@code license_quote}.
 * A quote is OPEN until it is confirmed (CONFIRMED) or its {@code expires_at} passes (it then reads as EXPIRED). Confirming re-prices the change from the
 * stored request and refuses it when the {@code inputs_hash} differs. Every query goes through an org-scoped repository method.
 */
@Entity
@Table(name = "license_quote")
public class LicenseQuote implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "status", length = 12, nullable = false)
    private String status = "OPEN";

    @Column(name = "request_json", length = 2000, nullable = false)
    private String requestJson;

    @Lob
    @Column(name = "lines_json", nullable = false)
    private String linesJson;

    @Column(name = "totals_json", length = 1000, nullable = false)
    private String totalsJson;

    @Column(name = "inputs_hash", length = 64, nullable = false)
    private String inputsHash;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getRequestJson() { return requestJson; }
    public void setRequestJson(String requestJson) { this.requestJson = requestJson; }
    public String getLinesJson() { return linesJson; }
    public void setLinesJson(String linesJson) { this.linesJson = linesJson; }
    public String getTotalsJson() { return totalsJson; }
    public void setTotalsJson(String totalsJson) { this.totalsJson = totalsJson; }
    public String getInputsHash() { return inputsHash; }
    public void setInputsHash(String inputsHash) { this.inputsHash = inputsHash; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getConfirmedAt() { return confirmedAt; }
    public void setConfirmedAt(Instant confirmedAt) { this.confirmedAt = confirmedAt; }
}
