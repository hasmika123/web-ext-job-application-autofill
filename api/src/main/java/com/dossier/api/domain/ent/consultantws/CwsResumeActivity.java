package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One view, download or share of a consultant's own resume (Consultant workspace My Resumes). Table {@code cws_resume_activity}; only that consultant reads it. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "cws_resume_activity")
public class CwsResumeActivity implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String VIEWED = "VIEWED";
    public static final String DOWNLOADED = "DOWNLOADED";
    public static final String SHARED = "SHARED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "resume_id", nullable = false)
    private Long resumeId;

    @Column(name = "kind", length = 12, nullable = false)
    private String kind;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getResumeId() { return resumeId; }
    public void setResumeId(Long resumeId) { this.resumeId = resumeId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
