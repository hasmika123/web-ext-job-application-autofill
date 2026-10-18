package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;

/** Skills of a consultant; primary_skill marks the chips shown in the directory. Table {@code consultant_skill}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "consultant_skill")
public class ConsultantSkill implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "skill", length = 60, nullable = false)
    private String skill;

    @Column(name = "primary_skill", nullable = false)
    private boolean primarySkill = false;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getSkill() { return skill; }
    public void setSkill(String skill) { this.skill = skill; }
    public boolean isPrimarySkill() { return primarySkill; }
    public void setPrimarySkill(boolean primarySkill) { this.primarySkill = primarySkill; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
