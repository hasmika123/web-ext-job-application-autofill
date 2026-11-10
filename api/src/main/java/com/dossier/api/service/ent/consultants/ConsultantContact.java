package com.dossier.api.service.ent.consultants;

import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Validation of the consultant contact fields (work phone, IANA time zone, preferred contact). Contact data only: a phone number is digits, plus, space,
 * dash and parentheses (7 to 15 digits), so an identity-document number cannot ride in it; every value also goes through the PII scanner. Blank is null.
 */
public final class ConsultantContact {

    public static final List<String> PREFERRED = List.of("EMAIL", "PHONE", "TEXT");
    static final Pattern PHONE = Pattern.compile("^[0-9+()\\- ]{1,32}$");

    private ConsultantContact() {}

    public static String phone(Object raw) {
        String t = trimmed("phone", raw);
        if (t == null) return null;
        if (!PHONE.matcher(t).matches()) throw OrgException.invalid("phone", "use digits, +, spaces, dashes and parentheses only");
        long digits = t.chars().filter(Character::isDigit).count();
        if (digits < 7 || digits > 15) throw OrgException.invalid("phone", "must have between 7 and 15 digits");
        return t;
    }

    public static String timeZone(Object raw) {
        String t = trimmed("timeZone", raw);
        if (t == null) return null;
        boolean ok = t.equals("UTC") || t.contains("/");
        if (ok) {
            try {
                ZoneId.of(t);
            } catch (DateTimeException e) {
                ok = false;
            }
        }
        if (!ok || !ZoneId.getAvailableZoneIds().contains(t)) throw OrgException.invalid("timeZone", "must be an IANA time zone such as America/Chicago");
        return t;
    }

    public static String preferred(Object raw) {
        String t = trimmed("preferredContact", raw);
        if (t == null) return null;
        String v = t.toUpperCase(Locale.ROOT);
        if (!PREFERRED.contains(v)) throw OrgException.invalid("preferredContact", "must be EMAIL, PHONE or TEXT");
        return v;
    }

    private static String trimmed(String field, Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text");
        String t = s.strip();
        if (t.isEmpty()) return null;
        if (t.length() > 64) throw OrgException.invalid(field, "is too long");
        SensitiveContent.check(field, field, t);
        return t;
    }
}
