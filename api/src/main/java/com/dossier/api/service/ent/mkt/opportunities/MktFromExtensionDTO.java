package com.dossier.api.service.ent.mkt.opportunities;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.cfg.CoercionAction;
import com.fasterxml.jackson.databind.cfg.CoercionInputShape;
import com.fasterxml.jackson.databind.type.LogicalType;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.dossier.api.service.org.OrgException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Wire shapes of {@code POST /api/orgs/{orgId}/mkt/opportunities/from-extension} (docs/enterprise-v2/60-job-phase1-contract.md section 4).
 *
 * <p>The request is a WHITELIST: {@link #parse} reads it with a strict mapper, so a field that is not listed below ({@code state}, {@code appliedAt},
 * {@code jobDescription}, {@code description}, anything else) is a 400, never ignored and never stored. There is deliberately no field for the job
 * description: the extension drops it before sending and the server would not keep it.
 */
public final class MktFromExtensionDTO {

    /** The largest body accepted (bytes). */
    public static final int MAX_BODY_BYTES = 8 * 1024;

    /** The request fields, in the order the contract lists them. Anything else is refused. */
    public static final List<String> FIELDS = List.of(
        "jobUrl", "title", "company", "location", "workMode", "employmentType", "payLabel", "payMin", "payMax", "payPeriod", "externalJobId", "atsPlatform",
        "postedOn", "skills", "keyInfo", "priority", "dueOn", "consultantIds", "extensionVersion"
    );

    private MktFromExtensionDTO() {}

    /** Strict on purpose: unknown properties fail, numbers must be numbers, nothing trails the document. */
    private static final ObjectMapper STRICT = JsonMapper.builder()
        .addModule(new JavaTimeModule())
        .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
        .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
        .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
        .build();

    static {
        // a number or a boolean is never a string: {"title":5} is a 400, not "5"
        for (CoercionInputShape shape : new CoercionInputShape[] { CoercionInputShape.Integer, CoercionInputShape.Float, CoercionInputShape.Boolean }) {
            STRICT.coercionConfigFor(LogicalType.Textual).setCoercion(shape, CoercionAction.Fail);
        }
    }

    /** The hash input: sorted keys, no whitespace, so the same fields always give the same bytes. */
    private static final ObjectMapper CANONICAL = JsonMapper.builder()
        .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
        .build();

    /** What the extension sends. {@code payMin}/{@code payMax} are whole currency units (dollars), {@code payPeriod} HOUR, MONTH or YEAR. */
    public record Request(
        String jobUrl,
        String title,
        String company,
        String location,
        String workMode,
        String employmentType,
        String payLabel,
        Integer payMin,
        Integer payMax,
        String payPeriod,
        String externalJobId,
        String atsPlatform,
        LocalDate postedOn,
        List<String> skills,
        String keyInfo,
        String priority,
        LocalDate dueOn,
        List<Long> consultantIds,
        String extensionVersion
    ) {}

    /** One consultant of the call. {@code reason} is only present when nothing was assigned: CONSULTANT_INACTIVE, NOT_IN_SCOPE, RESUME_NOT_APPROVED or APPROVAL_PENDING (parked for a manager). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ConsultantResult(Long consultantId, Long opportunityId, boolean existing, String reason) {}

    /** {@code existingJob}: the job was already in the organization (found by its link or its ATS id), so nothing about it was changed. */
    public record Response(Long jobId, boolean existingJob, List<ConsultantResult> results) {}

    /**
     * Reads the body: at most {@link #MAX_BODY_BYTES}, one JSON object, only the whitelisted fields. Every failure is 400 {@code VALIDATION}
     * naming the field where there is one.
     */
    public static Request parse(byte[] body) {
        if (body == null || body.length == 0) throw invalid("body", "send the job as a JSON object");
        if (body.length > MAX_BODY_BYTES) throw invalid("body", "at most " + MAX_BODY_BYTES + " bytes");
        try {
            Request r = STRICT.readValue(body, Request.class);
            if (r == null) throw invalid("body", "send the job as a JSON object");
            return r;
        } catch (UnrecognizedPropertyException e) {
            throw invalid(e.getPropertyName(), "this field is not accepted");
        } catch (JsonProcessingException e) {
            throw invalid("body", "not a valid job: " + firstLine(e.getOriginalMessage()));
        } catch (java.io.IOException e) {
            throw invalid("body", "could not be read");
        }
    }

    /**
     * SHA-256 (hex) of the canonical JSON (keys sorted, no whitespace) of the whitelisted fields the request carried, as received: null fields are
     * left out, so a field that was not sent and one sent as null hash alike. Proves what was received without keeping any extra content.
     */
    public static String payloadHash(Request r) {
        Map<String, Object> m = new TreeMap<>(receivedFields(r));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(CANONICAL.writeValueAsString(m).getBytes(StandardCharsets.UTF_8)));
        } catch (JsonProcessingException | NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The non-null whitelisted fields of the request with their values, in contract order. */
    static Map<String, Object> receivedFields(Request r) {
        Map<String, Object> m = new LinkedHashMap<>();
        put(m, "jobUrl", r.jobUrl());
        put(m, "title", r.title());
        put(m, "company", r.company());
        put(m, "location", r.location());
        put(m, "workMode", r.workMode());
        put(m, "employmentType", r.employmentType());
        put(m, "payLabel", r.payLabel());
        put(m, "payMin", r.payMin());
        put(m, "payMax", r.payMax());
        put(m, "payPeriod", r.payPeriod());
        put(m, "externalJobId", r.externalJobId());
        put(m, "atsPlatform", r.atsPlatform());
        put(m, "postedOn", r.postedOn() == null ? null : r.postedOn().toString());
        put(m, "skills", r.skills());
        put(m, "keyInfo", r.keyInfo());
        put(m, "priority", r.priority());
        put(m, "dueOn", r.dueOn() == null ? null : r.dueOn().toString());
        put(m, "consultantIds", r.consultantIds());
        put(m, "extensionVersion", r.extensionVersion());
        return m;
    }

    private static void put(Map<String, Object> m, String key, Object value) {
        if (value != null) m.put(key, value);
    }

    static OrgException invalid(String field, String message) {
        return OrgException.coded(400, "VALIDATION", field + ": " + message, Map.of("field", field));
    }

    private static String firstLine(String s) {
        if (s == null) return "unreadable";
        int nl = s.indexOf('\n');
        String line = nl < 0 ? s : s.substring(0, nl);
        return line.length() > 120 ? line.substring(0, 120) : line;
    }
}
