package com.dossier.api.domain.catalog;

import jakarta.persistence.*;
import java.io.Serializable;

/** One admin-ranked replacement of a retiring plan or add-on (docs/subscriptions/11 section 5.1; story K10.2). Rank 1 is the preferred successor. */
@Entity
@Table(name = "plan_retirement_successor")
public class PlanRetirementSuccessor implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "retirement_id", nullable = false)
    private Long retirementId;

    @Column(name = "successor_plan_key", length = 40)
    private String successorPlanKey;

    @Column(name = "successor_feature_key", length = 60)
    private String successorFeatureKey;

    @Column(name = "successor_rank", nullable = false)
    private Integer rankNo;

    @Column(name = "note", length = 200)
    private String note;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getRetirementId() { return retirementId; }
    public void setRetirementId(Long retirementId) { this.retirementId = retirementId; }
    public String getSuccessorPlanKey() { return successorPlanKey; }
    public void setSuccessorPlanKey(String successorPlanKey) { this.successorPlanKey = successorPlanKey; }
    public String getSuccessorFeatureKey() { return successorFeatureKey; }
    public void setSuccessorFeatureKey(String successorFeatureKey) { this.successorFeatureKey = successorFeatureKey; }
    public Integer getRankNo() { return rankNo; }
    public void setRankNo(Integer rankNo) { this.rankNo = rankNo; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
