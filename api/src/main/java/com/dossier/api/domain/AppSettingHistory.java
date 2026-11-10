package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One change to a runtime setting (AI-ADMIN-CONFIG-DESIGN 3.1; the A5.1 settings-history DDL, verbatim):
 * which key, the value before and after, who, why and when. {@code oldValue} null = there was no row (the
 * value came from env/default); {@code newValue} null = the row was deleted (back to env/default). Never a
 * secret: no setting holds one.
 */
@Entity
@Table(name = "app_setting_history")
public class AppSettingHistory implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "setting_key", length = 100, nullable = false)
    private String key;

    @Column(name = "old_value", length = 1000)
    private String oldValue;

    @Column(name = "new_value", length = 1000)
    private String newValue;

    @Column(name = "actor_login", length = 50, nullable = false)
    private String actorLogin;

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "changed_at", nullable = false)
    private Instant changedAt = Instant.now();

    public AppSettingHistory() {}

    public AppSettingHistory(String key, String oldValue, String newValue, String actorLogin, String reason, Instant changedAt) {
        this.key = key;
        this.oldValue = oldValue;
        this.newValue = newValue;
        this.actorLogin = actorLogin;
        this.reason = reason;
        this.changedAt = changedAt;
    }

    public Long getId() {
        return id;
    }

    public String getKey() {
        return key;
    }

    public String getOldValue() {
        return oldValue;
    }

    public String getNewValue() {
        return newValue;
    }

    public String getActorLogin() {
        return actorLogin;
    }

    public String getReason() {
        return reason;
    }

    public Instant getChangedAt() {
        return changedAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AppSettingHistory)) return false;
        return id != null && id.equals(((AppSettingHistory) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
