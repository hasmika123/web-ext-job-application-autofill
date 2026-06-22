package com.dossier.api.service.dto;

import jakarta.persistence.Lob;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * A DTO for the {@link com.dossier.api.domain.AiAnswer} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AiAnswerDTO implements Serializable {

    private Long id;

    @NotNull
    @Size(max = 128)
    private String questionHash;

    @Lob
    private String answer;

    @Size(max = 100)
    private String model;

    private Integer tokens;

    @NotNull
    private Instant createdAt;

    private UserDTO user;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getQuestionHash() {
        return questionHash;
    }

    public void setQuestionHash(String questionHash) {
        this.questionHash = questionHash;
    }

    public String getAnswer() {
        return answer;
    }

    public void setAnswer(String answer) {
        this.answer = answer;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public Integer getTokens() {
        return tokens;
    }

    public void setTokens(Integer tokens) {
        this.tokens = tokens;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
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
        if (!(o instanceof AiAnswerDTO)) {
            return false;
        }

        AiAnswerDTO aiAnswerDTO = (AiAnswerDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, aiAnswerDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "AiAnswerDTO{" +
            "id=" + getId() +
            ", questionHash='" + getQuestionHash() + "'" +
            ", answer='" + getAnswer() + "'" +
            ", model='" + getModel() + "'" +
            ", tokens=" + getTokens() +
            ", createdAt='" + getCreatedAt() + "'" +
            ", user=" + getUser() +
            "}";
    }
}
