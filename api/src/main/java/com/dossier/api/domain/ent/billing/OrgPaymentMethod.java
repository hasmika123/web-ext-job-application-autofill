package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** DISPLAY mirror of a Stripe payment method: brand + last4 + expiry month/year only. Never a card number; Stripe holds the card. Table {@code org_payment_method}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "org_payment_method")
public class OrgPaymentMethod implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 12, nullable = false)
    private String kind = "CARD";

    @Column(name = "brand", length = 20, nullable = false)
    private String brand;

    @Column(name = "last4", length = 4, nullable = false)
    private String last4;

    @Column(name = "exp_month", nullable = false)
    private Integer expMonth;

    @Column(name = "exp_year", nullable = false)
    private Integer expYear;

    @Column(name = "default_method", nullable = false)
    private Boolean defaultMethod = false;

    @Column(name = "status", length = 12, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "provider_ref", length = 80)
    private String providerRef;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }
    public String getLast4() { return last4; }
    public void setLast4(String last4) { this.last4 = last4; }
    public Integer getExpMonth() { return expMonth; }
    public void setExpMonth(Integer expMonth) { this.expMonth = expMonth; }
    public Integer getExpYear() { return expYear; }
    public void setExpYear(Integer expYear) { this.expYear = expYear; }
    public Boolean getDefaultMethod() { return defaultMethod; }
    public void setDefaultMethod(Boolean defaultMethod) { this.defaultMethod = defaultMethod; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getProviderRef() { return providerRef; }
    public void setProviderRef(String providerRef) { this.providerRef = providerRef; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
