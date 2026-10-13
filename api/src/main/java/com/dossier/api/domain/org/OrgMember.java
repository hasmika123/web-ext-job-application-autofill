package com.dossier.api.domain.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One seat in an organization (tenant-model.md section 2.2): an invited email, or a person who joined.
 * {@code userId} is NULL while INVITED and again after account erasure. Two generated columns keep one live
 * row per email per org ({@code active_key}) and one live membership per user per org
 * ({@code active_user_key}); both are database-computed and read-only here. Nothing sensitive is stored:
 * a label such as "Cohort 2026-B" is free text shown to staff, never an identifier.
 */
@Entity
@Table(name = "org_member")
public class OrgMember implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "user_id")
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", length = 20, nullable = false)
    private OrgRole role;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private OrgMemberStatus status;

    /** Lower-cased; required while INVITED. */
    @Column(name = "invite_email", length = 254)
    private String inviteEmail;

    /** SHA-256 of the one-time invite token; the token itself only ever lives in the email or link. */
    @Column(name = "invite_token_hash", length = 64, columnDefinition = "char(64)", unique = true)
    private String inviteTokenHash;

    @Column(name = "invite_expires_at")
    private Instant inviteExpiresAt;

    @Column(name = "invited_by_member_id")
    private Long invitedByMemberId;

    /** The name the inviter typed beside the address; free text, never an identifier. */
    @Column(name = "invite_name", length = 80)
    private String inviteName;

    /** The paste / CSV import this seat was invited in (for "38 of 60 joined"). */
    @Column(name = "invite_batch_id")
    private Long inviteBatchId;

    /** When the invite email last went out (first send or a re-send): the per-org daily cap counts these. */
    @Column(name = "invite_sent_at")
    private Instant inviteSentAt;

    /** Re-sends in the current window (admin setting: at most N a week). */
    @Column(name = "invite_resend_count", nullable = false)
    private int inviteResendCount = 0;

    @Column(name = "invite_resend_window_at")
    private Instant inviteResendWindowAt;

    @Column(name = "display_label", length = 80)
    private String displayLabel;

    @Column(name = "group_id")
    private Long groupId;

    /** The STAFF member who looks after this person. */
    @Column(name = "support_owner_member_id")
    private Long supportOwnerMemberId;

    /** The member's primary role in {@code org_role} (Enterprise V2, X1.6); null until backfilled or written. {@code role} stays the legacy mirror. */
    @Column(name = "primary_role_id")
    private Long primaryRoleId;

    /** The role ids the inviter chose, a JSON array with the primary first (X1.15); null on invites sent before it. Re-validated at acceptance. */
    @Column(name = "invite_role_ids_json", length = 500)
    private String inviteRoleIdsJson;

    /** Placement carried by the invitation and kept on the seat (X1.15; X4 adds the employee screens over these columns). */
    @Column(name = "department_group_id")
    private Long departmentGroupId;

    @Column(name = "team_group_id")
    private Long teamGroupId;

    @Column(name = "manager_member_id")
    private Long managerMemberId;

    /** The inviter's optional personal note; plain text, never rendered as HTML. */
    @Column(name = "invite_message", length = 500)
    private String inviteMessage;

    /** EXPIRED or REVOKED once an invitation ended without being accepted (the seat is then REMOVED); null otherwise. */
    @Column(name = "invite_ended_reason", length = 16)
    private String inviteEndedReason;

    @Column(name = "invite_ended_at")
    private Instant inviteEndedAt;

    @Column(name = "joined_at")
    private Instant joinedAt;

    @Column(name = "left_at")
    private Instant leftAt;

    @Column(name = "active_key", insertable = false, updatable = false)
    private String activeKey;

    @Column(name = "active_user_key", insertable = false, updatable = false)
    private String activeUserKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

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
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public OrgRole getRole() { return role; }
    public void setRole(OrgRole role) { this.role = role; }
    public OrgMemberStatus getStatus() { return status; }
    public void setStatus(OrgMemberStatus status) { this.status = status; }
    public String getInviteEmail() { return inviteEmail; }
    public void setInviteEmail(String inviteEmail) { this.inviteEmail = inviteEmail; }
    public String getInviteTokenHash() { return inviteTokenHash; }
    public void setInviteTokenHash(String inviteTokenHash) { this.inviteTokenHash = inviteTokenHash; }
    public Instant getInviteExpiresAt() { return inviteExpiresAt; }
    public void setInviteExpiresAt(Instant inviteExpiresAt) { this.inviteExpiresAt = inviteExpiresAt; }
    public Long getInvitedByMemberId() { return invitedByMemberId; }
    public void setInvitedByMemberId(Long invitedByMemberId) { this.invitedByMemberId = invitedByMemberId; }
    public String getInviteName() { return inviteName; }
    public void setInviteName(String inviteName) { this.inviteName = inviteName; }
    public Long getInviteBatchId() { return inviteBatchId; }
    public void setInviteBatchId(Long inviteBatchId) { this.inviteBatchId = inviteBatchId; }
    public Instant getInviteSentAt() { return inviteSentAt; }
    public void setInviteSentAt(Instant inviteSentAt) { this.inviteSentAt = inviteSentAt; }
    public int getInviteResendCount() { return inviteResendCount; }
    public void setInviteResendCount(int inviteResendCount) { this.inviteResendCount = inviteResendCount; }
    public Instant getInviteResendWindowAt() { return inviteResendWindowAt; }
    public void setInviteResendWindowAt(Instant inviteResendWindowAt) { this.inviteResendWindowAt = inviteResendWindowAt; }
    public String getDisplayLabel() { return displayLabel; }
    public void setDisplayLabel(String displayLabel) { this.displayLabel = displayLabel; }
    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }
    public Long getPrimaryRoleId() { return primaryRoleId; }
    public void setPrimaryRoleId(Long primaryRoleId) { this.primaryRoleId = primaryRoleId; }
    public Long getSupportOwnerMemberId() { return supportOwnerMemberId; }
    public void setSupportOwnerMemberId(Long supportOwnerMemberId) { this.supportOwnerMemberId = supportOwnerMemberId; }
    public String getInviteRoleIdsJson() { return inviteRoleIdsJson; }
    public void setInviteRoleIdsJson(String inviteRoleIdsJson) { this.inviteRoleIdsJson = inviteRoleIdsJson; }
    public Long getDepartmentGroupId() { return departmentGroupId; }
    public void setDepartmentGroupId(Long departmentGroupId) { this.departmentGroupId = departmentGroupId; }
    public Long getTeamGroupId() { return teamGroupId; }
    public void setTeamGroupId(Long teamGroupId) { this.teamGroupId = teamGroupId; }
    public Long getManagerMemberId() { return managerMemberId; }
    public void setManagerMemberId(Long managerMemberId) { this.managerMemberId = managerMemberId; }
    public String getInviteMessage() { return inviteMessage; }
    public void setInviteMessage(String inviteMessage) { this.inviteMessage = inviteMessage; }
    public String getInviteEndedReason() { return inviteEndedReason; }
    public void setInviteEndedReason(String inviteEndedReason) { this.inviteEndedReason = inviteEndedReason; }
    public Instant getInviteEndedAt() { return inviteEndedAt; }
    public void setInviteEndedAt(Instant inviteEndedAt) { this.inviteEndedAt = inviteEndedAt; }
    public Instant getJoinedAt() { return joinedAt; }
    public void setJoinedAt(Instant joinedAt) { this.joinedAt = joinedAt; }
    public Instant getLeftAt() { return leftAt; }
    public void setLeftAt(Instant leftAt) { this.leftAt = leftAt; }

    /** Database-generated; null once the row is no longer live. */
    public String getActiveKey() { return activeKey; }

    /** Database-generated; null unless the row is an ACTIVE or SUSPENDED membership of a known user. */
    public String getActiveUserKey() { return activeUserKey; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
