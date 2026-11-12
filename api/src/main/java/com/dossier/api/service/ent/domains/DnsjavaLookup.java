package com.dossier.api.service.ent.domains;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.CNAMERecord;
import org.xbill.DNS.ExtendedResolver;
import org.xbill.DNS.Lookup;
import org.xbill.DNS.Record;
import org.xbill.DNS.Resolver;
import org.xbill.DNS.TXTRecord;
import org.xbill.DNS.TextParseException;
import org.xbill.DNS.Type;

/**
 * Real DNS answers through dnsjava (approved in docs/enterprise-v2/10-domain-routing.md s4.1): the system resolvers, 3 seconds per query, 2 retries, and
 * no answer cache, so a customer who just added a record is not shown a stale "missing".
 */
@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "dossier.ent.domains.dns", havingValue = "system", matchIfMissing = true)
public class DnsjavaLookup implements DnsLookup {

    static final Duration TIMEOUT = Duration.ofSeconds(3);

    @Override
    public Answer txt(String name) {
        return ask(name, Type.TXT);
    }

    @Override
    public Answer cname(String name) {
        return ask(name, Type.CNAME);
    }

    @Override
    public Answer a(String name) {
        return ask(name, Type.A);
    }

    private Answer ask(String name, int type) {
        try {
            Lookup lookup = new Lookup(name, type);
            lookup.setResolver(resolver());
            lookup.setCache(null); // a throw-away cache per question: never a stale answer
            Record[] records = lookup.run();
            switch (lookup.getResult()) {
                case Lookup.SUCCESSFUL -> {
                    List<String> out = new ArrayList<>();
                    for (Record r : records) {
                        if (r instanceof TXTRecord t) out.add(String.join("", t.getStrings()));
                        else if (r instanceof CNAMERecord c) out.add(clean(c.getTarget().toString()));
                        else if (r instanceof ARecord a) out.add(a.getAddress().getHostAddress());
                    }
                    return Answer.of(out);
                }
                case Lookup.HOST_NOT_FOUND -> {
                    return Answer.of(Outcome.NXDOMAIN);
                }
                case Lookup.TYPE_NOT_FOUND -> {
                    return Answer.of(Outcome.NODATA);
                }
                default -> {
                    return Answer.error(lookup.getErrorString());
                }
            }
        } catch (TextParseException e) {
            return Answer.of(Outcome.NXDOMAIN);
        } catch (RuntimeException e) {
            return Answer.error(e.getClass().getSimpleName());
        }
    }

    private static Resolver resolver() {
        ExtendedResolver r = new ExtendedResolver();
        r.setTimeout(TIMEOUT);
        r.setRetries(2);
        return r;
    }

    static String clean(String name) {
        String n = name.trim().toLowerCase(Locale.ROOT);
        return n.endsWith(".") ? n.substring(0, n.length() - 1) : n;
    }
}
