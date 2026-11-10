package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A client-side interviewer of an interview (name and job title as text; no contact details). Table {@code talent_interview_interviewer}; see docs/enterprise-v2/page-interviews.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "talent_interview_interviewer")
public class TalentInterviewInterviewer implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "interview_id", nullable = false)
    private Long interviewId;

    @Column(name = "name", length = 120, nullable = false)
    private String name;

    @Column(name = "title", length = 80)
    private String title;

    @Column(name = "primary_flag", nullable = false)
    private boolean primary;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getInterviewId() { return interviewId; }
    public void setInterviewId(Long interviewId) { this.interviewId = interviewId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public boolean isPrimary() { return primary; }
    public void setPrimary(boolean primary) { this.primary = primary; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
