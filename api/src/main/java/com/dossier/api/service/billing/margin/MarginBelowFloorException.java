package com.dossier.api.service.billing.margin;

import java.util.List;

/**
 * 422 MARGIN_BELOW_FLOOR (or TIER_BELOW_FLOOR / PRESET_BELOW_INDIVIDUAL): the first failing row with its levers.
 * {@code overrideAllowed} is false when any failing row is a discount (nothing overrides those).
 */
public class MarginBelowFloorException extends RuntimeException {

    private final transient MarginCheck first;
    private final transient List<MarginCheck> failures;
    private final transient List<PresetFinding> presetFindings;
    private final boolean overrideAllowed;
    private final boolean reasonMissing;

    public MarginBelowFloorException(List<MarginCheck> failures, List<PresetFinding> presetFindings, boolean overrideAllowed, boolean reasonMissing) {
        super(describe(failures, presetFindings));
        this.failures = List.copyOf(failures);
        this.presetFindings = List.copyOf(presetFindings);
        this.first = failures.isEmpty() ? null : failures.get(0);
        this.overrideAllowed = overrideAllowed;
        this.reasonMissing = reasonMissing;
    }

    private static String describe(List<MarginCheck> failures, List<PresetFinding> presets) {
        if (!failures.isEmpty()) {
            MarginCheck c = failures.get(0);
            return c.code() + " " + c.featureKey() + " " + c.interval() + " " + c.currency() + " marginBp=" + c.marginBp() + " floorBp=" + c.floorBp();
        }
        return presets.isEmpty() ? "MARGIN_BELOW_FLOOR" : presets.get(0).code() + " " + presets.get(0).presetKey();
    }

    public MarginCheck first() {
        return first;
    }

    public List<MarginCheck> failures() {
        return failures;
    }

    public List<PresetFinding> presetFindings() {
        return presetFindings;
    }

    public boolean overrideAllowed() {
        return overrideAllowed;
    }

    /** True when an override would have been allowed but no (long enough) reason was given. */
    public boolean reasonMissing() {
        return reasonMissing;
    }
}
