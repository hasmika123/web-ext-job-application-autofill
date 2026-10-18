package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A member who receives a scheduled report (in-app / email to members only). Table {@code report_recipient}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "report_recipient")
public class ReportRecipient implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "definition_id", nullable = false)
    private Long definitionId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getDefinitionId() { return definitionId; }
    public void setDefinitionId(Long definitionId) { this.definitionId = definitionId; }
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
