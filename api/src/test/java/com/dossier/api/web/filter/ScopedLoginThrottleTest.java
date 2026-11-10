package com.dossier.api.web.filter;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ScopedLoginThrottleTest {

    @Test
    void countsPerWorldAndAddressAndClearsOnSuccess() {
        ScopedLoginThrottle t = new ScopedLoginThrottle(3);
        String personal = ScopedLoginThrottle.key("P", " A@X.com ");
        String acme = ScopedLoginThrottle.key("E5", "a@x.com");
        String beta = ScopedLoginThrottle.key("E6", "a@x.com");
        assertThat(personal).isEqualTo("login P:a@x.com");
        for (int i = 0; i < 3; i++) assertThat(t.hit(acme)).isZero();
        assertThat(t.hit(acme)).as("fourth attempt in the window").isPositive();
        assertThat(t.hit(personal)).as("the personal world is a different bucket").isZero();
        assertThat(t.hit(beta)).as("another organization is a different bucket").isZero();
        t.clear(acme);
        assertThat(t.hit(acme)).isZero();
    }
}
