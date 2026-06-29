package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;

/**
 * Per-user monthly AI-draft quota override (Phase 9.A2.2). One row per user (keyed by login)
 * whose monthly free quota differs from the global default ({@code dossier.ai.free-monthly-quota}).
 * Absence of a row means "use the global default". Set/cleared by admins (audited); read by
 * {@link com.dossier.api.service.AiDraftService} when metering a draft.
 */
@Entity
@Table(name = "ai_quota_override")
public class AiQuotaOverride implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "login", length = 50)
    private String login;

    @Column(name = "monthly_quota", nullable = false)
    private int monthlyQuota;

    public String getLogin() {
        return login;
    }

    public void setLogin(String login) {
        this.login = login;
    }

    public int getMonthlyQuota() {
        return monthlyQuota;
    }

    public void setMonthlyQuota(int monthlyQuota) {
        this.monthlyQuota = monthlyQuota;
    }
}
