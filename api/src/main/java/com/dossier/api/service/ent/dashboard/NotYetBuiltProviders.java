package com.dossier.api.service.ent.dashboard;

import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The board's panels whose module has no tables yet. Each answers "not enabled" with no number, so the page shows the honest
 * "Available when ... launches" state and never a zero. When a module ships, its story replaces the nested class with a real
 * provider under the same key (and the same board order).
 */
public final class NotYetBuiltProviders {

    private NotYetBuiltProviders() {}

    /** Open applications tile (Applications module). */
    @Component
    public static class Applications extends NotYetBuiltProvider {

        public Applications() {
            super("applications.active", 30, List.of("member.view_summary", "pipeline.view"), "applications");
        }
    }

    /** Upcoming interviews tile (Interviews module). */
    @Component
    public static class Interviews extends NotYetBuiltProvider {

        public Interviews() {
            super("interviews.upcoming", 40, List.of("member.view_summary", "pipeline.view"), "interviews");
        }
    }

    /** Active placements tile (Placements module). */
    @Component
    public static class Placements extends NotYetBuiltProvider {

        public Placements() {
            super("placements", 50, List.of("placements.view", "member.view_summary"), "placements");
        }
    }

    /** Monthly spend tile (HR and Finance module: the board's "Monthly Spend"). */
    @Component
    public static class Finance extends NotYetBuiltProvider {

        public Finance() {
            super("finance.summary", 60, List.of("finance.view", "billing.view"), "hrFinance");
        }
    }

    /** Team performance chart (Analytics module). */
    @Component
    public static class TeamPerformance extends NotYetBuiltProvider {

        public TeamPerformance() {
            super("team.performance", 70, List.of("reports.view"), "analytics");
        }
    }

    /** Pipeline overview donut (Applications module). */
    @Component
    public static class PipelineOverview extends NotYetBuiltProvider {

        public PipelineOverview() {
            super("pipeline.overview", 80, List.of("pipeline.view", "member.view_summary"), "applications");
        }
    }
}
