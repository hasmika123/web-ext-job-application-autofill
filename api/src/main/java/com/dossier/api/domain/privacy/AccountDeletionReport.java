package com.dossier.api.domain.privacy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * The purge report of one erasure: proof it ran and what it removed, with NO identity in it. {@code subjectRef} is the former numeric account id (the
 * row it pointed to is gone); there is no login, e-mail or name anywhere on this row, and {@code steps} holds counts per kind of data only.
 */
@Entity
@Table(name = "account_deletion_report")
public class AccountDeletionReport {

    public static final String COMPLETE = "COMPLETE";
    /** The erasure ran but the verification pass found something left; an admin must look. */
    public static final String RESIDUE = "COMPLETE_WITH_RESIDUE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "subject_ref", nullable = false)
    private Long subjectRef;

    /** PERSONAL or ENTERPRISE. */
    @Column(name = "account_kind", length = 12, nullable = false)
    private String accountKind;

    @Column(name = "org_id")
    private Long orgId;

    /** SELF, ADMIN or IMMEDIATE (no undo window configured). */
    @Column(name = "source", length = 10, nullable = false)
    private String source;

    @Column(name = "status", length = 24, nullable = false)
    private String status;

    @Column(name = "requested_at")
    private Instant requestedAt;

    @Column(name = "executed_at", nullable = false)
    private Instant executedAt;

    @Column(name = "residue_count", nullable = false)
    private int residueCount;

    /** A small JSON object: kind of data to number of rows (or files) removed. */
    @Column(name = "steps", length = 4000)
    private String steps;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSubjectRef() { return subjectRef; }
    public void setSubjectRef(Long subjectRef) { this.subjectRef = subjectRef; }
    public String getAccountKind() { return accountKind; }
    public void setAccountKind(String accountKind) { this.accountKind = accountKind; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }
    public Instant getExecutedAt() { return executedAt; }
    public void setExecutedAt(Instant executedAt) { this.executedAt = executedAt; }
    public int getResidueCount() { return residueCount; }
    public void setResidueCount(int residueCount) { this.residueCount = residueCount; }
    public String getSteps() { return steps; }
    public void setSteps(String steps) { this.steps = steps; }
}
