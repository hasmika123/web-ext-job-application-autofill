package com.dossier.api.domain.org;

import com.dossier.api.domain.enumeration.OrgRole;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A shareable join link / QR code for a cohort kickoff (tenant-model.md section 2.5). Redeeming one creates an
 * {@code org_member} with role MEMBER (the only role a code may carry); the admin can cap the uses and revoke it.
 */
@Entity
@Table(name = "org_join_code")
public class OrgJoinCode implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    /** Crockford base32, eight characters. */
    @Column(name = "code", length = 8, columnDefinition = "char(8)", nullable = false, unique = true)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", length = 20, nullable = false)
    private OrgRole role = OrgRole.MEMBER;

    @Column(name = "group_id")
    private Long groupId;

    @Column(name = "max_uses")
    private Integer maxUses;

    @Column(name = "uses", nullable = false)
    private int uses = 0;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public OrgRole getRole() { return role; }
    public void setRole(OrgRole role) { this.role = role; }
    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }
    public Integer getMaxUses() { return maxUses; }
    public void setMaxUses(Integer maxUses) { this.maxUses = maxUses; }
    public int getUses() { return uses; }
    public void setUses(int uses) { this.uses = uses; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Instant getRevokedAt() { return revokedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
