package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A marketer's saved filter set on the Submissions board ("Save View"). Table {@code mkt_submission_view}; private to its owner. */
@Entity
@Table(name = "mkt_submission_view")
public class MktSubmissionView implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "name", length = 60, nullable = false)
    private String name;

    @Column(name = "q", length = 120)
    private String q;

    @Column(name = "status_filter", length = 24)
    private String statusFilter;

    @Column(name = "approval_filter", length = 20)
    private String approvalFilter;

    @Column(name = "client_id")
    private Long clientId;

    @Column(name = "job_title", length = 200)
    private String jobTitle;

    @Column(name = "period", length = 8)
    private String period;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getQ() { return q; }
    public void setQ(String q) { this.q = q; }
    public String getStatusFilter() { return statusFilter; }
    public void setStatusFilter(String statusFilter) { this.statusFilter = statusFilter; }
    public String getApprovalFilter() { return approvalFilter; }
    public void setApprovalFilter(String approvalFilter) { this.approvalFilter = approvalFilter; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public String getJobTitle() { return jobTitle; }
    public void setJobTitle(String jobTitle) { this.jobTitle = jobTitle; }
    public String getPeriod() { return period; }
    public void setPeriod(String period) { this.period = period; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
