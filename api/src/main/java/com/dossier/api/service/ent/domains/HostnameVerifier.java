package com.dossier.api.service.ent.domains;

import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * The two checks a custom domain must pass to go live (docs/enterprise-v2/10-domain-routing.md s4.1, s4.4):
 * <ol>
 *   <li><b>Ownership:</b> a TXT record at {@code _kiwiply-verify.{host}} equal to {@code kiwiply-verify={token}}.</li>
 *   <li><b>Routing:</b> the host CNAMEs to the edge name (following up to 3 hops), or, for a name that cannot use a CNAME (an apex), its A records
 *       contain the edge address.</li>
 * </ol>
 * The result code is what the Domains page explains: OK, TXT_MISSING, TXT_MISMATCH, CNAME_MISSING, CNAME_WRONG_TARGET:{target},
 * A_WRONG_IP:{ip}, DNS_NXDOMAIN or DNS_ERROR:{message}. The proxy and CAA diagnostics of s4.2 come with certificate tracking (A4b).
 */
@Component
public class HostnameVerifier {

    public static final String TXT_PREFIX = "_kiwiply-verify.";
    public static final String TXT_VALUE_PREFIX = "kiwiply-verify=";
    static final int MAX_HOPS = 3;

    public record Result(boolean owned, boolean routed, String code) {
        public boolean ok() {
            return owned && routed;
        }
    }

    private final DnsLookup dns;

    public HostnameVerifier(DnsLookup dns) {
        this.dns = dns;
    }

    public Result verify(String host, String token, String edgeName, String edgeIp) {
        String edge = DnsjavaLookup.clean(edgeName == null ? "" : edgeName);
        DnsLookup.Answer txt = dns.txt(TXT_PREFIX + host);
        if (txt.outcome() == DnsLookup.Outcome.ERROR) return new Result(false, false, cut("DNS_ERROR:" + txt.error()));
        boolean owned = txt.values().stream().map(v -> v.replace("\"", "").trim()).anyMatch(v -> v.equals(TXT_VALUE_PREFIX + token));
        String ownerCode = owned ? null : txt.values().isEmpty() ? "TXT_MISSING" : "TXT_MISMATCH";

        String routeCode = null;
        boolean routed = false;
        DnsLookup.Answer cname = dns.cname(host);
        if (cname.outcome() == DnsLookup.Outcome.ERROR) return new Result(owned, false, cut("DNS_ERROR:" + cname.error()));
        if (!cname.values().isEmpty()) {
            String first = cname.values().get(0);
            String target = first;
            for (int hop = 0; hop < MAX_HOPS && target != null; hop++) {
                if (target.equals(edge)) {
                    routed = true;
                    break;
                }
                List<String> next = dns.cname(target).values();
                target = next.isEmpty() ? null : next.get(0);
            }
            if (!routed) routeCode = cut("CNAME_WRONG_TARGET:" + first);
        } else {
            DnsLookup.Answer a = dns.a(host);
            if (a.outcome() == DnsLookup.Outcome.ERROR) return new Result(owned, false, cut("DNS_ERROR:" + a.error()));
            if (a.values().contains(edgeIp)) routed = true;
            else if (a.values().isEmpty()) routeCode = a.outcome() == DnsLookup.Outcome.NXDOMAIN && txt.outcome() == DnsLookup.Outcome.NXDOMAIN ? "DNS_NXDOMAIN" : "CNAME_MISSING";
            else routeCode = cut("A_WRONG_IP:" + a.values().get(0));
        }
        if (owned && routed) return new Result(true, true, "OK");
        if ("DNS_NXDOMAIN".equals(routeCode)) return new Result(owned, routed, routeCode);
        return new Result(owned, routed, ownerCode != null ? ownerCode : routeCode);
    }

    /** Whether a name is an apex (a registered domain such as {@code acme.com} or {@code acme.co.uk}), which cannot carry a CNAME. */
    public static boolean isApex(String host) {
        String[] labels = host.toLowerCase(Locale.ROOT).split("\\.");
        if (labels.length <= 2) return true;
        String lastTwo = labels[labels.length - 2] + "." + labels[labels.length - 1];
        return labels.length == 3 && SECOND_LEVEL.contains(lastTwo);
    }

    /** Common two-label public suffixes (enough to recognise an apex like acme.co.uk; not the full public-suffix list). */
    static final List<String> SECOND_LEVEL = List.of(
        "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.in", "net.in", "org.in", "co.za", "com.br", "com.mx", "co.jp",
        "com.sg", "com.cn", "com.hk", "co.kr", "com.tr", "com.ar", "co.il", "com.my", "com.ph", "co.id"
    );

    private static String cut(String code) {
        return code.length() > 200 ? code.substring(0, 200) : code;
    }
}
