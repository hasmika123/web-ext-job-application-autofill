package com.dossier.api.service.criteria;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import java.io.Serializable;
import java.util.Objects;
import java.util.Optional;
import org.springdoc.core.annotations.ParameterObject;
import tech.jhipster.service.Criteria;
import tech.jhipster.service.filter.*;

/**
 * Criteria class for the {@link com.dossier.api.domain.Application} entity. This class is used
 * in {@link com.dossier.api.web.rest.ApplicationResource} to receive all the possible filtering options from
 * the Http GET request parameters.
 * For example the following could be a valid request:
 * {@code /applications?id.greaterThan=5&attr1.contains=something&attr2.specified=false}
 * As Spring is unable to properly convert the types, unless specific {@link Filter} class are used, we need to use
 * fix type specific filters.
 */
@ParameterObject
@SuppressWarnings("common-java:DuplicatedBlocks")
public class ApplicationCriteria implements Serializable, Criteria {

    /**
     * Class for filtering ApplicationStatus
     */
    public static class ApplicationStatusFilter extends Filter<ApplicationStatus> {

        public ApplicationStatusFilter() {}

        public ApplicationStatusFilter(ApplicationStatusFilter filter) {
            super(filter);
        }

        @Override
        public ApplicationStatusFilter copy() {
            return new ApplicationStatusFilter(this);
        }
    }

    private static final long serialVersionUID = 1L;

    private LongFilter id;

    private StringFilter company;

    private StringFilter roleTitle;

    private StringFilter jobUrl;

    private StringFilter atsPlatform;

    private ApplicationStatusFilter status;

    private StringFilter source;

    private InstantFilter appliedAt;

    private InstantFilter createdAt;

    private InstantFilter updatedAt;

    private LongFilter userId;

    private LongFilter resumeId;

    private Boolean distinct;

    public ApplicationCriteria() {}

    public ApplicationCriteria(ApplicationCriteria other) {
        this.id = other.optionalId().map(LongFilter::copy).orElse(null);
        this.company = other.optionalCompany().map(StringFilter::copy).orElse(null);
        this.roleTitle = other.optionalRoleTitle().map(StringFilter::copy).orElse(null);
        this.jobUrl = other.optionalJobUrl().map(StringFilter::copy).orElse(null);
        this.atsPlatform = other.optionalAtsPlatform().map(StringFilter::copy).orElse(null);
        this.status = other.optionalStatus().map(ApplicationStatusFilter::copy).orElse(null);
        this.source = other.optionalSource().map(StringFilter::copy).orElse(null);
        this.appliedAt = other.optionalAppliedAt().map(InstantFilter::copy).orElse(null);
        this.createdAt = other.optionalCreatedAt().map(InstantFilter::copy).orElse(null);
        this.updatedAt = other.optionalUpdatedAt().map(InstantFilter::copy).orElse(null);
        this.userId = other.optionalUserId().map(LongFilter::copy).orElse(null);
        this.resumeId = other.optionalResumeId().map(LongFilter::copy).orElse(null);
        this.distinct = other.distinct;
    }

    @Override
    public ApplicationCriteria copy() {
        return new ApplicationCriteria(this);
    }

    public LongFilter getId() {
        return id;
    }

    public Optional<LongFilter> optionalId() {
        return Optional.ofNullable(id);
    }

    public LongFilter id() {
        if (id == null) {
            setId(new LongFilter());
        }
        return id;
    }

    public void setId(LongFilter id) {
        this.id = id;
    }

    public StringFilter getCompany() {
        return company;
    }

    public Optional<StringFilter> optionalCompany() {
        return Optional.ofNullable(company);
    }

    public StringFilter company() {
        if (company == null) {
            setCompany(new StringFilter());
        }
        return company;
    }

    public void setCompany(StringFilter company) {
        this.company = company;
    }

    public StringFilter getRoleTitle() {
        return roleTitle;
    }

    public Optional<StringFilter> optionalRoleTitle() {
        return Optional.ofNullable(roleTitle);
    }

    public StringFilter roleTitle() {
        if (roleTitle == null) {
            setRoleTitle(new StringFilter());
        }
        return roleTitle;
    }

    public void setRoleTitle(StringFilter roleTitle) {
        this.roleTitle = roleTitle;
    }

    public StringFilter getJobUrl() {
        return jobUrl;
    }

    public Optional<StringFilter> optionalJobUrl() {
        return Optional.ofNullable(jobUrl);
    }

    public StringFilter jobUrl() {
        if (jobUrl == null) {
            setJobUrl(new StringFilter());
        }
        return jobUrl;
    }

    public void setJobUrl(StringFilter jobUrl) {
        this.jobUrl = jobUrl;
    }

    public StringFilter getAtsPlatform() {
        return atsPlatform;
    }

    public Optional<StringFilter> optionalAtsPlatform() {
        return Optional.ofNullable(atsPlatform);
    }

    public StringFilter atsPlatform() {
        if (atsPlatform == null) {
            setAtsPlatform(new StringFilter());
        }
        return atsPlatform;
    }

    public void setAtsPlatform(StringFilter atsPlatform) {
        this.atsPlatform = atsPlatform;
    }

    public ApplicationStatusFilter getStatus() {
        return status;
    }

    public Optional<ApplicationStatusFilter> optionalStatus() {
        return Optional.ofNullable(status);
    }

    public ApplicationStatusFilter status() {
        if (status == null) {
            setStatus(new ApplicationStatusFilter());
        }
        return status;
    }

    public void setStatus(ApplicationStatusFilter status) {
        this.status = status;
    }

    public StringFilter getSource() {
        return source;
    }

    public Optional<StringFilter> optionalSource() {
        return Optional.ofNullable(source);
    }

    public StringFilter source() {
        if (source == null) {
            setSource(new StringFilter());
        }
        return source;
    }

    public void setSource(StringFilter source) {
        this.source = source;
    }

    public InstantFilter getAppliedAt() {
        return appliedAt;
    }

    public Optional<InstantFilter> optionalAppliedAt() {
        return Optional.ofNullable(appliedAt);
    }

    public InstantFilter appliedAt() {
        if (appliedAt == null) {
            setAppliedAt(new InstantFilter());
        }
        return appliedAt;
    }

    public void setAppliedAt(InstantFilter appliedAt) {
        this.appliedAt = appliedAt;
    }

    public InstantFilter getCreatedAt() {
        return createdAt;
    }

    public Optional<InstantFilter> optionalCreatedAt() {
        return Optional.ofNullable(createdAt);
    }

    public InstantFilter createdAt() {
        if (createdAt == null) {
            setCreatedAt(new InstantFilter());
        }
        return createdAt;
    }

    public void setCreatedAt(InstantFilter createdAt) {
        this.createdAt = createdAt;
    }

    public InstantFilter getUpdatedAt() {
        return updatedAt;
    }

    public Optional<InstantFilter> optionalUpdatedAt() {
        return Optional.ofNullable(updatedAt);
    }

    public InstantFilter updatedAt() {
        if (updatedAt == null) {
            setUpdatedAt(new InstantFilter());
        }
        return updatedAt;
    }

    public void setUpdatedAt(InstantFilter updatedAt) {
        this.updatedAt = updatedAt;
    }

    public LongFilter getUserId() {
        return userId;
    }

    public Optional<LongFilter> optionalUserId() {
        return Optional.ofNullable(userId);
    }

    public LongFilter userId() {
        if (userId == null) {
            setUserId(new LongFilter());
        }
        return userId;
    }

    public void setUserId(LongFilter userId) {
        this.userId = userId;
    }

    public LongFilter getResumeId() {
        return resumeId;
    }

    public Optional<LongFilter> optionalResumeId() {
        return Optional.ofNullable(resumeId);
    }

    public LongFilter resumeId() {
        if (resumeId == null) {
            setResumeId(new LongFilter());
        }
        return resumeId;
    }

    public void setResumeId(LongFilter resumeId) {
        this.resumeId = resumeId;
    }

    public Boolean getDistinct() {
        return distinct;
    }

    public Optional<Boolean> optionalDistinct() {
        return Optional.ofNullable(distinct);
    }

    public Boolean distinct() {
        if (distinct == null) {
            setDistinct(true);
        }
        return distinct;
    }

    public void setDistinct(Boolean distinct) {
        this.distinct = distinct;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }
        final ApplicationCriteria that = (ApplicationCriteria) o;
        return (
            Objects.equals(id, that.id) &&
            Objects.equals(company, that.company) &&
            Objects.equals(roleTitle, that.roleTitle) &&
            Objects.equals(jobUrl, that.jobUrl) &&
            Objects.equals(atsPlatform, that.atsPlatform) &&
            Objects.equals(status, that.status) &&
            Objects.equals(source, that.source) &&
            Objects.equals(appliedAt, that.appliedAt) &&
            Objects.equals(createdAt, that.createdAt) &&
            Objects.equals(updatedAt, that.updatedAt) &&
            Objects.equals(userId, that.userId) &&
            Objects.equals(resumeId, that.resumeId) &&
            Objects.equals(distinct, that.distinct)
        );
    }

    @Override
    public int hashCode() {
        return Objects.hash(
            id,
            company,
            roleTitle,
            jobUrl,
            atsPlatform,
            status,
            source,
            appliedAt,
            createdAt,
            updatedAt,
            userId,
            resumeId,
            distinct
        );
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "ApplicationCriteria{" +
            optionalId().map(f -> "id=" + f + ", ").orElse("") +
            optionalCompany().map(f -> "company=" + f + ", ").orElse("") +
            optionalRoleTitle().map(f -> "roleTitle=" + f + ", ").orElse("") +
            optionalJobUrl().map(f -> "jobUrl=" + f + ", ").orElse("") +
            optionalAtsPlatform().map(f -> "atsPlatform=" + f + ", ").orElse("") +
            optionalStatus().map(f -> "status=" + f + ", ").orElse("") +
            optionalSource().map(f -> "source=" + f + ", ").orElse("") +
            optionalAppliedAt().map(f -> "appliedAt=" + f + ", ").orElse("") +
            optionalCreatedAt().map(f -> "createdAt=" + f + ", ").orElse("") +
            optionalUpdatedAt().map(f -> "updatedAt=" + f + ", ").orElse("") +
            optionalUserId().map(f -> "userId=" + f + ", ").orElse("") +
            optionalResumeId().map(f -> "resumeId=" + f + ", ").orElse("") +
            optionalDistinct().map(f -> "distinct=" + f + ", ").orElse("") +
        "}";
    }
}
