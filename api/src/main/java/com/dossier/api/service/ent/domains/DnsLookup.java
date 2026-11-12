package com.dossier.api.service.ent.domains;

import java.util.List;

/**
 * The three DNS questions the custom-domain checks ask (docs/enterprise-v2/10-domain-routing.md s4.1). An interface so tests never touch the network;
 * {@link DnsjavaLookup} answers for real.
 */
public interface DnsLookup {
    /** OK with values; NXDOMAIN (the name does not exist); NODATA (it exists, without that record); ERROR (the resolver failed). */
    enum Outcome {
        OK,
        NXDOMAIN,
        NODATA,
        ERROR,
    }

    /** {@code values}: TXT strings, CNAME targets (lower-case, no trailing dot) or IPv4 addresses. */
    record Answer(Outcome outcome, List<String> values, String error) {
        public Answer {
            values = values == null ? List.of() : List.copyOf(values);
        }

        public static Answer of(List<String> values) {
            return new Answer(values.isEmpty() ? Outcome.NODATA : Outcome.OK, values, null);
        }

        public static Answer of(Outcome outcome) {
            return new Answer(outcome, List.of(), null);
        }

        public static Answer error(String message) {
            return new Answer(Outcome.ERROR, List.of(), message);
        }
    }

    Answer txt(String name);

    Answer cname(String name);

    Answer a(String name);
}
