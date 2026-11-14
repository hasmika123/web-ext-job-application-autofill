package com.dossier.api.service.ent.domains;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The ownership and routing checks of a custom domain (10-domain-routing.md s4.1, s4.4), with scripted DNS answers. */
class HostnameVerifierTest {

    static final String EDGE = "edge.kiwiply.com";
    static final String IP = "74.208.212.158";
    static final String TOKEN = "abc123";

    /** A DNS that answers from maps; anything unscripted is NODATA. */
    static final class Scripted implements DnsLookup {

        final Map<String, Answer> txt = new HashMap<>();
        final Map<String, Answer> cname = new HashMap<>();
        final Map<String, Answer> a = new HashMap<>();

        @Override
        public Answer txt(String name) {
            return txt.getOrDefault(name, Answer.of(Outcome.NODATA));
        }

        @Override
        public Answer cname(String name) {
            return cname.getOrDefault(name, Answer.of(Outcome.NODATA));
        }

        @Override
        public Answer a(String name) {
            return a.getOrDefault(name, Answer.of(Outcome.NODATA));
        }
    }

    Scripted dns = new Scripted();
    HostnameVerifier verifier = new HostnameVerifier(dns);

    private HostnameVerifier.Result check(String host) {
        return verifier.verify(host, TOKEN, EDGE + ".", IP);
    }

    @Test
    void bothRecordsRightIsOk() {
        dns.txt.put("_kiwiply-verify.careers.acme.com", DnsLookup.Answer.of(List.of("kiwiply-verify=abc123")));
        dns.cname.put("careers.acme.com", DnsLookup.Answer.of(List.of(EDGE)));
        HostnameVerifier.Result r = check("careers.acme.com");
        assertThat(r.ok()).isTrue();
        assertThat(r.code()).isEqualTo("OK");
    }

    @Test
    void ownershipIsCheckedFirstThenRouting() {
        assertThat(check("careers.acme.com").code()).isEqualTo("TXT_MISSING");
        dns.txt.put("_kiwiply-verify.careers.acme.com", DnsLookup.Answer.of(List.of("kiwiply-verify=someone-else")));
        assertThat(check("careers.acme.com").code()).isEqualTo("TXT_MISMATCH");
        dns.txt.put("_kiwiply-verify.careers.acme.com", DnsLookup.Answer.of(List.of("\"kiwiply-verify=abc123\"")));
        assertThat(check("careers.acme.com").code()).as("quotes are stripped").isEqualTo("CNAME_MISSING");
        dns.cname.put("careers.acme.com", DnsLookup.Answer.of(List.of("acme.herokudns.com")));
        assertThat(check("careers.acme.com").code()).isEqualTo("CNAME_WRONG_TARGET:acme.herokudns.com");
    }

    @Test
    void aCnameChainToTheEdgeIsFollowedAndAnApexCanPointItsARecordAtTheEdge() {
        dns.txt.put("_kiwiply-verify.jobs.acme.com", DnsLookup.Answer.of(List.of("kiwiply-verify=abc123")));
        dns.cname.put("jobs.acme.com", DnsLookup.Answer.of(List.of("alias.acme.net")));
        dns.cname.put("alias.acme.net", DnsLookup.Answer.of(List.of(EDGE)));
        assertThat(check("jobs.acme.com").ok()).isTrue();

        dns.txt.put("_kiwiply-verify.acme.com", DnsLookup.Answer.of(List.of("kiwiply-verify=abc123")));
        dns.a.put("acme.com", DnsLookup.Answer.of(List.of("1.2.3.4")));
        assertThat(check("acme.com").code()).isEqualTo("A_WRONG_IP:1.2.3.4");
        dns.a.put("acme.com", DnsLookup.Answer.of(List.of(IP)));
        assertThat(check("acme.com").ok()).isTrue();
    }

    @Test
    void aNameThatDoesNotExistAndAResolverFailureSaySo() {
        dns.txt.put("_kiwiply-verify.nothing.acme.com", DnsLookup.Answer.of(DnsLookup.Outcome.NXDOMAIN));
        dns.a.put("nothing.acme.com", DnsLookup.Answer.of(DnsLookup.Outcome.NXDOMAIN));
        assertThat(check("nothing.acme.com").code()).isEqualTo("DNS_NXDOMAIN");
        dns.txt.put("_kiwiply-verify.flaky.acme.com", DnsLookup.Answer.error("timed out"));
        assertThat(check("flaky.acme.com").code()).isEqualTo("DNS_ERROR:timed out");
    }

    @Test
    void anApexIsARegisteredDomain() {
        assertThat(HostnameVerifier.isApex("acme.com")).isTrue();
        assertThat(HostnameVerifier.isApex("acme.co.uk")).isTrue();
        assertThat(HostnameVerifier.isApex("careers.acme.com")).isFalse();
        assertThat(HostnameVerifier.isApex("careers.acme.co.uk")).isFalse();
    }
}
