package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * "This administrator hid this dashboard alert until then" (X2.4, 14-organization-administration.md section 2.3). One row per
 * (organization, member, key); dismissing again moves {@code untilAt}. Per member on purpose: another administrator still sees it.
 */
@Entity
@Table(name = "org_member_dismissal")
@IdClass(OrgMemberDismissal.Pk.class)
public class OrgMemberDismissal implements Serializable {

    private static final long serialVersionUID = 1L;

    public static class Pk implements Serializable {

        private static final long serialVersionUID = 1L;
        private Long orgId;
        private Long memberId;
        private String alertKey;

        public Pk() {}

        public Pk(Long orgId, Long memberId, String alertKey) {
            this.orgId = orgId;
            this.memberId = memberId;
            this.alertKey = alertKey;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Pk p && Objects.equals(orgId, p.orgId) && Objects.equals(memberId, p.memberId) && Objects.equals(alertKey, p.alertKey);
        }

        @Override
        public int hashCode() {
            return Objects.hash(orgId, memberId, alertKey);
        }
    }

    @Id
    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Id
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Id
    @Column(name = "dismissal_key", length = 60, nullable = false)
    private String alertKey;

    @Column(name = "until_at", nullable = false)
    private Instant untilAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public OrgMemberDismissal() {}

    public OrgMemberDismissal(Long orgId, Long memberId, String alertKey, Instant untilAt) {
        this.orgId = orgId;
        this.memberId = memberId;
        this.alertKey = alertKey;
        this.untilAt = untilAt;
    }

    public Long getOrgId() { return orgId; }
    public Long getMemberId() { return memberId; }
    public String getAlertKey() { return alertKey; }
    public Instant getUntilAt() { return untilAt; }
    public void setUntilAt(Instant untilAt) { this.untilAt = untilAt; }
    public Instant getCreatedAt() { return createdAt; }
}
