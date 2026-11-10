package com.dossier.api.repository;

/**
 * Aggregates over the {@code ai_call} ledger for the admin recent-calls panel (I1.11): JPQL constructor
 * projections, kept with the repository (ArchUnit: persistence may not reach into the service layer).
 */
public final class AiCallStatRow {

    private AiCallStatRow() {}

    /** One group's call count, failures and cost (successful calls only; failures cost 0). */
    public record Group(String key, Long calls, Long failed, Long costMicros) {}

    /** The whole window's call count, failures and cost. */
    public record Totals(Long calls, Long failed, Long costMicros) {}

    /** One call's provider and latency, to compute a percentile in memory. */
    public record Latency(String provider, Integer latencyMs) {}
}
