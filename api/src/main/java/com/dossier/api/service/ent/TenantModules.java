package com.dossier.api.service.ent;

import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Which of the eight modules are on for one organization (12-identity.md section 3, 09 row 2): the organization is in the
 * module's {@code flag.enterprise.*} allow-list (and the master flag is on). The second conjunct of the contract, the
 * {@code ModuleGate.isOn} of a module PRODUCT, does not exist until Phase 5; a module with no product is on exactly when its
 * flag is.
 *
 * <p>A flag that is still only declared (not yet offered in admin, {@link EnterpriseSettingKeys#deferred()}) can not have been
 * switched on by anyone, so it reads off without a settings lookup (and without a warning per request). Fails closed: an
 * unreadable flag is off, and the whole answer for a missing organization id is "everything off".
 */
@Service
public class TenantModules {

    private final EnterpriseFeatureFlag flag;

    public TenantModules(EnterpriseFeatureFlag flag) {
        this.flag = flag;
    }

    /** Every module, in contract order, true or false. Never null, never partial. */
    public Map<String, Boolean> forOrg(Long orgId) {
        Map<String, Boolean> out = new LinkedHashMap<>();
        for (TenantModule m : TenantModule.values()) out.put(m.wire(), isOn(m, orgId));
        return out;
    }

    public boolean isOn(TenantModule module, Long orgId) {
        if (module == null || orgId == null) return false;
        if (EnterpriseSettingKeys.find(module.flagKey()) == null) return false; // declared but not live yet: nobody can have turned it on
        return flag.isEnabled(module.flagKey(), orgId);
    }
}
