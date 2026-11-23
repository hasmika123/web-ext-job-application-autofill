package com.dossier.api.service;

import com.dossier.api.domain.FillQualityDaily;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.FillEventRepository;
import com.dossier.api.repository.FillQualityDailyRepository;
import com.dossier.api.repository.FillQualityWindowRow;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Nightly count-only watch for ATS adapter regressions (Issue 03, ticket 04). */
@Service
public class FillQualityWatch {

    private static final Logger LOG = LoggerFactory.getLogger(FillQualityWatch.class);
    static final int SAMPLE_FLOOR = 30;
    static final int DROP_THRESHOLD_BP = 1_500; // 15 percentage points
    private static final String FIXTURE_ROOT = "test/fixtures/job-capture/";
    private static final String ALERT_KIND = "ADAPTER_ROT";

    @Value("${dossier.fill-quality.min-fills-7d:30}")
    private int configuredSampleFloor = SAMPLE_FLOOR;

    @Value("${dossier.fill-quality.drop-points:15}")
    private int configuredDropPoints = DROP_THRESHOLD_BP / 100;

    public record QualityWindow(long fills, long fieldsFound, long fieldsFilled, long fillsWithRequiredGaps) {
        int fillRateBp() { return rateBp(fieldsFilled, fieldsFound); }
        int gapRateBp() { return rateBp(fillsWithRequiredGaps, fills); }
    }

    public record RegressionAlert(String ats, long fills7, int rate7Bp, int baseline28Bp, int dropBp, String fixturePath) {}

    public record RunResult(LocalDate rolledUpDay, List<RegressionAlert> alerts) {}

    private final FillEventRepository fills;
    private final FillQualityDailyRepository daily;
    private final UserRepository users;
    private final NotificationService notifications;

    public FillQualityWatch(
        FillEventRepository fills,
        FillQualityDailyRepository daily,
        UserRepository users,
        NotificationService notifications
    ) {
        this.fills = fills;
        this.daily = daily;
        this.users = users;
        this.notifications = notifications;
    }

    /** Runs at 03:30 UTC; the previous complete UTC day is the only day written to the rollup. */
    @Scheduled(cron = "${dossier.fill-quality-watch-cron:0 30 3 * * *}", zone = "UTC")
    @Transactional
    public void scheduled() {
        try {
            run(Instant.now());
        } catch (RuntimeException e) {
            LOG.error("Fill-quality watch failed; no alert was sent", e);
        }
    }

    /** Public for a deterministic job test and an operator-triggered backfill later. */
    @Transactional
    public RunResult run(Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        LocalDate rolledUp = today.minusDays(1);
        rollup(rolledUp);
        List<RegressionAlert> alerts = currentAlerts(now);
        notifyAdmins(alerts, today, now);
        return new RunResult(rolledUp, alerts);
    }

    /** Read-only view used by the admin analytics page; it never rolls up or notifies. */
    @Transactional(readOnly = true)
    public List<RegressionAlert> currentAlerts(Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        Instant currentEnd = today.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant currentStart = currentEnd.minus(7, ChronoUnit.DAYS);
        Instant baselineStart = currentEnd.minus(35, ChronoUnit.DAYS);
        Map<String, QualityWindow> current = summarize(fills.qualityWindow(currentStart, currentEnd));
        Map<String, QualityWindow> baseline = summarize(fills.qualityWindow(baselineStart, currentStart));
        return detect(current, baseline, configuredSampleFloor, configuredDropPoints * 100);
    }

    /** Pure threshold logic: current seven complete days versus the preceding 28 complete days. */
    static List<RegressionAlert> detect(Map<String, QualityWindow> current, Map<String, QualityWindow> baseline) {
        return detect(current, baseline, SAMPLE_FLOOR, DROP_THRESHOLD_BP);
    }

    static List<RegressionAlert> detect(
        Map<String, QualityWindow> current,
        Map<String, QualityWindow> baseline,
        int sampleFloor,
        int dropThresholdBp
    ) {
        List<RegressionAlert> out = new ArrayList<>();
        for (Map.Entry<String, QualityWindow> entry : current.entrySet()) {
            QualityWindow recent = entry.getValue();
            QualityWindow old = baseline.get(entry.getKey());
            if (old == null || recent.fills() < sampleFloor) continue;
            int drop = old.fillRateBp() - recent.fillRateBp();
            if (drop > dropThresholdBp) {
                out.add(new RegressionAlert(
                    entry.getKey(), recent.fills(), recent.fillRateBp(), old.fillRateBp(), drop,
                    fixturePathFor(entry.getKey())
                ));
            }
        }
        return out.stream().sorted((a, b) -> Integer.compare(b.dropBp(), a.dropBp())).toList();
    }

    private void rollup(LocalDate day) {
        Instant from = day.atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant to = day.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        for (FillQualityWindowRow row : fills.qualityWindow(from, to)) {
            String version = row.extVersion() == null ? "" : row.extVersion();
            FillQualityDaily target = daily.findOneByDayAndAtsAndAdapterAndExtVersion(day, row.ats(), row.adapter(), version)
                .orElseGet(FillQualityDaily::new);
            target.setDay(day);
            target.setAts(row.ats());
            target.setAdapter(row.adapter());
            target.setExtVersion(version);
            target.setFills(nz(row.fills()));
            target.setFieldsFound(nz(row.fieldsFound()));
            target.setFieldsFilled(nz(row.fieldsFilled()));
            target.setFillsWithRequiredGaps(nz(row.fillsWithRequiredGaps()));
            target.setFillRateBp(rateBp(target.getFieldsFilled(), target.getFieldsFound()));
            target.setGapRateBp(rateBp(target.getFillsWithRequiredGaps(), target.getFills()));
            daily.save(target);
        }
    }

    private void notifyAdmins(List<RegressionAlert> alerts, LocalDate day, Instant now) {
        if (alerts.isEmpty()) return;
        List<Long> adminIds = users.findPersonalUserIdsByAuthority(AuthoritiesConstants.ADMIN);
        for (RegressionAlert alert : alerts) {
            LOG.warn("{} ats={} fills7={} rate7={} baseline28={} drop={}bp fixture={}", ALERT_KIND, alert.ats(), alert.fills7(), pct(alert.rate7Bp()), pct(alert.baseline28Bp()), alert.dropBp(), alert.fixturePath());
            String dedupe = "autofill-quality:" + day + ":" + alert.ats();
            for (Long adminId : adminIds) {
                notifications.publish(
                    NotificationKind.SYSTEM,
                    adminId,
                    new NotificationService.Payload(
                        ALERT_KIND + ": Autofill quality dropped: " + alert.ats(),
                        "7-day fill rate " + pct(alert.rate7Bp()) + " vs 28-day baseline " + pct(alert.baseline28Bp()) +
                        ". Inspect " + alert.fixturePath() + " before changing the adapter.",
                        "/admin/analytics",
                        null,
                        ALERT_KIND + ":" + alert.ats(),
                        dedupe,
                        null,
                        false,
                        null
                    ),
                    now
                );
            }
        }
    }

    private static String fixturePathFor(String ats) {
        return switch (String.valueOf(ats).toLowerCase(Locale.ROOT)) {
            case "lever" -> "test/fixtures/job-capture/lever-rover-apply.html";
            default -> FIXTURE_ROOT + String.valueOf(ats).toLowerCase(Locale.ROOT) + "/";
        };
    }

    private static Map<String, QualityWindow> summarize(List<FillQualityWindowRow> rows) {
        Map<String, MutableWindow> sums = new HashMap<>();
        for (FillQualityWindowRow row : rows) {
            MutableWindow sum = sums.computeIfAbsent(row.ats(), ignored -> new MutableWindow());
            sum.fills += nz(row.fills());
            sum.fieldsFound += nz(row.fieldsFound());
            sum.fieldsFilled += nz(row.fieldsFilled());
            sum.fillsWithRequiredGaps += nz(row.fillsWithRequiredGaps());
        }
        Map<String, QualityWindow> out = new HashMap<>();
        sums.forEach((ats, sum) -> out.put(ats, new QualityWindow(sum.fills, sum.fieldsFound, sum.fieldsFilled, sum.fillsWithRequiredGaps)));
        return out;
    }

    private static int rateBp(long part, long whole) {
        return whole <= 0 ? 0 : (int) Math.round((part * 10_000.0) / whole);
    }

    private static String pct(int basisPoints) {
        return String.format(Locale.ROOT, "%.1f%%", basisPoints / 100.0);
    }

    private static long nz(Long value) { return value == null ? 0L : value; }

    private static final class MutableWindow {
        long fills;
        long fieldsFound;
        long fieldsFilled;
        long fillsWithRequiredGaps;
    }
}
