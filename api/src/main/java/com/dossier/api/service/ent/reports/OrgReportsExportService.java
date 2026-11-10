package com.dossier.api.service.ent.reports;

import com.dossier.api.service.dto.ent.ReportsDTO;
import com.dossier.api.service.ent.export.CsvSafe;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Reports page as a CSV (X4.9). It is built from {@link OrgReportsService#overview} (so the permission gate, the range rule and the 404 for everyone
 * else are that service's, unchanged), flattened into one table of {@code Section, Item, Value, Detail}, every cell through {@link CsvSafe}, and the export
 * itself writes one {@code EXPORT} audit row. People appear by display name only, exactly as on the page.
 */
@Service
public class OrgReportsExportService {

    private final OrgReportsService reports;
    private final OrgAuditService audit;

    public OrgReportsExportService(OrgReportsService reports, OrgAuditService audit) {
        this.reports = reports;
        this.audit = audit;
    }

    @Transactional
    public String exportCsv(OrgMembership me, String range) {
        ReportsDTO.Overview o = reports.overview(me, range);
        String csv = toCsv(o);
        audit.record(me, OrgAuditService.EXPORT, OrgAuditService.TARGET_REPORT, null, me.orgId().toString(), "overview range=" + o.rangeDays() + "d");
        return csv;
    }

    public static String toCsv(ReportsDTO.Overview o) {
        StringBuilder sb = new StringBuilder(CsvSafe.row("Section", "Item", "Value", "Detail"));
        String range = "Last " + o.rangeDays() + " days";
        if (o.tiles() != null) for (ReportsDTO.Tile t : o.tiles()) sb.append(CsvSafe.row("Overview", t.label(), t.value(), (t.unit() == null ? "" : t.unit() + "; ") + "previous " + (t.previous() == null ? "n/a" : t.previous()) + "; " + range));
        if (o.roster() != null) {
            sb.append(CsvSafe.row("Consultants", "Total", o.roster().total(), ""));
            for (ReportsDTO.Slice s : o.roster().byMarketingStatus()) sb.append(CsvSafe.row("Consultants by marketing status", s.label(), s.count(), ""));
            for (ReportsDTO.Slice s : o.roster().byAvailability()) sb.append(CsvSafe.row("Consultants by availability", s.label(), s.count(), ""));
        }
        if (o.funnel() != null) {
            sb.append(CsvSafe.row("Applications", "Total", o.funnel().total(), "this week " + o.funnel().thisWeek() + "; last week " + o.funnel().lastWeek()));
            for (ReportsDTO.StageRow r : o.funnel().stages()) sb.append(CsvSafe.row("Applications by stage", r.label(), r.count(), "entered this week " + r.enteredThisWeek() + "; last week " + r.enteredLastWeek()));
        }
        if (o.interviews() != null) {
            ReportsDTO.Interviews i = o.interviews();
            sb.append(CsvSafe.row("Interviews", "Scheduled", i.scheduled(), range));
            sb.append(CsvSafe.row("Interviews", "Completed", i.completed(), range));
            sb.append(CsvSafe.row("Interviews", "Cancelled", i.cancelled(), range));
            sb.append(CsvSafe.row("Interviews", "Awaiting outcome", i.awaitingOutcome(), ""));
            sb.append(CsvSafe.row("Interviews", "Upcoming in 14 days", i.upcoming14Days(), ""));
        }
        if (o.placements() != null) {
            ReportsDTO.Placements p = o.placements();
            sb.append(CsvSafe.row("Placements", "Active", p.active(), ""));
            sb.append(CsvSafe.row("Placements", "Started", p.startedInRange(), range));
            sb.append(CsvSafe.row("Placements", "Ended", p.endedInRange(), range));
            for (ReportsDTO.MonthPoint m : p.months()) sb.append(CsvSafe.row("Placements by month", m.month(), m.started(), "ended " + m.ended()));
        }
        if (o.topClients() != null) for (ReportsDTO.ClientRow c : o.topClients()) sb.append(CsvSafe.row("Top clients", c.name(), c.activePlacements(), "running placements"));
        if (o.marketers() != null) for (ReportsDTO.MarketerRow m : o.marketers()) sb.append(CsvSafe.row("Marketer workload", m.name(), m.consultants(), "open opportunities " + m.openOpportunities()));
        if (o.firstSubmission() != null) sb.append(CsvSafe.row("Time to first submission", "Median hours", o.firstSubmission().medianHours(), "sample " + o.firstSubmission().sample()));
        return sb.toString();
    }
}
