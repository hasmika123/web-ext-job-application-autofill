package com.dossier.api.domain;

import com.dossier.api.domain.enumeration.ResumeStatus;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A Resume.
 */
@Entity
@Table(name = "resume")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Resume implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @NotNull
    @Size(max = 200)
    @Column(name = "label", length = 200, nullable = false)
    private String label;

    @NotNull
    @Size(max = 500)
    @Column(name = "r_2_object_key", length = 500, nullable = false)
    private String r2ObjectKey;

    @Lob
    @Column(name = "parsed_json")
    private String parsedJson;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ResumeStatus status;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    // Archived resumes are hidden from the active picker but kept so applied jobs
    // never lose their resume reference (see the resume-archive guard, Phase 3.5).
    @Column(name = "archived")
    private Boolean archived;

    @ManyToOne(fetch = FetchType.LAZY)
    private User user;

    // jhipster-needle-entity-add-field - JHipster will add fields here

    public Long getId() {
        return this.id;
    }

    public Resume id(Long id) {
        this.setId(id);
        return this;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getLabel() {
        return this.label;
    }

    public Resume label(String label) {
        this.setLabel(label);
        return this;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getr2ObjectKey() {
        return this.r2ObjectKey;
    }

    public Resume r2ObjectKey(String r2ObjectKey) {
        this.setr2ObjectKey(r2ObjectKey);
        return this;
    }

    public void setr2ObjectKey(String r2ObjectKey) {
        this.r2ObjectKey = r2ObjectKey;
    }

    public String getParsedJson() {
        return this.parsedJson;
    }

    public Resume parsedJson(String parsedJson) {
        this.setParsedJson(parsedJson);
        return this;
    }

    public void setParsedJson(String parsedJson) {
        this.parsedJson = parsedJson;
    }

    public ResumeStatus getStatus() {
        return this.status;
    }

    public Resume status(ResumeStatus status) {
        this.setStatus(status);
        return this;
    }

    public void setStatus(ResumeStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public Resume createdAt(Instant createdAt) {
        this.setCreatedAt(createdAt);
        return this;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Boolean getArchived() {
        return this.archived;
    }

    public Resume archived(Boolean archived) {
        this.setArchived(archived);
        return this;
    }

    public void setArchived(Boolean archived) {
        this.archived = archived;
    }

    public User getUser() {
        return this.user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public Resume user(User user) {
        this.setUser(user);
        return this;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Resume)) {
            return false;
        }
        return getId() != null && getId().equals(((Resume) o).getId());
    }

    @Override
    public int hashCode() {
        // see https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/
        return getClass().hashCode();
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "Resume{" +
            "id=" + getId() +
            ", label='" + getLabel() + "'" +
            ", r2ObjectKey='" + getr2ObjectKey() + "'" +
            ", parsedJson='" + getParsedJson() + "'" +
            ", status='" + getStatus() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            ", archived='" + getArchived() + "'" +
            "}";
    }
}
