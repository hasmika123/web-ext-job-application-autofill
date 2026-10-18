package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One row of the change log of an {@code org_resume} (Marketing Resumes page). Table {@code mkt_resume_event}; metadata only, never resume content. */
@Entity
@Table(name = "mkt_resume_event")
public class MktResumeEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String CREATED = "CREATED";
    public static final String UPDATED = "UPDATED";
    public static final String APPROVAL_REQUESTED = "APPROVAL_REQUESTED";
    public static final String APPROVED = "APPROVED";
    public static final String MARKED_FOR_UPDATE = "MARKED_FOR_UPDATE";
    /** MM-02: with org.resumes.manager_review on, the marketer sent the resume to a Marketing Manager before the consultant is asked; the manager's answer is one of the next two. */
    public static final String MANAGER_REVIEW_REQUESTED = "MANAGER_REVIEW_REQUESTED";
    public static final String MANAGER_REVIEWED = "MANAGER_REVIEWED";
    public static final String MANAGER_DECLINED = "MANAGER_DECLINED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "resume_id", nullable = false)
    private Long resumeId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "kind", length = 30, nullable = false)
    private String kind;

    @Column(name = "version_no")
    private Integer versionNo;

    @Column(name = "detail", length = 200)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getResumeId() { return resumeId; }
    public void setResumeId(Long resumeId) { this.resumeId = resumeId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public Integer getVersionNo() { return versionNo; }
    public void setVersionNo(Integer versionNo) { this.versionNo = versionNo; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
