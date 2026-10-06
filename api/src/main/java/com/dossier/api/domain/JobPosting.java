package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A fresh posting read from a {@link JobSource} (Phase 13.6a): first published within 48 hours when
 * read, kept for 7 days. Public data only — title, company, location, links, the description as
 * plain text. {@code dedupKey} hashes company + title + location so one job on two boards is kept
 * once. See the changelog.
 */
@Entity
@Table(name = "job_posting")
public class JobPosting implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_id", nullable = false)
    private JobSource source;

    @Column(name = "external_id", nullable = false, length = 100)
    private String externalId;

    @Column(name = "title", nullable = false, length = 300)
    private String title;

    @Column(name = "company", nullable = false, length = 200)
    private String company;

    @Column(name = "location", length = 300)
    private String location;

    /** REMOTE, HYBRID or ONSITE when the board says; null when it doesn't. */
    @Column(name = "workplace_type", length = 20)
    private String workplaceType;

    @Column(name = "remote")
    private Boolean remote;

    @Column(name = "employment_type", length = 40)
    private String employmentType;

    @Column(name = "department", length = 200)
    private String department;

    @Column(name = "url", nullable = false, length = 1000)
    private String url;

    @Column(name = "apply_url", length = 1000)
    private String applyUrl;

    @Lob
    @Column(name = "description_text")
    private String descriptionText;

    @Column(name = "published_at", nullable = false)
    private Instant publishedAt;

    @Column(name = "dedup_key", nullable = false, length = 64)
    private String dedupKey;

    @Column(name = "first_seen_at", nullable = false)
    private Instant firstSeenAt = Instant.now();

    public Long getId() {
        return id;
    }

    public JobSource getSource() {
        return source;
    }

    public void setSource(JobSource source) {
        this.source = source;
    }

    public String getExternalId() {
        return externalId;
    }

    public void setExternalId(String externalId) {
        this.externalId = externalId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getCompany() {
        return company;
    }

    public void setCompany(String company) {
        this.company = company;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getWorkplaceType() {
        return workplaceType;
    }

    public void setWorkplaceType(String workplaceType) {
        this.workplaceType = workplaceType;
    }

    public Boolean getRemote() {
        return remote;
    }

    public void setRemote(Boolean remote) {
        this.remote = remote;
    }

    public String getEmploymentType() {
        return employmentType;
    }

    public void setEmploymentType(String employmentType) {
        this.employmentType = employmentType;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getApplyUrl() {
        return applyUrl;
    }

    public void setApplyUrl(String applyUrl) {
        this.applyUrl = applyUrl;
    }

    public String getDescriptionText() {
        return descriptionText;
    }

    public void setDescriptionText(String descriptionText) {
        this.descriptionText = descriptionText;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public void setPublishedAt(Instant publishedAt) {
        this.publishedAt = publishedAt;
    }

    public String getDedupKey() {
        return dedupKey;
    }

    public void setDedupKey(String dedupKey) {
        this.dedupKey = dedupKey;
    }

    public Instant getFirstSeenAt() {
        return firstSeenAt;
    }
}
