package com.dossier.api.service.billing;

import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The billing self-check (stories B0.6 and K9.6; docs/subscriptions/README.md, runbook "Annual operations"): preconditions of a billing configuration that
 * are cheap to read and expensive to get wrong, reported as findings and logged once at start-up. It never changes anything and never throws.
 *
 * <p>Today: yearly billing on while the tax mode is undecided (S-09). The first yearly invoice is twelve times larger than a monthly one, so a tax surprise
 * is twelve times larger too; the warning stays until an administrator records the decision in {@code billing.tax.mode}.
 */
@Component
public class BillingSelfCheck {

    private static final Logger LOG = LoggerFactory.getLogger(BillingSelfCheck.class);

    public static final String ANNUAL_TAX_UNDECIDED = "ANNUAL_TAX_UNDECIDED";

    /** One finding: a stable code, WARN or INFO, and a sentence an operator can act on. */
    public record Finding(String code, String severity, String message) {}

    private final SettingsService settings;

    public BillingSelfCheck(SettingsService settings) {
        this.settings = settings;
    }

    public List<Finding> findings() {
        List<Finding> out = new ArrayList<>();
        try {
            boolean annual = settings.getBool(BillingSettingKeys.ANNUAL_ENABLED);
            String tax = settings.getString(BillingSettingKeys.TAX_MODE);
            if (annual && (tax == null || "UNDECIDED".equals(tax))) {
                out.add(
                    new Finding(
                        ANNUAL_TAX_UNDECIDED,
                        "WARN",
                        "Yearly billing is on but the tax mode is undecided (billing.tax.mode). Decide it (S-09) before the first yearly invoice; see the 'Annual operations' runbook."
                    )
                );
            }
        } catch (RuntimeException e) {
            LOG.debug("billing self-check could not read the settings: {}", e.toString());
        }
        return out;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logAtStartup() {
        for (Finding f : findings()) LOG.warn("billing self-check {}: {}", f.code(), f.message());
    }
}
