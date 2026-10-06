package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import org.springframework.data.domain.Persistable;

/**
 * One autofill run, as counts (Phase 10.1). See the changelog for what is deliberately absent:
 * values, labels, hostnames and any link to a user.
 *
 * <p>{@link Persistable} because the id is assigned by the extension: without it Spring Data
 * would treat every save of an assigned id as a merge, and a retried insert would silently
 * overwrite instead of colliding — the same reason as {@link StripeEvent}.
 */
@Entity
@Table(name = "fill_event")
public class FillEvent implements Serializable, Persistable<String> {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", nullable = false, length = 36)
    private String id;

    @Column(name = "ats", nullable = false, length = 40)
    private String ats;

    @Column(name = "adapter", nullable = false, length = 40)
    private String adapter;

    @Column(name = "fields_found", nullable = false)
    private int fieldsFound;

    @Column(name = "fields_filled", nullable = false)
    private int fieldsFilled;

    @Column(name = "fields_failed", nullable = false)
    private int fieldsFailed;

    @Column(name = "required_left_empty", nullable = false)
    private int requiredLeftEmpty;

    @Column(name = "user_corrected", nullable = false)
    private int userCorrected;

    @Column(name = "ext_version", length = 20)
    private String extVersion;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Transient
    private boolean isNew = true;

    @Override
    public boolean isNew() {
        return isNew;
    }

    @PostLoad
    @PostPersist
    void markNotNew() {
        this.isNew = false;
    }

    @Override
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getAts() {
        return ats;
    }

    public void setAts(String ats) {
        this.ats = ats;
    }

    public String getAdapter() {
        return adapter;
    }

    public void setAdapter(String adapter) {
        this.adapter = adapter;
    }

    public int getFieldsFound() {
        return fieldsFound;
    }

    public void setFieldsFound(int fieldsFound) {
        this.fieldsFound = fieldsFound;
    }

    public int getFieldsFilled() {
        return fieldsFilled;
    }

    public void setFieldsFilled(int fieldsFilled) {
        this.fieldsFilled = fieldsFilled;
    }

    public int getFieldsFailed() {
        return fieldsFailed;
    }

    public void setFieldsFailed(int fieldsFailed) {
        this.fieldsFailed = fieldsFailed;
    }

    public int getRequiredLeftEmpty() {
        return requiredLeftEmpty;
    }

    public void setRequiredLeftEmpty(int requiredLeftEmpty) {
        this.requiredLeftEmpty = requiredLeftEmpty;
    }

    public int getUserCorrected() {
        return userCorrected;
    }

    public void setUserCorrected(int userCorrected) {
        this.userCorrected = userCorrected;
    }

    public String getExtVersion() {
        return extVersion;
    }

    public void setExtVersion(String extVersion) {
        this.extVersion = extVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
