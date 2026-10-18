package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A member holding a role (03-domain-model.md section 2.1): many per member, exactly one live row marked primary (it decides
 * the landing workspace and mirrors into {@code org_member.role}). {@code endsAt} null = live; ended rows are kept as
 * history and free the slot (two generated unique keys make "one live row per member and role" and "one live primary per
 * member" database facts). The role may be a system template or an org role of the same organization: the service guards the
 * match, because the foreign key to {@code org_role} cannot.
 */
@Entity
@Table(name = "org_member_role")
public class OrgMemberRole implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "role_id", nullable = false)
    private Long roleId;

    @Column(name = "is_primary", nullable = false)
    private boolean primary;

    @Column(name = "granted_by_member_id")
    private Long grantedByMemberId;

    @Column(name = "granted_at", nullable = false)
    private Instant grantedAt = Instant.now();

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "active_role_key", insertable = false, updatable = false)
    private String activeRoleKey;

    @Column(name = "primary_member_key", insertable = false, updatable = false)
    private Long primaryMemberKey;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public Long getRoleId() { return roleId; }
    public void setRoleId(Long roleId) { this.roleId = roleId; }
    public boolean isPrimary() { return primary; }
    public void setPrimary(boolean primary) { this.primary = primary; }
    public Long getGrantedByMemberId() { return grantedByMemberId; }
    public void setGrantedByMemberId(Long grantedByMemberId) { this.grantedByMemberId = grantedByMemberId; }
    public Instant getGrantedAt() { return grantedAt; }
    public void setGrantedAt(Instant grantedAt) { this.grantedAt = grantedAt; }
    public Instant getEndsAt() { return endsAt; }
    public void setEndsAt(Instant endsAt) { this.endsAt = endsAt; }
    public String getActiveRoleKey() { return activeRoleKey; }
    public Long getPrimaryMemberKey() { return primaryMemberKey; }
}
