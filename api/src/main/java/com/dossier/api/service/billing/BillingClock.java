package com.dossier.api.service.billing;

import java.time.Instant;
import org.springframework.stereotype.Component;

/**
 * "Now" for the personal billing gates that decide whether someone still has a paid plan (the quote service's resolution and the checkout's already-subscribed
 * check). It is the system clock, always; it is a bean only so the scenario harness (K8.6) can move it along with its simulated Stripe clock: the harness replays
 * weeks of a subscription's life in milliseconds, and a gate that read the wall clock would still see the first day.
 */
@Component
public class BillingClock {

    public Instant now() {
        return Instant.now();
    }
}
