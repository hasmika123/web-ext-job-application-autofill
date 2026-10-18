package com.dossier.api.config;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Decides whether an {@code X-Kiwiply-Host} header may be believed (X1.3 hardening). The API is reachable directly
 * (api.kiwiply.com), so anybody could send that header. Only the web server may: it proves it by also sending the shared
 * secret {@code X-Kiwiply-Host-Secret} ({@code dossier.tenant-host.secret}, env {@code DOSSIER_TENANT_HOST_SECRET}, the same
 * value as the web container's). A request without the right secret is treated exactly like one with no host at all: a
 * legacy caller, no tenant, today's path-based behaviour; nothing downstream ever reads a tenant for it.
 *
 * <ul>
 *   <li>secret configured: the header must match (constant-time compare of SHA-256 digests); a repeated or wrong secret is a miss;</li>
 *   <li>secret blank and {@code require-secret=false} (dev / tests): the host is believed and one WARN says so when the
 *       enterprise flag is on;</li>
 *   <li>secret blank and {@code require-secret=true} (the prod profile): NO host is believed and one ERROR says why, so a
 *       forgotten secret fails closed to legacy behaviour instead of trusting strangers.</li>
 * </ul>
 */
public class TenantHostTrust {

    /** The header the web server sets next to {@code X-Kiwiply-Host}. */
    public static final String SECRET_HEADER = "X-Kiwiply-Host-Secret";

    private static final Logger LOG = LoggerFactory.getLogger(TenantHostTrust.class);

    private final byte[] secretDigest; // null when no secret is configured
    private final boolean requireSecret;
    private final AtomicBoolean warned = new AtomicBoolean();

    public TenantHostTrust(String secret, boolean requireSecret) {
        this.secretDigest = secret == null || secret.isBlank() ? null : sha256(secret.trim());
        this.requireSecret = requireSecret;
    }

    /** True when the request's forwarded host may be used to select a tenant. */
    public boolean trusts(HttpServletRequest request) {
        if (secretDigest == null) {
            if (warned.compareAndSet(false, true)) {
                if (requireSecret) LOG.error("dossier.tenant-host.secret is blank but required: X-Kiwiply-Host is ignored, so no tenant host resolves. Set DOSSIER_TENANT_HOST_SECRET on the api and web services.");
                else LOG.warn("dossier.tenant-host.secret is blank: X-Kiwiply-Host is believed from any caller (development only). Set DOSSIER_TENANT_HOST_SECRET before exposing the enterprise flag.");
            }
            return !requireSecret;
        }
        List<String> values = Collections.list(request.getHeaders(SECRET_HEADER));
        if (values.size() != 1) return false;
        return MessageDigest.isEqual(secretDigest, sha256(values.get(0).trim()));
    }

    private static byte[] sha256(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
