package com.dossier.api.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A FieldCache.
 */
@Entity
@Table(name = "field_cache")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class FieldCache implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @NotNull
    @Size(max = 200)
    @Column(name = "field_key", length = 200, nullable = false)
    private String fieldKey;

    @NotNull
    @Size(max = 128)
    @Column(name = "context_hash", length = 128, nullable = false)
    private String contextHash;

    @Lob
    @Column(name = "value", nullable = false)
    private String value;

    @NotNull
    @Column(name = "hit_count", nullable = false)
    private Integer hitCount;

    @NotNull
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    private User user;

    // jhipster-needle-entity-add-field - JHipster will add fields here

    public Long getId() {
        return this.id;
    }

    public FieldCache id(Long id) {
        this.setId(id);
        return this;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getFieldKey() {
        return this.fieldKey;
    }

    public FieldCache fieldKey(String fieldKey) {
        this.setFieldKey(fieldKey);
        return this;
    }

    public void setFieldKey(String fieldKey) {
        this.fieldKey = fieldKey;
    }

    public String getContextHash() {
        return this.contextHash;
    }

    public FieldCache contextHash(String contextHash) {
        this.setContextHash(contextHash);
        return this;
    }

    public void setContextHash(String contextHash) {
        this.contextHash = contextHash;
    }

    public String getValue() {
        return this.value;
    }

    public FieldCache value(String value) {
        this.setValue(value);
        return this;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public Integer getHitCount() {
        return this.hitCount;
    }

    public FieldCache hitCount(Integer hitCount) {
        this.setHitCount(hitCount);
        return this;
    }

    public void setHitCount(Integer hitCount) {
        this.hitCount = hitCount;
    }

    public Instant getUpdatedAt() {
        return this.updatedAt;
    }

    public FieldCache updatedAt(Instant updatedAt) {
        this.setUpdatedAt(updatedAt);
        return this;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public User getUser() {
        return this.user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public FieldCache user(User user) {
        this.setUser(user);
        return this;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof FieldCache)) {
            return false;
        }
        return getId() != null && getId().equals(((FieldCache) o).getId());
    }

    @Override
    public int hashCode() {
        // see https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/
        return getClass().hashCode();
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "FieldCache{" +
            "id=" + getId() +
            ", fieldKey='" + getFieldKey() + "'" +
            ", contextHash='" + getContextHash() + "'" +
            ", value='" + getValue() + "'" +
            ", hitCount=" + getHitCount() +
            ", updatedAt='" + getUpdatedAt() + "'" +
            "}";
    }
}
