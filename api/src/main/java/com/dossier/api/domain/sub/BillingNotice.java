package com.dossier.api.domain.sub;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * Every billing notice the system sent, one row per dedupe key (docs/subscriptions/11 section 4.1; story K10.3), so support can see what was said and when and a
 * rerun of the daily job is a no-op. Holds the subject and a small JSON of what was said, never a body with personal data beyond the plan name and dates.
 */
@Entity
@Table(name = "billing_notice")
public class BillingNotice implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "subscription_id")
    private Long subscriptionId;

    @Column(name = "retirement_id")
    private Long retirementId;

    @Column(name = "item_id")
    private Long itemId;

    @Column(name = "kind", length = 40, nullable = false)
    private String kind;

    @Column(name = "dedupe_key", length = 160, nullable = false)
    private String dedupeKey;

    @Column(name = "channels", length = 60)
    private String channels;

    @Column(name = "subject", length = 200)
    private String subject;

    @Column(name = "payload_json", columnDefinition = "json")
    private String payloadJson;

    @Column(name = "status", length = 12, nullable = false)
    private String status = "SENT";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Long subscriptionId) { this.subscriptionId = subscriptionId; }
    public Long getRetirementId() { return retirementId; }
    public void setRetirementId(Long retirementId) { this.retirementId = retirementId; }
    public Long getItemId() { return itemId; }
    public void setItemId(Long itemId) { this.itemId = itemId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getDedupeKey() { return dedupeKey; }
    public void setDedupeKey(String dedupeKey) { this.dedupeKey = dedupeKey; }
    public String getChannels() { return channels; }
    public void setChannels(String channels) { this.channels = channels; }
    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }
    public String getPayloadJson() { return payloadJson; }
    public void setPayloadJson(String payloadJson) { this.payloadJson = payloadJson; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
