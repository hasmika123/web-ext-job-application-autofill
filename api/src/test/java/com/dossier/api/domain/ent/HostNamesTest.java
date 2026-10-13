package com.dossier.api.domain.ent;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** X1.2: one canonical spelling of a hostname (lower-case, punycode, no port, no trailing dot) and nothing else gets through. */
class HostNamesTest {

    @Test
    void aHostIsLowerCasedAndStrippedOfPortAndTrailingDot() {
        assertThat(HostNames.normalise("Acme.Kiwiply.COM")).isEqualTo("acme.kiwiply.com");
        assertThat(HostNames.normalise("  acme.kiwiply.com:8443 ")).isEqualTo("acme.kiwiply.com");
        assertThat(HostNames.normalise("acme.kiwiply.com.")).isEqualTo("acme.kiwiply.com");
        assertThat(HostNames.normalise("localhost:3000")).isEqualTo("localhost");
        assertThat(HostNames.normalise("acme.localhost")).isEqualTo("acme.localhost");
        assertThat(HostNames.normalise("127.0.0.1:18181")).isEqualTo("127.0.0.1");
    }

    @Test
    void anInternationalNameIsPunycoded() {
        assertThat(HostNames.normalise("Bücher.example")).isEqualTo("xn--bcher-kva.example");
        assertThat(HostNames.normalise("xn--bcher-kva.example")).isEqualTo("xn--bcher-kva.example");
    }

    @Test
    void anIpv6LiteralKeepsItsBracketsAndLosesItsPort() {
        assertThat(HostNames.normalise("[::1]:3000")).isEqualTo("[::1]");
        assertThat(HostNames.normalise("[::1]")).isEqualTo("[::1]");
        assertThat(HostNames.normalise("[::1")).isNull();
        assertThat(HostNames.normalise("[::1]x")).isNull();
        assertThat(HostNames.normalise("[zz::1]")).isNull();
    }

    @Test
    void anythingThatIsNotOneHostnameIsRejectedNotRepaired() {
        for (String bad : List.of(
            "", "   ", ".", "..", "a..b", "-a.com", "a-.com", "a_b.com", "a b.com", "a.com/path", "user@a.com", "a.com?x=1", "a.com#f", "a.com,b.com",
            "a.com:notaport", "a.com:123456", "http://a.com", "a.com\r\nHost: b.com", "x".repeat(64) + ".com", ("a".repeat(60) + ".").repeat(5) + "com"
        )) {
            assertThat(HostNames.normalise(bad)).as("'%s'", bad.replace("\r\n", "\\r\\n")).isNull();
        }
        assertThat(HostNames.normalise(null)).isNull();
    }

    @Test
    void canonicalMeansAlreadyNormalised() {
        assertThat(HostNames.isCanonical("acme.kiwiply.com")).isTrue();
        assertThat(HostNames.isCanonical("Acme.kiwiply.com")).isFalse();
        assertThat(HostNames.isCanonical("acme.kiwiply.com:80")).isFalse();
        assertThat(HostNames.isCanonical(null)).isFalse();
    }

    @Test
    void ipLiteralsAndLoopbackAreRecognised() {
        assertThat(HostNames.isIpLiteral("127.0.0.1")).isTrue();
        assertThat(HostNames.isIpLiteral("[::1]")).isTrue();
        assertThat(HostNames.isIpLiteral("acme.com")).isFalse();
        assertThat(HostNames.isIpLiteral("1.2.3.4.example")).isFalse();
        assertThat(HostNames.isLoopback("localhost")).isTrue();
        assertThat(HostNames.isLoopback("127.0.0.1")).isTrue();
        assertThat(HostNames.isLoopback("[::1]")).isTrue();
        assertThat(HostNames.isLoopback("acme.localhost")).isFalse();
    }
}
