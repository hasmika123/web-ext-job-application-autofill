package com.dossier.api.domain;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A Application.
 */
@Entity
@Table(name = "application")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Application implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @NotNull
    @Size(max = 200)
    @Column(name = "company", length = 200, nullable = false)
    private String company;

    @NotNull
    @Size(max = 200)
    @Column(name = "role_title", length = 200, nullable = false)
    private String roleTitle;

    @Size(max = 1000)
    @Column(name = "job_url", length = 1000)
    private String jobUrl;

    @Size(max = 100)
    @Column(name = "ats_platform", length = 100)
    private String atsPlatform;

    @Lob
    @Column(name = "job_description")
    private String jobDescription;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ApplicationStatus status;

    @Size(max = 100)
    @Column(name = "source", length = 100)
    private String source;

    @Column(name = "applied_at")
    private Instant appliedAt;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @NotNull
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JsonIgnoreProperties(value = { "user" }, allowSetters = true)
    private Resume resume;

    // jhipster-needle-entity-add-field - JHipster will add fields here

    public Long getId() {
        return this.id;
    }

    public Application id(Long id) {
        this.setId(id);
        return this;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCompany() {
        return this.company;
    }

    public Application company(String company) {
        this.setCompany(company);
        return this;
    }

    public void setCompany(String company) {
        this.company = company;
    }

    public String getRoleTitle() {
        return this.roleTitle;
    }

    public Application roleTitle(String roleTitle) {
        this.setRoleTitle(roleTitle);
        return this;
    }

    public void setRoleTitle(String roleTitle) {
        this.roleTitle = roleTitle;
    }

    public String getJobUrl() {
        return this.jobUrl;
    }

    public Application jobUrl(String jobUrl) {
        this.setJobUrl(jobUrl);
        return this;
    }

    public void setJobUrl(String jobUrl) {
        this.jobUrl = jobUrl;
    }

    public String getAtsPlatform() {
        return this.atsPlatform;
    }

    public Application atsPlatform(String atsPlatform) {
        this.setAtsPlatform(atsPlatform);
        return this;
    }

    public void setAtsPlatform(String atsPlatform) {
        this.atsPlatform = atsPlatform;
    }

    public String getJobDescription() {
        return this.jobDescription;
    }

    public Application jobDescription(String jobDescription) {
        this.setJobDescription(jobDescription);
        return this;
    }

    public void setJobDescription(String jobDescription) {
        this.jobDescription = jobDescription;
    }

    public ApplicationStatus getStatus() {
        return this.status;
    }

    public Application status(ApplicationStatus status) {
        this.setStatus(status);
        return this;
    }

    public void setStatus(ApplicationStatus status) {
        this.status = status;
    }

    public String getSource() {
        return this.source;
    }

    public Application source(String source) {
        this.setSource(source);
        return this;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Instant getAppliedAt() {
        return this.appliedAt;
    }

    public Application appliedAt(Instant appliedAt) {
        this.setAppliedAt(appliedAt);
        return this;
    }

    public void setAppliedAt(Instant appliedAt) {
        this.appliedAt = appliedAt;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public Application createdAt(Instant createdAt) {
        this.setCreatedAt(createdAt);
        return this;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return this.updatedAt;
    }

    public Application updatedAt(Instant updatedAt) {
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

    public Application user(User user) {
        this.setUser(user);
        return this;
    }

    public Resume getResume() {
        return this.resume;
    }

    public void setResume(Resume resume) {
        this.resume = resume;
    }

    public Application resume(Resume resume) {
        this.setResume(resume);
        return this;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Application)) {
            return false;
        }
        return getId() != null && getId().equals(((Application) o).getId());
    }

    @Override
    public int hashCode() {
        // see https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/
        return getClass().hashCode();
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "Application{" +
            "id=" + getId() +
            ", company='" + getCompany() + "'" +
            ", roleTitle='" + getRoleTitle() + "'" +
            ", jobUrl='" + getJobUrl() + "'" +
            ", atsPlatform='" + getAtsPlatform() + "'" +
            ", jobDescription='" + getJobDescription() + "'" +
            ", status='" + getStatus() + "'" +
            ", source='" + getSource() + "'" +
            ", appliedAt='" + getAppliedAt() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            ", updatedAt='" + getUpdatedAt() + "'" +
            "}";
    }
}
