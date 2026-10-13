package com.dossier.api.service.ent.dashboard;

import com.dossier.api.repository.ent.OrgDashboardRepository;
import com.dossier.api.service.dto.ent.DashboardDTO.Pipeline;
import com.dossier.api.service.dto.ent.DashboardDTO.Series;
import com.dossier.api.service.dto.ent.DashboardDTO.Slice;
import com.dossier.api.service.dto.ent.DashboardDTO.StatTile;
import com.dossier.api.service.dto.ent.DashboardDTO.TeamPerformance;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * The talent-backed dashboard widgets (design/enterprise-talent/dashboard.png; formulas in talent-foundation.md section 5). Each
 * replaces a "not built yet" placeholder under the same key and board position. Real rows only: an organization with no rows
 * for a widget gets an {@code empty} widget with a reason, never a zero chart. Every figure is a count over one organization.
 */
public final class TalentWidgets {

    private TalentWidgets() {}

    /** Open applications: not CLOSED. Previous = the same count 30 days ago, replayed from the CREATED and CLOSED events. */
    @Component
    public static class Applications implements DashboardWidgetProvider {

        static final List<String> PERMISSIONS = List.of("member.view_summary", "pipeline.view");

        @Override
        public String key() {
            return "applications.active";
        }

        @Override
        public int order() {
            return 30;
        }

        @Override
        public List<String> permissions() {
            return PERMISSIONS;
        }

        @Override
        public String module() {
            return null;
        }

        @Override
        public WidgetResult compute(DashboardContext ctx) {
            OrgDashboardRepository repo = ctx.repo();
            Long org = ctx.orgId();
            if (repo.applicationStageCounts(org).isEmpty()) return WidgetResult.empty("NO_APPLICATIONS");
            long value = repo.countOpenApplications(org);
            long previous = repo.countOpenApplicationsAt(org, ctx.now().minus(Duration.ofDays(30)));
            List<Long> spark = TalentTiles.spark(TalentTiles.monthlyMarks(ctx.now()), value, t -> repo.countOpenApplicationsAt(org, t));
            return WidgetResult.ok(TalentTiles.tile(value, previous, spark, "30d", new LinkedHashMap<>()));
        }
    }

    /** Upcoming interviews: SCHEDULED in the next 7 days. Previous = the 7 days before now (completed and scheduled). */
    @Component
    public static class Interviews implements DashboardWidgetProvider {

        private static final List<String> HELD = List.of("SCHEDULED", "COMPLETED");

        @Override
        public String key() {
            return "interviews.upcoming";
        }

        @Override
        public int order() {
            return 40;
        }

        @Override
        public List<String> permissions() {
            return Applications.PERMISSIONS;
        }

        @Override
        public String module() {
            return null;
        }

        @Override
        public WidgetResult compute(DashboardContext ctx) {
            OrgDashboardRepository repo = ctx.repo();
            Long org = ctx.orgId();
            Instant now = ctx.now();
            Duration week = Duration.ofDays(7);
            long value = repo.countInterviews(org, now, now.plus(week), List.of("SCHEDULED"));
            long previous = repo.countInterviews(org, now.minus(week), now, HELD);
            List<Long> spark = new ArrayList<>();
            for (int j = 7; j >= 1; j--) spark.add(repo.countInterviews(org, now.minus(week.multipliedBy(j)), now.minus(week.multipliedBy(j - 1L)), HELD));
            spark.add(value);
            if (value == 0 && previous == 0 && TalentTiles.allZero(spark)) return WidgetResult.empty("NO_INTERVIEWS");
            Map<String, Long> counts = new LinkedHashMap<>();
            counts.put("clients", repo.countInterviewClients(org, now, now.plus(week)));
            return WidgetResult.ok(TalentTiles.tile(value, previous, spark, "7d", counts));
        }
    }

    /** Active placements: status ACTIVE. Previous = placements running 30 days ago. */
    @Component
    public static class Placements implements DashboardWidgetProvider {

        @Override
        public String key() {
            return "placements";
        }

        @Override
        public int order() {
            return 50;
        }

        @Override
        public List<String> permissions() {
            return List.of("placements.view", "member.view_summary");
        }

        @Override
        public String module() {
            return null;
        }

        @Override
        public WidgetResult compute(DashboardContext ctx) {
            OrgDashboardRepository repo = ctx.repo();
            Long org = ctx.orgId();
            long value = repo.countActivePlacements(org);
            long previous = repo.countPlacementsActiveOn(org, TalentTiles.day(ctx.now().minus(Duration.ofDays(30))));
            List<Long> spark = TalentTiles.spark(TalentTiles.monthlyMarks(ctx.now()), value, t -> repo.countPlacementsActiveOn(org, TalentTiles.day(t)));
            if (value == 0 && previous == 0 && TalentTiles.allZero(spark)) return WidgetResult.empty("NO_PLACEMENTS");
            return WidgetResult.ok(TalentTiles.tile(value, previous, spark, "30d", new LinkedHashMap<>()));
        }
    }

    /** Monthly spend: the recorded ledger for this calendar month (record only, nothing moves money). */
    @Component
    public static class Finance implements DashboardWidgetProvider {

        @Override
        public String key() {
            return "finance.summary";
        }

        @Override
        public int order() {
            return 60;
        }

        @Override
        public List<String> permissions() {
            return List.of("finance.view", "billing.view");
        }

        @Override
        public String module() {
            return null;
        }

        @Override
        public WidgetResult compute(DashboardContext ctx) {
            List<YearMonth> months = TalentTiles.lastMonths(ctx.now(), TalentTiles.MARKS);
            List<Object[]> rows = ctx.repo().spendByMonth(ctx.orgId(), months.get(0).atDay(1), months.get(months.size() - 1).atDay(1));
            Map<LocalDate, Long> byMonth = new LinkedHashMap<>();
            String currency = "USD";
            for (Object[] r : rows) {
                byMonth.put((LocalDate) r[0], ((Number) r[1]).longValue());
                if (r[2] != null) currency = r[2].toString();
            }
            YearMonth current = months.get(months.size() - 1);
            if (!byMonth.containsKey(current.atDay(1))) return WidgetResult.empty("NO_SPEND");
            long value = byMonth.get(current.atDay(1));
            long previous = byMonth.getOrDefault(current.minusMonths(1).atDay(1), 0L);
            List<Long> spark = months.stream().map(m -> byMonth.getOrDefault(m.atDay(1), 0L)).toList();
            return WidgetResult.ok(new StatTile(value, previous, TalentTiles.pct(value, previous), spark, "30d", new LinkedHashMap<>(), "money", currency));
        }
    }

    /** Team performance: applications, interviews and placements per calendar month, six months. */
    @Component
    public static class TeamPerformanceWidget implements DashboardWidgetProvider {

        @Override
        public String key() {
            return "team.performance";
        }

        @Override
        public int order() {
            return 70;
        }

        @Override
        public List<String> permissions() {
            return List.of("reports.view", "pipeline.view");
        }

        @Override
        public String module() {
            return null;
        }

        @Override
        public WidgetResult compute(DashboardContext ctx) {
            OrgDashboardRepository repo = ctx.repo();
            Long org = ctx.orgId();
            List<YearMonth> months = TalentTiles.lastMonths(ctx.now(), TalentTiles.MARKS);
            List<String> labels = new ArrayList<>();
            List<Long> apps = new ArrayList<>();
            List<Long> interviews = new ArrayList<>();
            List<Long> placements = new ArrayList<>();
            for (YearMonth m : months) {
                labels.add(m.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
                apps.add(repo.countApplicationsApplied(org, m.atDay(1), m.atEndOfMonth()));
                interviews.add(repo.countInterviews(org, TalentTiles.startOf(m), TalentTiles.startOf(m.plusMonths(1)), List.of("SCHEDULED", "COMPLETED")));
                placements.add(repo.countPlacementsStarted(org, m.atDay(1), m.atEndOfMonth()));
            }
            if (TalentTiles.allZero(apps) && TalentTiles.allZero(interviews) && TalentTiles.allZero(placements)) return WidgetResult.empty("NO_APPLICATIONS");
            return WidgetResult.ok(
                new TeamPerformance(
                    labels,
                    List.of(new Series("applications", "Applications", apps), new Series("interviews", "Interviews", interviews), new Series("placements", "Placements", placements))
                )
            );
        }
    }

    /** Pipeline overview: New (ASSIGNED), In Review (SUBMITTED + UNDER_REVIEW), Interview Scheduled, Offered, Hired (CLOSED as HIRED). */
    @Component
    public static class PipelineWidget implements DashboardWidgetProvider {

        @Override
        public String key() {
            return "pipeline.overview";
        }

        @Override
        public int order() {
            return 80;
        }

        @Override
        public List<String> permissions() {
            return Applications.PERMISSIONS;
        }

        @Override
        public String module() {
            return null;
        }

        @Override
        public WidgetResult compute(DashboardContext ctx) {
            long fresh = 0, review = 0, interviewing = 0, offered = 0, hired = 0;
            for (Object[] r : ctx.repo().applicationStageCounts(ctx.orgId())) {
                String stage = (String) r[0];
                long n = ((Number) r[2]).longValue();
                switch (stage) {
                    case "ASSIGNED" -> fresh += n;
                    case "SUBMITTED", "UNDER_REVIEW" -> review += n;
                    case "INTERVIEWING" -> interviewing += n;
                    case "OFFER" -> offered += n;
                    case "CLOSED" -> {
                        if ("HIRED".equals(r[1])) hired += n;
                    }
                    default -> {}
                }
            }
            long total = fresh + review + interviewing + offered + hired;
            if (total == 0) return WidgetResult.empty("NO_APPLICATIONS");
            List<Slice> slices = List.of(
                slice("new", "New", fresh, total),
                slice("in_review", "In Review", review, total),
                slice("interviewing", "Interview Scheduled", interviewing, total),
                slice("offered", "Offered", offered, total),
                slice("hired", "Hired", hired, total)
            );
            return WidgetResult.ok(new Pipeline(total, slices));
        }

        private static Slice slice(String key, String label, long value, long total) {
            return new Slice(key, label, value, Math.round(value * 1000.0 / total) / 10.0);
        }
    }
}
