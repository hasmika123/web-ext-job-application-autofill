package com.dossier.api.service;

import com.dossier.api.domain.BugReport;
import com.dossier.api.domain.enumeration.BugCategory;
import com.dossier.api.domain.enumeration.BugSeverity;
import com.dossier.api.domain.enumeration.BugStatus;
import com.dossier.api.repository.BugReportRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.BugReportDTO;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Bug-report intake + triage (Phase 9.A5). Submission is public (auth optional — the login is
 * filled from the principal when present); diagnostic context is only stored when the reporter
 * consented (the caller passes null otherwise). A best-effort email notifies support@ on each new
 * report. Admin triage (status/severity/notes) is audited.
 */
@Service
@Transactional
public class BugReportService {

    private static final Logger LOG = LoggerFactory.getLogger(BugReportService.class);
    private static final int MAX_MESSAGE = 4000;

    private final BugReportRepository repository;
    private final MailService mailService;
    private final AdminAuditService auditService;
    private final String notifyEmail;

    public BugReportService(
        BugReportRepository repository,
        MailService mailService,
        AdminAuditService auditService,
        @Value("${dossier.bug-report.notify-email:support@kiwiply.com}") String notifyEmail
    ) {
        this.repository = repository;
        this.mailService = mailService;
        this.auditService = auditService;
        this.notifyEmail = notifyEmail;
    }

    /** Diagnostic fields are null unless the reporter consented. */
    public void submit(String source, String message, String categoryStr, String email, String url, String appVersion, String userAgent) {
        String msg = message == null ? "" : message.trim();
        if (msg.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A message is required.");
        }
        if (msg.length() > MAX_MESSAGE) {
            msg = msg.substring(0, MAX_MESSAGE);
        }

        BugReport b = new BugReport();
        b.setSource(source == null || source.isBlank() ? "web" : source.trim());
        b.setUserLogin(SecurityUtils.getCurrentUserLogin().orElse(null));
        b.setEmail(email == null || email.isBlank() ? null : email.trim());
        b.setMessage(msg);
        b.setCategory(parseCategory(categoryStr));
        b.setStatus(BugStatus.NEW);
        b.setUrl(trimTo(url, 2048));
        b.setAppVersion(trimTo(appVersion, 50));
        b.setUserAgent(trimTo(userAgent, 512));
        b.setCreatedDate(Instant.now());
        BugReport saved = repository.save(b);
        LOG.info("Bug report #{} received (source={}, category={})", saved.getId(), saved.getSource(), saved.getCategory());

        notifySupport(saved);
    }

    @Transactional(readOnly = true)
    public Page<BugReportDTO> findAll(BugStatus status, Pageable pageable) {
        Page<BugReport> page = status == null ? repository.findAll(pageable) : repository.findAllByStatus(status, pageable);
        return page.map(BugReportDTO::new);
    }

    @Transactional(readOnly = true)
    public BugReportDTO get(Long id) {
        return repository.findById(id).map(BugReportDTO::new).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such report"));
    }

    public long count(BugStatus status) {
        return repository.countByStatus(status);
    }

    /** Admin triage update — status required; severity/notes optional. Audited. */
    public BugReportDTO updateTriage(Long id, BugStatus status, BugSeverity severity, String adminNotes) {
        BugReport b = repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such report"));
        if (status != null) {
            b.setStatus(status);
        }
        b.setSeverity(severity);
        b.setAdminNotes(adminNotes == null ? null : adminNotes.trim());
        BugReport saved = repository.save(b);
        auditService.record(
            AdminAuditService.BUG_TRIAGE_UPDATE,
            AdminAuditService.TARGET_BUG_REPORT,
            String.valueOf(id),
            null,
            "status=" + saved.getStatus() + (severity != null ? ", severity=" + severity : "")
        );
        return new BugReportDTO(saved);
    }

    private void notifySupport(BugReport b) {
        if (notifyEmail == null || notifyEmail.isBlank()) {
            return;
        }
        String who = b.getUserLogin() != null ? b.getUserLogin() : (b.getEmail() != null ? b.getEmail() : "anonymous");
        String html =
            "<p><strong>New " + b.getCategory() + " report</strong> (" + b.getSource() + ") from " + escape(who) + "</p>" +
            "<p>" + escape(b.getMessage()).replace("\n", "<br>") + "</p>" +
            (b.getUrl() != null ? "<p>URL: " + escape(b.getUrl()) + "</p>" : "") +
            (b.getAppVersion() != null ? "<p>Version: " + escape(b.getAppVersion()) + "</p>" : "") +
            "<p style=\"color:#888;font-size:12px\">Triage at the admin console → Bug reports.</p>";
        // Best-effort + async (MailService); a mail failure must not fail the submission.
        mailService.sendEmail(notifyEmail, "[Kiwiply " + b.getCategory() + "] report from " + who, html, false, true);
    }

    private static BugCategory parseCategory(String s) {
        if (s == null) return BugCategory.BUG;
        try {
            return BugCategory.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return BugCategory.BUG;
        }
    }

    private static String trimTo(String s, int max) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
