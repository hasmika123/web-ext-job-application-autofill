package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One change made through the Settings page (feeds Recent Account Activity). Table {@code cws_setting_event}. */
@Entity
@Table(name = "cws_setting_event")
public class CwsSettingEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String PRIVACY = "PRIVACY";
    public static final String APPEARANCE = "APPEARANCE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "kind", length = 12, nullable = false)
    private String kind = PRIVACY;

    @Column(name = "label", length = 80, nullable = false)
    private String label;

    @Column(name = "detail", length = 160)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
