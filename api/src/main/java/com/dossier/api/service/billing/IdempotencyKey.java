package com.dossier.api.service.billing;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * The idempotency key of one Stripe write (docs/subscriptions/07 s2, 26 s8). Stable across retries: the same
 * business operation always builds the same key (for example {@code co-42}, {@code sc-17-items}), so a retry
 * after a timeout replays the original result instead of charging twice. At most 255 characters, printable ASCII
 * without whitespace (Stripe's limit is 255).
 */
public record IdempotencyKey(String value) {
    public static final int MAX_LENGTH = 255;

    public IdempotencyKey {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("An idempotency key must not be blank");
        if (value.length() > MAX_LENGTH) throw new IllegalArgumentException("An idempotency key is at most " + MAX_LENGTH + " characters");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c <= 32 || c > 126) throw new IllegalArgumentException("An idempotency key is printable ASCII without spaces");
        }
    }

    /** Parts joined with {@code -}, e.g. {@code of("sc", batchId, "items")} gives {@code sc-17-items}. */
    public static IdempotencyKey of(Object... parts) {
        if (parts == null || parts.length == 0) throw new IllegalArgumentException("An idempotency key needs at least one part");
        return new IdempotencyKey(Arrays.stream(parts).map(String::valueOf).collect(Collectors.joining("-")));
    }

    /** A derived key for the n-th Stripe call of one operation (Stripe rejects one key reused on a different endpoint). */
    public IdempotencyKey child(String suffix) {
        return new IdempotencyKey(value + "-" + suffix);
    }

    @Override
    public String toString() {
        return value;
    }
}
