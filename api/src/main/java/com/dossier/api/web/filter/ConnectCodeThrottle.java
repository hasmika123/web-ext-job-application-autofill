package com.dossier.api.web.filter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Rate limits of the extension connect code (decision O4, docs/enterprise-v2/19 section 6.3): minting is counted per ACCOUNT, the public exchange per
 * client address. Process-local like the other limiters. The exchange limit is generous on purpose: the web app calls it for every visitor, so the
 * API sees the web server's address unless the web forwards the client's (it does, as the last X-Forwarded-For hop); a code has 256 random bits, so
 * the limit is abuse control, not what keeps a code secret.
 */
@Component
public class ConnectCodeThrottle {

    private static final long WINDOW_MS = 5 * 60_000L;

    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(10 * 60_000L, WINDOW_MS);
    private final int mintLimit;
    private final int exchangeLimit;

    public ConnectCodeThrottle(
        @Value("${dossier.connect-code.mint-limit:10}") int mintLimit,
        @Value("${dossier.connect-code.exchange-limit:60}") int exchangeLimit
    ) {
        this.mintLimit = mintLimit;
        this.exchangeLimit = exchangeLimit;
    }

    /** Count one mint for an account; 0 when allowed, otherwise the seconds to wait. */
    public long hitMint(Long userId) {
        return limiter.retryAfterSeconds("mint " + userId, mintLimit, WINDOW_MS, System.currentTimeMillis());
    }

    /** Count one exchange from a client address; 0 when allowed, otherwise the seconds to wait. */
    public long hitExchange(String clientIp) {
        return limiter.retryAfterSeconds("exchange " + clientIp, exchangeLimit, WINDOW_MS, System.currentTimeMillis());
    }

    /** Forget every count (tests). */
    public void reset() {
        limiter.resetAll();
    }
}
