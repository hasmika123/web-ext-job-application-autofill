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

    public static final String DRAFTED = "DRAFTED";
    public static final String EXTENDED = "EXTENDED";
    public static final String WITHDRAWN = "WITHDRAWN";
    public static final String EXPIRED = "EXPIRED";
    public static final String HIRED = "HIRED";
    public static final String EDITED = "EDITED";

    /** Who acted: an org user, the consultant, or a job. */
    public static final String BY_MEMBER = "MEMBER";
    public static final String BY_CONSULTANT = "CONSULTANT";
    public static final String BY_SYSTEM = "SYSTEM";

    @Column(name = "actor_member_id")
    private Long actorMemberId;
    @Column(name = "actor_kind", length = 12, nullable = false)
    private String actorKind = BY_SYSTEM;
    @Column(name = "detail", length = 300)
    private String detail;

    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public String getActorKind() { return actorKind; }
    public void setActorKind(String actorKind) { this.actorKind = actorKind; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }

    /** The same event with who did it. */
    public CwsOfferEvent by(String kind, Long memberId, String detailLine) {
        this.actorKind = kind;
        this.actorMemberId = memberId;
        this.detail = detailLine == null ? null : detailLine.length() > 300 ? detailLine.substring(0, 300) : detailLine;
        return this;
    }

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
