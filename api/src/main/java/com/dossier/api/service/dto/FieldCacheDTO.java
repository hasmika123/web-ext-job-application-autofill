package com.dossier.api.service.dto;

import jakarta.persistence.Lob;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * A DTO for the {@link com.dossier.api.domain.FieldCache} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class FieldCacheDTO implements Serializable {

    private Long id;

    @NotNull
    @Size(max = 200)
    private String fieldKey;

    @NotNull
    @Size(max = 128)
    private String contextHash;

    @Lob
    private String value;

    @NotNull
    private Integer hitCount;

    @NotNull
    private Instant updatedAt;

    private UserDTO user;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getFieldKey() {
        return fieldKey;
    }

    public void setFieldKey(String fieldKey) {
        this.fieldKey = fieldKey;
    }

    public String getContextHash() {
        return contextHash;
    }

    public void setContextHash(String contextHash) {
        this.contextHash = contextHash;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public Integer getHitCount() {
        return hitCount;
    }

    public void setHitCount(Integer hitCount) {
        this.hitCount = hitCount;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public UserDTO getUser() {
        return user;
    }

    public void setUser(UserDTO user) {
        this.user = user;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof FieldCacheDTO)) {
            return false;
        }

        FieldCacheDTO fieldCacheDTO = (FieldCacheDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, fieldCacheDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "FieldCacheDTO{" +
            "id=" + getId() +
            ", fieldKey='" + getFieldKey() + "'" +
            ", contextHash='" + getContextHash() + "'" +
            ", value='" + getValue() + "'" +
            ", hitCount=" + getHitCount() +
            ", updatedAt='" + getUpdatedAt() + "'" +
            ", user=" + getUser() +
            "}";
    }
}
