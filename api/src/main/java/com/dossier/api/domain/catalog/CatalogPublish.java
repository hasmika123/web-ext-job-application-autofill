package com.dossier.api.domain.catalog;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One catalog version (docs/subscriptions/08-data-model.md section 2.4): {@code id} IS the catalog_version, a monotonic integer that goes up by
 * exactly one with every publish. The row says what went live (price ids, service keys, plan version ids) and carries a hash of that snapshot.
 * Append-only; platform data, no org_id.
 */
@Entity
@Table(name = "catalog_publish")
public class CatalogPublish implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", nullable = false)
    private Integer id;

    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;

    @Column(name = "published_by", length = 50, nullable = false)
    private String publishedBy;

    @Column(name = "summary", length = 2000)
    private String summary;

    @Column(name = "price_ids_json", columnDefinition = "json")
    private String priceIdsJson;

    @Column(name = "feature_keys_json", columnDefinition = "json")
    private String featureKeysJson;

    @Column(name = "plan_version_ids_json", columnDefinition = "json")
    private String planVersionIdsJson;

    @Column(name = "snapshot_hash", length = 64, columnDefinition = "char(64)")
    private String snapshotHash;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant publishedAt) { this.publishedAt = publishedAt; }
    public String getPublishedBy() { return publishedBy; }
    public void setPublishedBy(String publishedBy) { this.publishedBy = publishedBy; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public String getPriceIdsJson() { return priceIdsJson; }
    public void setPriceIdsJson(String priceIdsJson) { this.priceIdsJson = priceIdsJson; }
    public String getFeatureKeysJson() { return featureKeysJson; }
    public void setFeatureKeysJson(String featureKeysJson) { this.featureKeysJson = featureKeysJson; }
    public String getPlanVersionIdsJson() { return planVersionIdsJson; }
    public void setPlanVersionIdsJson(String planVersionIdsJson) { this.planVersionIdsJson = planVersionIdsJson; }
    public String getSnapshotHash() { return snapshotHash; }
    public void setSnapshotHash(String snapshotHash) { this.snapshotHash = snapshotHash; }
}
