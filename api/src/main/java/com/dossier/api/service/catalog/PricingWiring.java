package com.dossier.api.service.catalog;

import com.dossier.api.service.billing.margin.MarginCalculator;
import com.dossier.api.service.billing.margin.MarginSettingsPort;
import com.dossier.api.service.pricing.CatalogPort;
import com.dossier.api.service.pricing.PricingEngine;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Makes the two pure classes of the subscription module injectable: the {@link PricingEngine} over the real {@link CatalogPort} and the {@link MarginCalculator}
 * over the settings registry ({@link MarginSettingsPort}). The classes themselves stay free of Spring and of repositories (PricingArchTest); this is the
 * only place that ties them to the catalog.
 */
@Configuration(proxyBeanMethods = false)
public class PricingWiring {

    @Bean
    public PricingEngine pricingEngine(CatalogPort catalog) {
        return new PricingEngine(catalog);
    }

    @Bean
    public MarginCalculator marginCalculator(MarginSettingsPort settings) {
        return new MarginCalculator(settings);
    }
}
