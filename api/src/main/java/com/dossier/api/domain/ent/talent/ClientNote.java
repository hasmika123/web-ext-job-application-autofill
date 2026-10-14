package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A relationship note on a client account (who wrote what, when). Table {@code client_note} (changelog ent_clients). Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "client_note")
public class ClientNote implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "author_member_id")
    private Long authorMemberId;

    @Column(name = "body", length = 1000, nullable = false)
    private String body;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Long getAuthorMemberId() { return authorMemberId; }
    public void setAuthorMemberId(Long authorMemberId) { this.authorMemberId = authorMemberId; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
