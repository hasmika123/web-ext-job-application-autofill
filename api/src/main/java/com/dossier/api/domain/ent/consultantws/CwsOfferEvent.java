package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One entry of an offer's timeline (table {@code cws_offer_event}): received, updated, negotiating, accepted or declined. */
@Entity
@Table(name = "cws_offer_event")
public class CwsOfferEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String RECEIVED = "RECEIVED";
    public static final String UPDATED = "UPDATED";
    public static final String NEGOTIATING = "NEGOTIATING";
    public static final String ACCEPTED = "ACCEPTED";
    public static final String DECLINED = "DECLINED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "offer_id", nullable = false)
    private Long offerId;

    @Column(name = "kind", length = 16, nullable = false)
    private String kind;

    @Column(name = "label", length = 120, nullable = false)
    private String label;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    public static CwsOfferEvent of(CwsOffer offer, String kind, String label, Instant at) {
        CwsOfferEvent e = new CwsOfferEvent();
        e.orgId = offer.getOrgId();
        e.consultantId = offer.getConsultantId();
        e.offerId = offer.getId();
        e.kind = kind;
        e.label = label;
        e.occurredAt = at;
        return e;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getOfferId() { return offerId; }
    public void setOfferId(Long offerId) { this.offerId = offerId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
