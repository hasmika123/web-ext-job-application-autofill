package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** The industry figure (percent) a rate is compared with on the Performance board. Table {@code mkt_benchmark}; one row per organization and metric. */
@Entity
@Table(name = "mkt_benchmark")
public class MktBenchmark implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String INTERVIEW_RATE = "INTERVIEW_RATE";
    public static final String OFFER_RATE = "OFFER_RATE";
    public static final String PLACEMENT_RATE = "PLACEMENT_RATE";
    public static final List<String> METRICS = List.of(INTERVIEW_RATE, OFFER_RATE, PLACEMENT_RATE);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "metric", length = 20, nullable = false)
    private String metric;

    @Column(name = "industry_value", precision = 5, scale = 2, nullable = false)
    private BigDecimal industryValue;

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
    public String getMetric() { return metric; }
    public void setMetric(String metric) { this.metric = metric; }
    public BigDecimal getIndustryValue() { return industryValue; }
    public void setIndustryValue(BigDecimal industryValue) { this.industryValue = industryValue; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
