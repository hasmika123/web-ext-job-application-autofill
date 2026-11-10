package com.dossier.api.service.ent.mkt.streams;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/** Shapes of {@code /api/orgs/{orgId}/mkt/streams}. A value the data cannot provide is null (never a made-up number). */
public final class MktStreamsDto {

    private MktStreamsDto() {}

    /** A KPI tile: {@code key} is activeStreams | syncHealth | newOpenings | streamErrors; syncHealth is a percent 0-100; {@code deltaPct} null = nothing to compare. */
    public record Kpi(String key, Double value, Double deltaPct, List<Double> sparkline) {}

    public record StreamRow(
        Long id, String sourceLabel, String subtitle, String status, boolean active, int syncEveryMinutes, List<String> keywords, String clientScope,
        Instant lastSyncAt, int newOpenings, Double openingsDeltaPct
    ) {}

    public record StreamPage(List<StreamRow> items, long total, int page, int size) {}

    public record Filters(List<String> sources, List<String> statuses, List<String> clients) {}

    public record SyncRow(Long id, Long streamId, String source, Instant syncedAt, int openings, String status, String message) {}

    /** Per-day openings per stream: {@code days} are ISO dates (UTC), every series has one value per day. */
    public record ChartSeries(String key, String label, List<Integer> values) {}

    public record Chart(List<String> days, List<ChartSeries> series) {}

    public record AlertRow(Long id, String severity, String title, String detail, Instant raisedAt) {}

    public record RuleRow(String key, boolean enabled, String value) {}

    public record View(List<Kpi> kpis, StreamPage streams, Filters filters, List<SyncRow> activity, Chart chart, List<AlertRow> alerts, List<RuleRow> rules) {}

    public record CreateRequest(
        @NotBlank @Size(max = 120) String sourceLabel,
        @Size(max = 160) String subtitle,
        @Min(5) @Max(1440) Integer syncEveryMinutes,
        @Size(max = 2000) String keywords,
        @Size(max = 160) String clientScope
    ) {}

    /** Every field optional: only the ones sent change. An empty string clears {@code subtitle}, {@code keywords} and {@code clientScope}. */
    public record UpdateRequest(
        @Size(max = 120) String sourceLabel,
        @Size(max = 160) String subtitle,
        @Min(5) @Max(1440) Integer syncEveryMinutes,
        @Size(max = 2000) String keywords,
        @Size(max = 160) String clientScope
    ) {}

    public record RuleRequest(Boolean enabled, @Size(max = 2000) String value) {}
}
