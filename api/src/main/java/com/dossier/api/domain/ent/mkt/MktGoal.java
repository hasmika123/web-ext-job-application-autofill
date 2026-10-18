package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/**
 * A monthly target on the Performance board ("Goals Progress"). Table {@code mkt_goal}. {@code ownerMemberId} null is the organization's default; a
 * marketer's own row (owner = them) overrides it for that marketer only. It records a number the marketer chose; it never moves anything.
 */
@Entity
@Table(name = "mkt_goal")
public class MktGoal implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String SUBMISSIONS = "SUBMISSIONS";
    public static final String INTERVIEWS = "INTERVIEWS";
    public static final String OFFERS = "OFFERS";
    public static final String PLACEMENTS = "PLACEMENTS";
    public static final List<String> METRICS = List.of(SUBMISSIONS, INTERVIEWS, OFFERS, PLACEMENTS);
    public static final String MONTH = "MONTH";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "owner_member_id")
    private Long ownerMemberId;

    @Column(name = "metric", length = 20, nullable = false)
    private String metric;

    @Column(name = "period", length = 10, nullable = false)
    private String period = MONTH;

    @Column(name = "target", nullable = false)
    private Integer target;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

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
    public Long getOwnerMemberId() { return ownerMemberId; }
    public void setOwnerMemberId(Long ownerMemberId) { this.ownerMemberId = ownerMemberId; }
    public String getMetric() { return metric; }
    public void setMetric(String metric) { this.metric = metric; }
    public String getPeriod() { return period; }
    public void setPeriod(String period) { this.period = period; }
    public Integer getTarget() { return target; }
    public void setTarget(Integer target) { this.target = target; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
