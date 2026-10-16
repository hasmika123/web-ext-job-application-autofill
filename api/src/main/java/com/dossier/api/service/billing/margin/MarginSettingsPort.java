package com.dossier.api.service.billing.margin;

/** Where the calculator reads its settings from; the adapter (settings registry, K3.4) returns a fresh snapshot per call. */
@FunctionalInterface
public interface MarginSettingsPort {
    MarginSettings current();
}
