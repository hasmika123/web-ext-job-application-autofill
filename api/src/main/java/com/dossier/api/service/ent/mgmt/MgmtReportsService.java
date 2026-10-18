package com.dossier.api.service.ent.mgmt;

import com.dossier.api.service.dto.ent.ReportsDTO;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.reports.OrgReportsExportService;
import com.dossier.api.service.ent.reports.OrgReportsService;
import com.dossier.api.service.org.OrgMembership;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Manager's Reports (MM-08): the Org Admin overview projected to the manager's team, and its CSV. There is no second report: the figures are
 * {@link OrgReportsService#overview(OrgMembership, String, TeamScope.View)} over the consultants the team's marketers carry (and the team's marketers), the CSV is
 * {@link OrgReportsExportService} and writes the same audited {@code EXPORT} row. Needs {@code reports.view} at TEAM scope or wider (and the team key
 * {@code workload.view}); everyone else, and another organization, gets the generic 404. A manager with no marketer in scope gets zeros, not a 404.
 */
@Service
public class MgmtReportsService {

    public static final String KEY = "reports.view";

    private final TeamScope teamScope;
    private final OrgReportsService reports;
    private final OrgReportsExportService exports;

    public MgmtReportsService(TeamScope teamScope, OrgReportsService reports, OrgReportsExportService exports) {
        this.teamScope = teamScope;
        this.reports = reports;
        this.exports = exports;
    }

    @Transactional(readOnly = true)
    public ReportsDTO.Overview overview(OrgMembership me, String range) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY);
        return reports.overview(me, range, team);
    }

    @Transactional
    public String exportCsv(OrgMembership me, String range) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY);
        return exports.exportCsv(me, range, team);
    }
}
