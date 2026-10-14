package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A required document of an employee, tracked by TYPE and STATUS only (PENDING / COMPLETED / VERIFIED). Never contents, numbers or files (E2). Table {@code hr_document_requirement}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "hr_document_requirement")
public class HrDocumentRequirement implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "doc_type", length = 30, nullable = false)
    private String docType;

    @Column(name = "label", length = 80, nullable = false)
    private String label;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "PENDING";

    @Column(name = "status_at")
    private Instant statusAt;

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
    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }
    public String getDocType() { return docType; }
    public void setDocType(String docType) { this.docType = docType; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getStatusAt() { return statusAt; }
    public void setStatusAt(Instant statusAt) { this.statusAt = statusAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
