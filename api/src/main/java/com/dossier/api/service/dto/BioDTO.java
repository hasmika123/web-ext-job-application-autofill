package com.dossier.api.service.dto;

import jakarta.persistence.Lob;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * A DTO for the {@link com.dossier.api.domain.Bio} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class BioDTO implements Serializable {

    private Long id;

    @Lob
    private String payload;

    @NotNull
    private Instant updatedAt;

    private UserDTO user;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPayload() {
        return payload;
    }

    public void setPayload(String payload) {
        this.payload = payload;
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
        if (!(o instanceof BioDTO)) {
            return false;
        }

        BioDTO bioDTO = (BioDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, bioDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "BioDTO{" +
            "id=" + getId() +
            ", payload='" + getPayload() + "'" +
            ", updatedAt='" + getUpdatedAt() + "'" +
            ", user=" + getUser() +
            "}";
    }
}
