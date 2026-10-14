package com.dossier.api.service;

/**
 * How an organization's account e-mails look: the accent colour (#rrggbb, null = the Kiwiply green), an absolute banner image
 * URL (null = a solid brand band) and an absolute logo URL (null = the organization name alone). Built from the organization's
 * published branding by {@code TenantMailBranding}; never from request input.
 */
public record TenantMailBrand(String brandHex, String bannerUrl, String logoUrl) {
    public static final TenantMailBrand KIWIPLY = new TenantMailBrand(null, null, null);
}
