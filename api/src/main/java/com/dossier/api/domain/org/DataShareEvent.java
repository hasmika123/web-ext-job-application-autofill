package com.dossier.api.domain.org;

import com.dossier.api.domain.enumeration.ShareScope;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One change of a member's sharing scope (consent-data-sharing.md section 2): the accountability record that proves
 * what was consented to, when and under which text. Append-only, keyed by login strings (no foreign key to a person)
 * so it survives account erasure (GDPR Art. 7(1) and 17(3)(b)); it carries no profile data. The repository exposes no
 * update and no delete.
 */
@Entity
@Table(name = "data_share_event")
public class DataShareEvent implements Serializable {

    private static final long serialVersionUID = 1L;

    // actor
    public static final String ACTOR_MEMBER = "MEMBER";
    public static final String ACTOR_ORG_ADMIN = "ORG_ADMIN";
    public static final String ACTOR_SYSTEM = "SYSTEM";

    // reason
    public static final String REASON_JOIN = "JOIN";
    public static final String REASON_MEMBER_CHANGE = "MEMBER_CHANGE";
    public static final String REASON_MEMBER_LEFT = "MEMBER_LEFT";
    public static final String REASON_REMOVED = "REMOVED";
    public static final String REASON_PAIRING_ENDED = "PAIRING_ENDED";
    public static final String REASON_ERASED = "ERASED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_login", length = 50, nullable = false)
    private String memberLogin;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_scope", length = 10, nullable = false)
    private ShareScope fromScope;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_scope", length = 10, nullable = false)
    private ShareScope toScope;

    /** The person a FULL scope is (or was) shared with. */
    @Column(name = "full_to_login", length = 50)
    private String fullToLogin;

    @Column(name = "actor", length = 20, nullable = false)
    private String actor;

    @Column(name = "reason", length = 40, nullable = false)
    private String reason;

    @Column(name = "consent_version", length = 20, nullable = false)
    private String consentVersion;

    /** SHA-256 of the caller's address, never the address itself. */
    @Column(name = "ip_hash", length = 64, columnDefinition = "char(64)")
    private String ipHash;

    @Column(name = "user_agent_hash", length = 64, columnDefinition = "char(64)")
    private String userAgentHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getMemberLogin() { return memberLogin; }
    public void setMemberLogin(String memberLogin) { this.memberLogin = memberLogin; }
    public ShareScope getFromScope() { return fromScope; }
    public void setFromScope(ShareScope fromScope) { this.fromScope = fromScope; }
    public ShareScope getToScope() { return toScope; }
    public void setToScope(ShareScope toScope) { this.toScope = toScope; }
    public String getFullToLogin() { return fullToLogin; }
    public void setFullToLogin(String fullToLogin) { this.fullToLogin = fullToLogin; }
    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getConsentVersion() { return consentVersion; }
    public void setConsentVersion(String consentVersion) { this.consentVersion = consentVersion; }
    public String getIpHash() { return ipHash; }
    public void setIpHash(String ipHash) { this.ipHash = ipHash; }
    public String getUserAgentHash() { return userAgentHash; }
    public void setUserAgentHash(String userAgentHash) { this.userAgentHash = userAgentHash; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
