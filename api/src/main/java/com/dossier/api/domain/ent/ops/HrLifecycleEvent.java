package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Append-only lifecycle timeline of an employee (hired, onboarding started/completed, leave, title or department change, offboarding). Table {@code hr_lifecycle_event}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "hr_lifecycle_event")
public class HrLifecycleEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "employee_id", nullable = false)
    private Long employeeId;

    @Column(name = "event_type", length = 30, nullable = false)
    private String eventType;

    @Column(name = "from_value", length = 60)
    private String fromValue;

    @Column(name = "to_value", length = 60)
    private String toValue;

    @Column(name = "detail", length = 200)
    private String detail;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getEmployeeId() { return employeeId; }
    public void setEmployeeId(Long employeeId) { this.employeeId = employeeId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getFromValue() { return fromValue; }
    public void setFromValue(String fromValue) { this.fromValue = fromValue; }
    public String getToValue() { return toValue; }
    public void setToValue(String toValue) { this.toValue = toValue; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
