package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;

/**
 * Per-user monthly counter for the metered AI free tier (Phase 5.1). One row per
 * (login, period=YYYY-MM); {@code draftCount} is the number of server-side drafts used
 * this month, checked against {@code dossier.ai.free-monthly-quota}. Keyed by login
 * (no FK) — it's a lightweight usage meter, not part of the user's data graph.
 */
@Entity
@Table(name = "ai_usage")
public class AiUsage implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "login", length = 50, nullable = false)
    private String login;

    /** Calendar month as YYYY-MM (server clock). */
    @Column(name = "period", length = 7, nullable = false)
    private String period;

    @Column(name = "draft_count", nullable = false)
    private int draftCount;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getLogin() {
        return login;
    }

    public void setLogin(String login) {
        this.login = login;
    }

    public String getPeriod() {
        return period;
    }

    public void setPeriod(String period) {
        this.period = period;
    }

    public int getDraftCount() {
        return draftCount;
    }

    public void setDraftCount(int draftCount) {
        this.draftCount = draftCount;
    }
}
