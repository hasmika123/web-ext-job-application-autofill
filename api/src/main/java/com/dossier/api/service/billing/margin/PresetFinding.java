package com.dossier.api.service.billing.margin;

/** Preset above-individual result (docs/enterprise-v2/21 section 5). {@code hard}: refuse (a mirrored preset); otherwise a warning. */
public record PresetFinding(String presetKey, String code, long sumMinor, long requiredMinor, boolean hard) {}
