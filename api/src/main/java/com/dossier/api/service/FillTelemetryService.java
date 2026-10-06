package com.dossier.api.service;

import com.dossier.api.domain.FillEvent;
import com.dossier.api.repository.FillEventRepository;
import com.dossier.api.service.dto.FillTelemetryDTO;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records fill telemetry (Phase 10.1) — the data that directs adapter work in 10.4.
 *
 * <p><b>The privacy line is enforced here, not trusted from the client.</b> The extension only
 * ever sends an ATS family and counts, but a buggy or hostile client could send anything, so the
 * ATS and adapter are mapped onto fixed vocabularies (anything else becomes {@code other}), every
 * count is clamped, and nothing is stored that could name a company, a page or a person.
 */
@Service
@Transactional
public class FillTelemetryService {

    private static final Logger LOG = LoggerFactory.getLogger(FillTelemetryService.class);

    /** Families the panel ranks. A hostname the extension didn't recognise arrives as `other`. */
    public static final Set<String> ATS_FAMILIES = Set.of(
        "workday",
        "greenhouse",
        "lever",
        "ashby",
        "workable",
        "icims",
        "taleo",
        "smartrecruiters",
        "bamboohr",
        "jobvite",
        "indeed",
        "successfactors",
        "oracle",
        "linkedin",
        "other"
    );

    /** The extension's adapter ids. `generic` means no dedicated adapter handled the page. */
    public static final Set<String> ADAPTERS = Set.of("generic", "greenhouse", "lever", "ashby", "workable", "workday", "indeed", "other");

    /** A form bigger than this is not a job application; clamp rather than store nonsense. */
    static final int MAX_COUNT = 500;

    /** How long after a fill a correction still counts as a correction of THAT fill. */
    static final Duration CORRECTION_WINDOW = Duration.ofHours(1);

    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern VERSION = Pattern.compile("^[0-9]{1,4}(\\.[0-9]{1,4}){0,3}$");

    private final FillEventRepository fillEventRepository;

    public FillTelemetryService(FillEventRepository fillEventRepository) {
        this.fillEventRepository = fillEventRepository;
    }

    /** True for a well-formed id; the resource answers 400 otherwise. */
    public static boolean isValidId(String id) {
        return id != null && UUID.matcher(id).matches();
    }

    /**
     * Store one fill. A repeated id (the extension retrying) is ignored rather than an error:
     * the first report already counted.
     *
     * @return false when the id was already recorded
     */
    public boolean record(FillTelemetryDTO dto) {
        if (dto == null || !isValidId(dto.id())) throw new IllegalArgumentException("A fill needs a UUID id");
        String id = dto.id().toLowerCase(Locale.ROOT);
        if (fillEventRepository.existsById(id)) return false;

        int found = clamp(dto.fieldsFound());
        FillEvent e = new FillEvent();
        e.setId(id);
        e.setAts(oneOf(dto.ats(), ATS_FAMILIES));
        e.setAdapter(oneOf(dto.adapter(), ADAPTERS));
        e.setFieldsFound(found);
        // Filled and failed are subsets of what was found; a client claiming otherwise is wrong.
        e.setFieldsFilled(Math.min(clamp(dto.fieldsFilled()), found));
        e.setFieldsFailed(Math.min(clamp(dto.fieldsFailed()), found));
        e.setRequiredLeftEmpty(clamp(dto.requiredLeftEmpty()));
        e.setExtVersion(dto.extVersion() != null && VERSION.matcher(dto.extVersion()).matches() ? dto.extVersion() : null);
        e.setCreatedAt(Instant.now());
        try {
            fillEventRepository.saveAndFlush(e);
            return true;
        } catch (DataIntegrityViolationException race) {
            LOG.debug("Fill {} was recorded by a concurrent report", id);
            return false;
        }
    }

    /** The user changed a field we filled. Silently ignored for an unknown, stale or maxed fill. */
    public void recordCorrection(String id) {
        if (!isValidId(id)) return;
        fillEventRepository.incrementCorrection(id.toLowerCase(Locale.ROOT), Instant.now().minus(CORRECTION_WINDOW));
    }

    private static int clamp(Integer n) {
        if (n == null || n < 0) return 0;
        return Math.min(n, MAX_COUNT);
    }

    private static String oneOf(String value, Set<String> allowed) {
        String v = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return allowed.contains(v) ? v : "other";
    }
}
