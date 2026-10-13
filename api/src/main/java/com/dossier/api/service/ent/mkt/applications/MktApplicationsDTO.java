package com.dossier.api.service.ent.mkt.applications;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * The Marketing > Applications board, in one response (like Home). A detail the consultant has not shared (consent below FULL) is
 * {@code null} and the row says so in {@code consent}; a consultant who shares NOTHING is not in any list or count ({@code notShared}).
 */
public final class MktApplicationsDTO {

    private MktApplicationsDTO() {}

    public record Person(Long id, String name, String avatarUrl) {}

    /** consent: FULL or SUMMARY (NONE never appears; those consultants are left out and counted in {@code notShared}). */
    public record Consultant(Long id, String name, String avatarUrl, String consent) {}

    public record StageRef(String key, String label) {}

    public record Row(
        Long id, String code, Consultant consultant, String role, String client, String source, LocalDate appliedOn, StageRef stage,
        Person owner, String nextAction, LocalDate nextActionDue
    ) {}

    public record Kpi(String key, long value, Double deltaPct, List<Long> sparkline) {}

    public record Tab(String key, String label, long count) {}

    public record Option(Long id, String name) {}

    public record Filters(List<Option> consultants, List<Option> clients) {}

    public record Tracker(List<Row> items, long total, int page, int size, List<Tab> tabs, Filters filters, int notShared) {}

    public record FunnelStageRow(String key, String label, long count, int pct) {}

    public record Funnel(String period, long total, List<FunnelStageRow> stages) {}

    public record Overdue(Long id, Consultant consultant, String title, String sub, long daysOverdue) {}

    /** tone: blue | violet | amber | green | red (the board's dot colours). */
    public record Update(Long id, Long applicationId, Consultant consultant, String text, String detail, Instant at, String tone) {}

    public record Perms(boolean followups, boolean record) {}

    public record Response(List<Kpi> kpis, Tracker tracker, Funnel funnel, List<Overdue> overdue, long overdueTotal, List<Update> updates, Perms perms) {}

    /** Query of the board. {@code stage} is a group key or "all"; {@code period}/{@code funnelPeriod} are 1m|3m|6m|12m|all; {@code sort} is appliedOn,asc|desc. */
    public record Query(String q, Long consultantId, Long clientId, String stage, String period, String funnelPeriod, String sort, int page, int size) {}

    public record NoteRequest(String body) {}

    public record NextActionRequest(String nextAction, LocalDate dueDate) {}

    public record StageRequest(String stage, String reason) {}
}
