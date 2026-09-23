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

    /** A monthly AI budget in US cents (13.1b; it was a call count before). 0 = no server AI. */
    @Column(name = "monthly_budget_cents", nullable = false)
    private int monthlyBudgetCents;

    public String getLogin() {
        return login;
    }

    public void setLogin(String login) {
        this.login = login;
    }

    public int getMonthlyBudgetCents() {
        return monthlyBudgetCents;
    }

    public void setMonthlyBudgetCents(int monthlyBudgetCents) {
        this.monthlyBudgetCents = monthlyBudgetCents;
    }
}
