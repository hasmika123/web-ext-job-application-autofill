package com.dossier.api.security;

/**
 * Which account world a sign-in (or password reset) on the current request's host belongs to (decision O4, docs/enterprise-v2/19).
 * {@code enforced} is false while separate accounts are off: the legacy lookups run untouched. When on, a TENANT host of a SEPARATE organization
 * is the enterprise world of that organization ({@code orgId}); every other host is the personal world ({@code orgId == null}).
 */
public record LoginWorld(boolean enforced, Long orgId) {
    public static final LoginWorld LEGACY = new LoginWorld(false, null);

    /** True when this is the enterprise world of one organization. */
    public boolean enterprise() {
        return enforced && orgId != null;
    }

    /** The throttle / cache key prefix of this world: {@code P} or {@code E<orgId>}. */
    public String key() {
        return orgId == null ? "P" : "E" + orgId;
    }
}
