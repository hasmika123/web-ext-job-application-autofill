package com.dossier.api.service.settings;

import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.dossier.api.service.ai.AiSettingKeys;
import com.dossier.api.service.ai.AiTask;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The settings registry (ADMIN-E2E-PLAN 2.1, A5.1): the one closed list of every runtime setting an admin can see and
 * change, assembled from the three declaration sources - {@link ResumeBuilderSettingKeys} (resume builder, onboarding,
 * tracker, notifications, org), {@link AiSettingKeys} (the fixed AI keys plus the route and provider families for every
 * task and provider) and {@link AdminSettingKeys} (the platform keys). Each {@link Key} carries its type, default,
 * bounds, {@code area} and {@code risk}; unknown keys are refused, so admin changes values and never invents settings.
 *
 * <p>The open-ended {@code ai.price.<model>.*} family is not listed here (it has no fixed members); a stored price row
 * is listed by {@code SettingsService} and any price key resolves through {@link #find}.
 */
public final class SettingDefinitions {

    private static final List<Key> ALL;
    private static final Map<String, Key> BY_KEY;

    static {
        List<Key> all = new ArrayList<>(ResumeBuilderSettingKeys.all());
        all.addAll(AiSettingKeys.exactKeys());
        for (AiTask task : AiTask.values()) {
            for (String field : AiSettingKeys.ROUTE_FIELDS) all.add(AiSettingKeys.find(AiSettingKeys.routeKey(task, field)));
        }
        for (String provider : AiSettingKeys.PROVIDER_IDS) {
            for (String field : AiSettingKeys.PROVIDER_FIELDS) all.add(AiSettingKeys.find(AiSettingKeys.providerKey(provider, field)));
        }
        all.addAll(AdminSettingKeys.all());
        Map<String, Key> by = new LinkedHashMap<>();
        for (Key k : all) {
            if (by.put(k.key(), k) != null) throw new IllegalStateException("duplicate setting key " + k.key());
        }
        ALL = Collections.unmodifiableList(new ArrayList<>(by.values()));
        BY_KEY = Collections.unmodifiableMap(by);
    }

    private SettingDefinitions() {}

    /** Every declared setting, in declaration order (no price rows: that family is open-ended). */
    public static List<Key> all() {
        return ALL;
    }

    /** The declaration for {@code key} (an alias resolves to its canonical key; the price family resolves too); null when unknown. */
    public static Key find(String key) {
        if (key == null) return null;
        Key k = BY_KEY.get(ResumeBuilderSettingKeys.canonical(key));
        return k != null ? k : ResumeBuilderSettingKeys.find(key);
    }

    /** The type name the API reports: the declared type, or {@code FLAG} for a rollout flag / maintenance switch. */
    public static String typeName(Key k) {
        return isFlag(k) ? "FLAG" : k.type().name();
    }

    /** True for the JSON keys that hold a rollout flag {@code {on,pct,allow,deny}}. */
    public static boolean isFlag(Key k) {
        return k.type() == Type.JSON && (k.key().startsWith("flag.") || AdminSettingKeys.OPS_MAINTENANCE.equals(k.key()));
    }

    /**
     * The risk of writing {@code newValue} (the value that will be in effect afterwards) to {@code k}. AI keys follow
     * {@link AiSettingKeys#riskOf} so the Settings home and the AI page never disagree; a HIGH {@code *.enabled} kill
     * switch is HIGH only when it is turned OFF (turning one on is MEDIUM); every other key keeps its declared risk.
     */
    public static Risk riskOf(Key k, String newValue) {
        if (AiSettingKeys.find(k.key()) != null) return AiSettingKeys.riskOf(k.key(), newValue);
        if (isKillSwitch(k)) return newValue != null && "false".equalsIgnoreCase(newValue.trim()) ? Risk.HIGH : Risk.MEDIUM;
        return k.risk();
    }

    /** The risk the API reports for {@code k}: the worst case over the values it can take. */
    public static Risk declaredRisk(Key k) {
        if (AiSettingKeys.find(k.key()) != null) return AiSettingKeys.riskOf(k.key(), "false");
        return k.risk();
    }

    /**
     * When a write to {@code k} needs a reason: {@code "required"} (any value), {@code "when_off"} (a kill switch, only
     * when turned off) or {@code "optional"}.
     */
    public static String reasonRule(Key k) {
        boolean off = riskOf(k, "false") == Risk.HIGH;
        boolean on = riskOf(k, "true") == Risk.HIGH;
        if (off && on) return "required";
        return off ? "when_off" : "optional";
    }

    private static boolean isKillSwitch(Key k) {
        return k.risk() == Risk.HIGH && k.type() == Type.BOOL && k.key().endsWith(".enabled");
    }
}
