package com.dossier.api.service.ent.consultant;

import org.springframework.stereotype.Service;

/**
 * The single seam that decides whether a consultant may use Prepare selected openings (docs/enterprise-v2/63 section 1). Today it answers allowed unless
 * the feature switch is off for the organization. A later subscription add-on plugs in HERE (and nowhere else); this class does not touch subscription code.
 */
@Service
public class PrepareBatchEntitlement {

    /** The answer. {@code reason} is a stable code for a refusal ({@code FEATURE_OFF}) and null when allowed. */
    public record Decision(boolean allowed, String reason) {
        public static final Decision ALLOWED = new Decision(true, null);
    }

    private final PrepareBatchSettings settings;

    public PrepareBatchEntitlement(PrepareBatchSettings settings) {
        this.settings = settings;
    }

    public Decision check(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return new Decision(false, "FEATURE_OFF");
        return settings.enabledFor(orgId) ? Decision.ALLOWED : new Decision(false, "FEATURE_OFF");
    }
}
