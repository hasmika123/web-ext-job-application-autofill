package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalTime;

/**
 * One user's notification switches (E2E-U7.0): which kinds notify in-app and by email ({@code matrixJson}),
 * quiet hours in the user's own time zone ({@code quietStart}/{@code quietEnd}, both null = none) and the IANA
 * {@code tz} they are read in. One row per user, keyed by the user's id and created on the first save. The digest
 * columns are reserved for the notification engine (U7.1). See the changelog.
 */
@Entity
@Table(name = "notification_preference")
public class NotificationPreference implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Lob
    @Column(name = "matrix_json", nullable = false)
    private String matrixJson;

    @Column(name = "quiet_start")
    private LocalTime quietStart;

    @Column(name = "quiet_end")
    private LocalTime quietEnd;

    @Column(name = "tz", nullable = false, length = 48)
    private String tz;

    @Column(name = "digest_hour", nullable = false)
    private int digestHour = 8;

    @Column(name = "digest_minute", nullable = false)
    private int digestMinute = 30;

    @Column(name = "email_digest", nullable = false, length = 8)
    private String emailDigest = "DAILY";

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getMatrixJson() {
        return matrixJson;
    }

    public void setMatrixJson(String matrixJson) {
        this.matrixJson = matrixJson;
    }

    public LocalTime getQuietStart() {
        return quietStart;
    }

    public void setQuietStart(LocalTime quietStart) {
        this.quietStart = quietStart;
    }

    public LocalTime getQuietEnd() {
        return quietEnd;
    }

    public void setQuietEnd(LocalTime quietEnd) {
        this.quietEnd = quietEnd;
    }

    public String getTz() {
        return tz;
    }

    public void setTz(String tz) {
        this.tz = tz;
    }

    public int getDigestHour() {
        return digestHour;
    }

    public int getDigestMinute() {
        return digestMinute;
    }

    public String getEmailDigest() {
        return emailDigest;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
