package com.dossier.api.service.ai;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How server AI is spent (Phase 13.1b): which model each task uses, the monthly Pro budget, when to
 * fall back to a cheaper model, and which features are switched off. Bound under
 * {@code dossier.ai.policy.*}; every value is config so a model retirement or a cost spike is an
 * env change, not a release.
 *
 * <ul>
 *   <li><b>{@code models}</b> — task → model ({@code draft}, {@code pick}, {@code map},
 *       {@code enrich}, {@code parse}). A task with no entry uses {@code dossier.ai.model}.</li>
 *   <li><b>{@code pro-monthly-budget-usd}</b> — what one Pro user's AI may cost us in a calendar
 *       month (UTC). ≈ $5, deliberately far above real use: an abuse ceiling, not a product limit.</li>
 *   <li><b>{@code soft-cap-percent}</b> — past this share of the budget every task switches to
 *       {@code economy-model} (blank = no switch). At 100 % server AI stops until the month resets.</li>
 *   <li><b>{@code disabled-tasks}</b> — the per-feature kill switch: a listed task is answered
 *       "disabled" without calling anyone, e.g. {@code DOSSIER_AI_DISABLED_TASKS=enrich,pick}.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "dossier.ai.policy")
public class AiPolicy {

    private Map<String, String> models = new LinkedHashMap<>();
    private String economyModel = "";
    private double proMonthlyBudgetUsd = 5.0;
    private int softCapPercent = 80;
    private Set<String> disabledTasks = new LinkedHashSet<>();

    /** The model a task should use, before any budget downgrade; {@code fallback} when unset. */
    public String modelFor(AiTask task, String fallback) {
        String m = models.get(task.wire());
        return m == null || m.isBlank() ? fallback : m.trim();
    }

    public boolean isDisabled(AiTask task) {
        for (String t : disabledTasks) {
            if (t != null && t.trim().toLowerCase(Locale.ROOT).equals(task.wire())) return true;
        }
        return false;
    }

    /** The Pro budget in millionths of a dollar — the unit {@code ai_call.cost_micros} is kept in. */
    public long proBudgetMicros() {
        return Math.round(proMonthlyBudgetUsd * 1_000_000);
    }

    public boolean hasEconomyModel() {
        return economyModel != null && !economyModel.isBlank();
    }

    public Map<String, String> getModels() {
        return models;
    }

    public void setModels(Map<String, String> models) {
        this.models = models;
    }

    public String getEconomyModel() {
        return economyModel;
    }

    public void setEconomyModel(String economyModel) {
        this.economyModel = economyModel;
    }

    public double getProMonthlyBudgetUsd() {
        return proMonthlyBudgetUsd;
    }

    public void setProMonthlyBudgetUsd(double proMonthlyBudgetUsd) {
        this.proMonthlyBudgetUsd = proMonthlyBudgetUsd;
    }

    public int getSoftCapPercent() {
        return softCapPercent;
    }

    public void setSoftCapPercent(int softCapPercent) {
        this.softCapPercent = softCapPercent;
    }

    public Set<String> getDisabledTasks() {
        return disabledTasks;
    }

    public void setDisabledTasks(Set<String> disabledTasks) {
        this.disabledTasks = disabledTasks;
    }
}
