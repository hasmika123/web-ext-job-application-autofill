package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.privacy.SensitivePatterns.Hit;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Runs the shared fixture corpus (the same file the TypeScript twin runs) plus the Java-only API:
 * redaction, key-as-label scanning, JSON guard and redaction.
 */
class SensitivePatternsTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode corpus() throws Exception {
        try (InputStream in = SensitivePatternsTest.class.getResourceAsStream("/sensitive-patterns/corpus.json")) {
            return OM.readTree(in);
        }
    }

    private static List<Hit> scanCase(JsonNode c) {
        String text = c.get("text").textValue();
        return c.has("key") ? SensitivePatterns.scanField(c.get("key").textValue(), text) : SensitivePatterns.scan(text);
    }

    @Test
    void corpusHitsMatchExactly() throws Exception {
        JsonNode cases = corpus().get("cases");
        assertThat(cases.size()).isGreaterThan(60);
        List<String> failures = new ArrayList<>();
        for (JsonNode c : cases) {
            String text = c.get("text").textValue();
            List<Hit> got = scanCase(c);
            List<String> gotDesc = new ArrayList<>();
            for (Hit h : got) gotDesc.add(h.cls() + ":" + text.substring(h.start(), h.end()));
            List<String> wantDesc = new ArrayList<>();
            for (JsonNode h : c.get("hits")) wantDesc.add(h.get("cls").textValue() + ":" + h.get("text").textValue());
            if (!gotDesc.equals(wantDesc)) failures.add(c.get("name").textValue() + " -> got " + gotDesc + ", want " + wantDesc);
        }
        assertThat(failures).isEmpty();
    }

    @Test
    void corpusRedactionReplacesExactlyTheHitValues() throws Exception {
        for (JsonNode c : corpus().get("cases")) {
            String text = c.get("text").textValue();
            // Expected output is derived from the case's own hit list, not from scan().
            StringBuilder want = new StringBuilder();
            int pos = 0;
            for (JsonNode h : c.get("hits")) {
                int at = text.indexOf(h.get("text").textValue(), pos);
                assertThat(at).as(c.get("name").textValue()).isGreaterThanOrEqualTo(0);
                want.append(text, pos, at).append(SensitivePatterns.REDACTED);
                pos = at + h.get("text").textValue().length();
            }
            want.append(text.substring(pos));
            String got = c.has("key")
                ? SensitivePatterns.redactField(c.get("key").textValue(), text)
                : SensitivePatterns.redact(text);
            assertThat(got).as(c.get("name").textValue()).isEqualTo(want.toString());
        }
    }

    @Test
    void redactedTextIsClean() throws Exception {
        for (JsonNode c : corpus().get("cases")) {
            if (c.has("key")) continue;
            assertThat(SensitivePatterns.scan(SensitivePatterns.redact(c.get("text").textValue()))).as(c.get("name").textValue()).isEmpty();
        }
    }

    @Test
    void nullAndBlankAreEmpty() {
        assertThat(SensitivePatterns.scan(null)).isEmpty();
        assertThat(SensitivePatterns.scan("  ")).isEmpty();
        assertThat(SensitivePatterns.redact(null)).isNull();
        assertThat(SensitivePatterns.scanField(null, null)).isEmpty();
        assertThat(SensitivePatterns.scanField(null, "SSN 123-45-6789")).hasSize(1);
    }

    @Test
    void hitsAreOrderedAndNeverOverlap() {
        List<Hit> hits = SensitivePatterns.scan("SSN: 123-45-6789 DOB: 1990-05-12 EIN: 12-3456789 Passport no. X1234567");
        assertThat(hits).extracting(Hit::cls).containsExactly("SSN_ITIN", "DOB", "TAX_ID", "PASSPORT");
        for (int i = 1; i < hits.size(); i++) assertThat(hits.get(i).start()).isGreaterThanOrEqualTo(hits.get(i - 1).end());
    }

    @Test
    void ibanChecksum() {
        assertThat(SensitivePatterns.validIban("GB82 WEST 1234 5698 7654 32")).isTrue();
        assertThat(SensitivePatterns.validIban("GB82 WEST 1234 5698 7654 33")).isFalse();
        assertThat(SensitivePatterns.validIban("GB82")).isFalse();
    }

    @Test
    void keyLabels() {
        assertThat(SensitivePatterns.labelOf("bankRoutingNumber")).isEqualTo("bank Routing Number");
        assertThat(SensitivePatterns.labelOf("bank_routing_number")).isEqualTo("bank routing number");
        assertThat(SensitivePatterns.labelOf("taxID")).isEqualTo("tax ID");
    }

    // ---- JSON guard ----------------------------------------------------------------------------

    @Test
    void checkNamesPathAndClass() throws Exception {
        JsonNode item = OM.readTree("{\"title\":\"Engineer\",\"bullets\":[{\"text\":\"fine\"},{\"text\":\"DOB: 1990-05-12\"}]}");
        assertThatThrownBy(() -> SensitiveContent.check("data", item))
            .isInstanceOfSatisfying(SensitiveContentException.class, e -> {
                assertThat(e.getPath()).isEqualTo("data.bullets[1].text");
                assertThat(e.getSensitiveClass()).isEqualTo("DOB");
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getCode()).isEqualTo("SENSITIVE_CONTENT");
                assertThat(e.getExtra()).containsEntry("path", "data.bullets[1].text").containsEntry("class", "DOB");
            });
    }

    @Test
    void checkUsesTheKeyAsLabelIncludingInsideArrays() throws Exception {
        JsonNode item = OM.readTree("{\"passportNumber\":\"A12345678\"}");
        assertThatThrownBy(() -> SensitiveContent.check("data", item))
            .isInstanceOfSatisfying(SensitiveContentException.class, e -> assertThat(e.getSensitiveClass()).isEqualTo("PASSPORT"));
        JsonNode list = OM.readTree("{\"ssn\":[\"123456789\"]}");
        assertThatThrownBy(() -> SensitiveContent.check("", list))
            .isInstanceOfSatisfying(SensitiveContentException.class, e -> assertThat(e.getPath()).isEqualTo("ssn[0]"));
    }

    @Test
    void checkPassesOrdinaryContent() throws Exception {
        SensitiveContent.check("data", OM.readTree("{\"title\":\"Engineer\",\"start\":\"2020-01\",\"skills\":[\"Java\",\"VAT\"],\"current\":true,\"n\":123456789}"));
    }

    @Test
    void redactStripsInPlaceAndCounts() throws Exception {
        JsonNode item = OM.readTree("{\"title\":\"Engineer\",\"bullets\":[\"Born March 3, 1990 in Ohio\",\"fine\"],\"note\":\"SSN 123-45-6789\"}");
        int n = SensitiveContent.redact(item);
        assertThat(n).isEqualTo(2);
        assertThat(item.get("bullets").get(0).textValue()).isEqualTo("Born [removed] in Ohio");
        assertThat(item.get("note").textValue()).isEqualTo("SSN [removed]");
        assertThat(item.get("title").textValue()).isEqualTo("Engineer");
        assertThat(SensitiveContent.redact(item)).isZero();
    }
}
