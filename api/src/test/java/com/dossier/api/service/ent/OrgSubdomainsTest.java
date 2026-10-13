package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.org.OrgException;
import java.util.List;
import org.junit.jupiter.api.Test;

/** X1.2: a subdomain is 3 to 63 of a-z 0-9 -, DNS-valid, never reserved; reserved is a 422 RESERVED_VALUE. */
class OrgSubdomainsTest {

    @Test
    void wellFormedLabels() {
        for (String ok : List.of("acme", "acme-corp", "a1b", "123", "x".repeat(63), "abc")) {
            assertThat(OrgSubdomains.isWellFormed(ok)).as(ok).isTrue();
        }
        for (String bad : List.of("ab", "x".repeat(64), "-acme", "acme-", "Acme", "acme_corp", "acme.corp", "a--b", "xn--bcher-kva", "ac me", "")) {
            assertThat(OrgSubdomains.isWellFormed(bad)).as(bad).isFalse();
        }
        assertThat(OrgSubdomains.isWellFormed(null)).isFalse();
    }

    @Test
    void everyReservedPlatformLabelIsRefusedWith422ReservedValue() {
        for (String label : List.of("www", "app", "api", "mail", "admin", "edge", "static", "cdn", "status", "help", "docs", "dev", "staging", "demo", "join", "connect")) {
            assertThat(OrgSubdomains.isReserved(label)).as(label).isTrue();
            assertThatThrownBy(() -> OrgSubdomains.requireValid(label)).as(label).isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getCode()).isEqualTo("RESERVED_VALUE");
            });
        }
    }

    @Test
    void aValidLabelIsReturnedLowerCased() {
        assertThat(OrgSubdomains.requireValid("  AcmeCorp ")).isEqualTo("acmecorp");
        assertThat(OrgSubdomains.isReserved("acmecorp")).isFalse();
    }

    @Test
    void aMalformedLabelIsA422OrgInvalid() {
        for (String bad : new String[] { null, "", "  ", "ab", "a--b", "-x-", "has.dot", "under_score" }) {
            assertThatThrownBy(() -> OrgSubdomains.requireValid(bad)).as("'%s'", bad).isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getCode()).isEqualTo("ORG_INVALID");
            });
        }
    }
}
