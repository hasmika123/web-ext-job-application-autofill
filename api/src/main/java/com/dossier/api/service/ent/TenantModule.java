package com.dossier.api.service.ent;

import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Arrays;
import java.util.Optional;

/**
 * The eight modules {@code GET /api/me/tenant} reports (12-identity.md section 3, 09 row 2), each backed by one
 * {@code flag.enterprise.*} sub-flag. {@link #wire()} is the JSON key and the value of a workspace nav item's {@code module}.
 */
public enum TenantModule {
    DOMAINS("domains", EnterpriseSettingKeys.FLAG_DOMAINS),
    ROLES("roles", EnterpriseSettingKeys.FLAG_ROLES),
    BILLING("billing", EnterpriseSettingKeys.FLAG_BILLING),
    MARKETING("marketing", EnterpriseSettingKeys.FLAG_MARKETING),
    HR_FINANCE("hrFinance", EnterpriseSettingKeys.FLAG_HR_FINANCE),
    EXTENSION_WORKSPACES("extensionWorkspaces", EnterpriseSettingKeys.FLAG_EXTENSION_WORKSPACES),
    INTEGRATIONS("integrations", EnterpriseSettingKeys.FLAG_INTEGRATIONS),
    ANALYTICS("analytics", EnterpriseSettingKeys.FLAG_ANALYTICS);

    private final String wire;
    private final String flagKey;

    TenantModule(String wire, String flagKey) {
        this.wire = wire;
        this.flagKey = flagKey;
    }

    public String wire() {
        return wire;
    }

    public String flagKey() {
        return flagKey;
    }

    public static Optional<TenantModule> ofWire(String wire) {
        return Arrays.stream(values()).filter(m -> m.wire.equals(wire)).findFirst();
    }
}
