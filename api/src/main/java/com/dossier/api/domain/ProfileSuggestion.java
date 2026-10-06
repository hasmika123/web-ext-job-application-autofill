package com.dossier.api.domain;

import com.dossier.api.domain.enumeration.SuggestionStatus;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A value the extension learned while the user applied, offered back as a suggested profile value
 * (Phase 10.3c, Tier C of the self-building profile). Never written to the profile until the user
 * accepts it on the web. See the changelog for why {@code lastContext} is an opaque hash.
 */
@Entity
@Table(name = "profile_suggestion")
public class ProfileSuggestion implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "field_key", nullable = false, length = 40)
    private String fieldKey;

    @Column(name = "jhi_value", nullable = false, length = 500)
    private String value;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 12)
    private SuggestionStatus status = SuggestionStatus.PENDING;

    @Column(name = "seen_count", nullable = false)
    private int seenCount = 1;

    @Column(name = "last_context", length = 64)
    private String lastContext;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getFieldKey() {
        return fieldKey;
    }

    public void setFieldKey(String fieldKey) {
        this.fieldKey = fieldKey;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public SuggestionStatus getStatus() {
        return status;
    }

    public void setStatus(SuggestionStatus status) {
        this.status = status;
    }

    public int getSeenCount() {
        return seenCount;
    }

    public void setSeenCount(int seenCount) {
        this.seenCount = seenCount;
    }

    public String getLastContext() {
        return lastContext;
    }

    public void setLastContext(String lastContext) {
        this.lastContext = lastContext;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ProfileSuggestion)) return false;
        return id != null && id.equals(((ProfileSuggestion) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
