package com.dossier.api.config;

import ch.qos.logback.classic.pattern.ClassicConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.util.Map;

/**
 * Logback conversion word {@code %tenant} (X1.10): renders {@code [tenant=7 host=acme.localhost member=12] } from the MDC
 * keys the tenant filter and the org permission interceptor set, and the EMPTY string when none is set. So with the
 * enterprise flag off (nothing is ever put in the MDC) every log line is byte-for-byte what it was before. Values are
 * ids and a hostname, never a login, an email or a name; they are re-checked here so a stray CR/LF or space in a value can
 * not forge a field.
 */
public class TenantLogConverter extends ClassicConverter {

    static final String[] KEYS = { "tenant", "host", "member" };

    @Override
    public String convert(ILoggingEvent event) {
        Map<String, String> mdc = event.getMDCPropertyMap();
        if (mdc == null || mdc.isEmpty()) return "";
        StringBuilder out = null;
        for (String key : KEYS) {
            String value = mdc.get(key);
            if (value == null || value.isEmpty()) continue;
            out = out == null ? new StringBuilder("[") : out.append(' ');
            out.append(key).append('=').append(safe(value));
        }
        return out == null ? "" : out.append("] ").toString();
    }

    private static String safe(String v) {
        StringBuilder b = new StringBuilder(Math.min(v.length(), 100));
        for (int i = 0; i < v.length() && i < 100; i++) {
            char c = v.charAt(i);
            b.append(Character.isLetterOrDigit(c) || c == '.' || c == '-' || c == '_' ? c : '_');
        }
        return b.toString();
    }
}
