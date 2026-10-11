package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One runtime switch an admin can flip without a deploy (phase demo). A plain key/value row: the
 * key is the primary key, the value is always text (booleans are {@code "true"}/{@code "false"}).
 * See {@link com.dossier.api.service.AppSettingService} for the cached accessor.
 */
@Entity
@Table(name = "app_setting")
public class AppSetting implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "setting_key", length = 100, nullable = false)
    private String key;

    @Column(name = "setting_value", length = 1000)
    private String value;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    @Column(name = "updated_date")
    private Instant updatedDate;

    public AppSetting() {}

    public AppSetting(String key, String value, String updatedBy, Instant updatedDate) {
        this.key = key;
        this.value = value;
        this.updatedBy = updatedBy;
        this.updatedDate = updatedDate;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(String updatedBy) {
        this.updatedBy = updatedBy;
    }

    public Instant getUpdatedDate() {
        return updatedDate;
    }

    public void setUpdatedDate(Instant updatedDate) {
        this.updatedDate = updatedDate;
    }
}
