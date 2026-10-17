package com.dossier.api.web.rest.privacy;

import com.dossier.api.domain.privacy.AccountDeletionReport;
import com.dossier.api.domain.privacy.AccountDeletionRequest;
import com.dossier.api.domain.privacy.RetentionRun;
import com.dossier.api.repository.privacy.AccountDeletionReportRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.privacy.AccountDeletionRequestService;
import com.dossier.api.service.privacy.DataMap;
import com.dossier.api.service.privacy.RetentionService;
import com.dossier.api.service.privacy.RetentionTarget;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Platform-admin view of privacy operations (sprint 2, B2): the retention jobs (windows, last runs, a dry-run-by-default manual trigger), the purge
 * reports of finished erasures, the pending erasures, and the data map. ADMIN authority only; the windows themselves are edited on the settings page
 * (area {@code privacy}). Nothing here carries a login, e-mail or name of a deleted person: reports hold a former numeric id and counts.
 */
@RestController
@RequestMapping("/api/admin/privacy")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class AdminPrivacyResource {

    private final RetentionService retention;
    private final ResumeBuilderSettings settings;
    private final AccountDeletionReportRepository reports;
    private final AccountDeletionRequestService deletionRequests;

    public AdminPrivacyResource(RetentionService retention, ResumeBuilderSettings settings, AccountDeletionReportRepository reports, AccountDeletionRequestService deletionRequests) {
        this.retention = retention;
        this.settings = settings;
        this.reports = reports;
        this.deletionRequests = deletionRequests;
    }

    @GetMapping("/retention")
    public Map<String, Object> retention() {
        List<Map<String, Object>> jobs = new ArrayList<>();
        for (RetentionTarget t : retention.targets()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("job", t.job());
            m.put("table", t.table());
            m.put("settingKey", t.settingKey());
            m.put("window", retention.window(t));
            m.put("unit", t.unit());
            m.put("description", t.description());
            List<RetentionRun> last = retention.recent(t.job(), 1);
            m.put("lastRun", last.isEmpty() ? null : runView(last.get(0)));
            jobs.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", settings.getBool(AdminSettingKeys.PRIVACY_RETENTION_ENABLED));
        out.put("dryRun", settings.getBool(AdminSettingKeys.PRIVACY_RETENTION_DRY_RUN));
        out.put("jobs", jobs);
        return out;
    }

    /** Runs one job (or all) now. {@code dryRun} defaults to TRUE: a real purge has to be asked for with {@code dryRun=false}. */
    @PostMapping("/retention/run")
    public List<RetentionService.Result> run(@RequestParam(name = "job", required = false) String job, @RequestParam(name = "dryRun", defaultValue = "true") boolean dryRun) {
        String actor = SecurityUtils.getCurrentUserLogin().orElse(null);
        Instant now = Instant.now();
        if (job == null || job.isBlank()) return retention.runAll(RetentionService.TRIGGER_ADMIN, actor, dryRun, now);
        RetentionTarget t = retention.target(job).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown job"));
        return List.of(retention.run(t, RetentionService.TRIGGER_ADMIN, actor, dryRun, now));
    }

    @GetMapping("/retention/runs")
    public List<Map<String, Object>> runs(@RequestParam(name = "job", required = false) String job, @RequestParam(name = "limit", defaultValue = "50") int limit) {
        return retention.recent(job, limit).stream().map(AdminPrivacyResource::runView).toList();
    }

    @GetMapping("/deletion-reports")
    public List<Map<String, Object>> deletionReports(@RequestParam(name = "limit", defaultValue = "50") int limit) {
        return reports.findAllByOrderByIdDesc(PageRequest.of(0, Math.max(1, Math.min(limit, 200)))).stream().map(AdminPrivacyResource::reportView).toList();
    }

    @GetMapping("/deletion-requests")
    public List<Map<String, Object>> pendingDeletions(@RequestParam(name = "limit", defaultValue = "50") int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (AccountDeletionRequest r : deletionRequests.pending(limit)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("accountId", r.getUserId());
            m.put("source", r.getSource());
            m.put("requestedAt", r.getRequestedAt());
            m.put("purgeAfter", r.getPurgeAfter());
            m.put("attempts", r.getAttempts());
            m.put("lastError", r.getLastError());
            out.add(m);
        }
        return out;
    }

    /** The data map: every table that holds a user or organization reference, how it is erased and exported, and its retention job. */
    @GetMapping("/data-map")
    public List<Map<String, Object>> dataMap() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (DataMap.Entry e : DataMap.entries().values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("table", e.table());
            m.put("class", e.cls());
            m.put("erasure", e.erasure());
            m.put("exportSection", e.exportSection());
            m.put("exportNote", e.exportNote());
            m.put("retentionJob", e.retentionJob());
            out.add(m);
        }
        return out;
    }

    private static Map<String, Object> runView(RetentionRun r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("job", r.getJob());
        m.put("trigger", r.getTriggerKind());
        m.put("actor", r.getActor());
        m.put("dryRun", r.isDryRun());
        m.put("status", r.getStatus());
        m.put("window", r.getWindowValue());
        m.put("unit", r.getWindowUnit());
        m.put("cutoffAt", r.getCutoffAt());
        m.put("candidates", r.getCandidates());
        m.put("deleted", r.getDeleted());
        m.put("note", r.getNote());
        m.put("startedAt", r.getStartedAt());
        m.put("finishedAt", r.getFinishedAt());
        return m;
    }

    private static Map<String, Object> reportView(AccountDeletionReport r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("formerAccountId", r.getSubjectRef());
        m.put("accountKind", r.getAccountKind());
        m.put("orgId", r.getOrgId());
        m.put("source", r.getSource());
        m.put("status", r.getStatus());
        m.put("requestedAt", r.getRequestedAt());
        m.put("executedAt", r.getExecutedAt());
        m.put("residueCount", r.getResidueCount());
        m.put("steps", r.getSteps());
        return m;
    }
}
