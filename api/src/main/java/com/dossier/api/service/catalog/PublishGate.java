package com.dossier.api.service.catalog;

import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import java.util.Map;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * Decisions P-15, W-6 and P-02 (answered 2026-10-16): before a plan or a price is published, billing has to be in a state where the publish means what it
 * says.
 *
 * <ul>
 *   <li>A LIVE Stripe key outside the production profile is refused: 422 {@code LIVE_KEY_NOT_ALLOWED}. Test mode is the only mode a QA, CI or local stack
 *       may create Stripe objects in. The setting below never lifts this.</li>
 *   <li>Stripe off (blank key) is refused: 503 {@code BILLING_DISABLED}, unless the admin setting {@code billing.publish.allow_without_stripe} is on
 *       (default false, HIGH risk, audited by the settings registry). A QA or local stack switches it on to publish without creating Stripe Prices.</li>
 * </ul>
 *
 * "Production" is the {@code prod} Spring profile, nothing else is named. Never reads the key beyond its mode prefix and never logs it.
 */
@Component
public class PublishGate {

    private final StripeGateway gateway;
    private final StripeProperties stripe;
    private final SettingsService settings;
    private final Environment env;

    public PublishGate(StripeGateway gateway, StripeProperties stripe, SettingsService settings, Environment env) {
        this.gateway = gateway;
        this.stripe = stripe;
        this.settings = settings;
        this.env = env;
    }

    /** Throws {@link CatalogException} when a publish must not go ahead. */
    public void requirePublishable() {
        if (gateway.isEnabled()) {
            if (stripe.isLiveKey() && !env.acceptsProfiles(Profiles.of("prod"))) {
                throw CatalogException.unprocessable(
                    "LIVE_KEY_NOT_ALLOWED",
                    "A live Stripe key is configured outside the production profile; publishing here would create real Stripe objects. Use a test-mode key.",
                    Map.of("rule", "live_key_outside_production")
                );
            }
            return;
        }
        if (!settings.getBool(BillingSettingKeys.PUBLISH_ALLOW_WITHOUT_STRIPE)) {
            throw new CatalogException(
                503,
                "BILLING_DISABLED",
                "Stripe is off (no key configured), so nothing can be published. Configure a test-mode key, or switch on the setting billing.publish.allow_without_stripe on a QA stack.",
                Map.of("setting", BillingSettingKeys.PUBLISH_ALLOW_WITHOUT_STRIPE)
            );
        }
    }
}
