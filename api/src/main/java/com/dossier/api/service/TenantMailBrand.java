package com.dossier.api.service;

/**
 * How an organization's account e-mails look: the accent colour (#rrggbb, null = the theme colour) and an absolute logo URL
 * (null = the Kiwiply logo). The artwork is fixed per theme. Built from the organization's published branding by
 * {@code AccountOnboardingNotices}; never from request input.
 */
public record TenantMailBrand(String brandHex, String logoUrl) {
    public static final TenantMailBrand KIWIPLY = new TenantMailBrand(null, null);
}
