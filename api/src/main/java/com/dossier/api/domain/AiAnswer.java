package com.dossier.api.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A AiAnswer.
 */
@Entity
@Table(name = "ai_answer")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class AiAnswer implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @NotNull
    @Size(max = 128)
    @Column(name = "question_hash", length = 128, nullable = false)
    private String questionHash;

    @Lob
    @Column(name = "answer", nullable = false)
    private String answer;

    @Size(max = 100)
    @Column(name = "model", length = 100)
    private String model;

    @Column(name = "tokens")
    private Integer tokens;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    private User user;

    // jhipster-needle-entity-add-field - JHipster will add fields here

    public Long getId() {
        return this.id;
    }

    public AiAnswer id(Long id) {
        this.setId(id);
        return this;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getQuestionHash() {
        return this.questionHash;
    }

    public AiAnswer questionHash(String questionHash) {
        this.setQuestionHash(questionHash);
        return this;
    }

    public void setQuestionHash(String questionHash) {
        this.questionHash = questionHash;
    }

    public String getAnswer() {
        return this.answer;
    }

    public AiAnswer answer(String answer) {
        this.setAnswer(answer);
        return this;
    }

    public void setAnswer(String answer) {
        this.answer = answer;
    }

    public String getModel() {
        return this.model;
    }

    public AiAnswer model(String model) {
        this.setModel(model);
        return this;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public Integer getTokens() {
        return this.tokens;
    }

    public AiAnswer tokens(Integer tokens) {
        this.setTokens(tokens);
        return this;
    }

    public void setTokens(Integer tokens) {
        this.tokens = tokens;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public AiAnswer createdAt(Instant createdAt) {
        this.setCreatedAt(createdAt);
        return this;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public User getUser() {
        return this.user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public AiAnswer user(User user) {
        this.setUser(user);
        return this;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof AiAnswer)) {
            return false;
        }
        return getId() != null && getId().equals(((AiAnswer) o).getId());
    }

    @Override
    public int hashCode() {
        // see https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/
        return getClass().hashCode();
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "AiAnswer{" +
            "id=" + getId() +
            ", questionHash='" + getQuestionHash() + "'" +
            ", answer='" + getAnswer() + "'" +
            ", model='" + getModel() + "'" +
            ", tokens=" + getTokens() +
            ", createdAt='" + getCreatedAt() + "'" +
            "}";
    }
}
