package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** A certification the consultant lists on their career profile. Table {@code cws_certification}; only that consultant reads it. */
@Entity
@Table(name = "cws_certification")
public class CwsCertification implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "name", length = 160, nullable = false)
    private String name;

    @Column(name = "issuer", length = 120)
    private String issuer;

    /** First day of the month the certification was issued (the page shows month and year only). */
    @Column(name = "issued_on")
    private LocalDate issuedOn;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getIssuer() { return issuer; }
    public void setIssuer(String issuer) { this.issuer = issuer; }
    public LocalDate getIssuedOn() { return issuedOn; }
    public void setIssuedOn(LocalDate issuedOn) { this.issuedOn = issuedOn; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
