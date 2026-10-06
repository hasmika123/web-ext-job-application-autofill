package com.dossier.api.service;

import com.dossier.api.domain.SalesInquiry;
import com.dossier.api.domain.enumeration.InquiryStatus;
import com.dossier.api.repository.SalesInquiryRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.SalesInquiryDTO;
import java.time.Instant;
import java.util.Set;
import java.util.regex.Pattern;
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
 * "Contact us" intake + follow-up (Phase 15.6). Everything on /pricing that isn't sold by checkout
 * yet — Autopilot, organizations, consultancies and the human services — ends in this form.
 * Submission is public (the login is filled from the principal when present); each new request
 * emails sales (best-effort) and lands in the admin queue, where status changes are audited.
 */
@Service
@Transactional
public class SalesInquiryService {

    private static final Logger LOG = LoggerFactory.getLogger(SalesInquiryService.class);

    /** Mirrors the topics in web/src/lib/catalog.ts. Anything else is stored as "other". */
    public static final Set<String> TOPICS = Set.of(
        "autopilot",
        "organization",
        "consultancy",
        "consultancy-ops",
        "resume-review",
        "resume-rewrite",
        "mock-interview",
        "coaching",
        "other"
    );

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final int MAX_MESSAGE = 4000;

    private final SalesInquiryRepository repository;
    private final MailService mailService;
    private final AdminAuditService auditService;
    private final String notifyEmail;

    public SalesInquiryService(
        SalesInquiryRepository repository,
        MailService mailService,
        AdminAuditService auditService,
        @Value("${dossier.sales.notify-email:support@kiwiply.com}") String notifyEmail
    ) {
        this.repository = repository;
        this.mailService = mailService;
        this.auditService = auditService;
        this.notifyEmail = notifyEmail;
    }

    public void submit(String topic, String name, String email, String company, String teamSize, String message) {
        String n = trimTo(name, 120);
        String e = trimTo(email, 254);
        if (n == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A name is required.");
        }
        if (e == null || !EMAIL.matcher(e).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email is required.");
        }

        SalesInquiry s = new SalesInquiry();
        s.setTopic(normalizeTopic(topic));
        s.setName(n);
        s.setEmail(e);
        s.setCompany(trimTo(company, 200));
        s.setTeamSize(trimTo(teamSize, 40));
        s.setMessage(trimTo(message, MAX_MESSAGE));
        s.setUserLogin(SecurityUtils.getCurrentUserLogin().orElse(null));
        s.setStatus(InquiryStatus.NEW);
        s.setCreatedDate(Instant.now());
        SalesInquiry saved = repository.save(s);
        LOG.info("Sales inquiry #{} received (topic={})", saved.getId(), saved.getTopic());

        notifySales(saved);
    }

    @Transactional(readOnly = true)
    public Page<SalesInquiryDTO> findAll(InquiryStatus status, Pageable pageable) {
        Page<SalesInquiry> page = status == null ? repository.findAll(pageable) : repository.findAllByStatus(status, pageable);
        return page.map(SalesInquiryDTO::new);
    }

    @Transactional(readOnly = true)
    public long count(InquiryStatus status) {
        return repository.countByStatus(status);
    }

    /** Admin follow-up — status required, notes optional. Audited. */
    public SalesInquiryDTO update(Long id, InquiryStatus status, String adminNotes) {
        SalesInquiry s = repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such inquiry"));
        s.setStatus(status);
        s.setAdminNotes(trimTo(adminNotes, MAX_MESSAGE));
        SalesInquiry saved = repository.save(s);
        auditService.record(
            AdminAuditService.INQUIRY_UPDATE,
            AdminAuditService.TARGET_SALES_INQUIRY,
            String.valueOf(id),
            null,
            "status=" + saved.getStatus()
        );
        return new SalesInquiryDTO(saved);
    }

    static String normalizeTopic(String topic) {
        if (topic == null) return "other";
        String t = topic.trim().toLowerCase();
        return TOPICS.contains(t) ? t : "other";
    }

    private void notifySales(SalesInquiry s) {
        if (notifyEmail == null || notifyEmail.isBlank()) {
            return;
        }
        String html =
            "<p><strong>New " + escape(s.getTopic()) + " inquiry</strong> from " + escape(s.getName()) + " &lt;" + escape(s.getEmail()) + "&gt;</p>" +
            (s.getCompany() != null ? "<p>Company: " + escape(s.getCompany()) + "</p>" : "") +
            (s.getTeamSize() != null ? "<p>Team size: " + escape(s.getTeamSize()) + "</p>" : "") +
            (s.getMessage() != null ? "<p>" + escape(s.getMessage()).replace("\n", "<br>") + "</p>" : "") +
            "<p style=\"color:#888;font-size:12px\">Follow up from the admin console → Inquiries.</p>";
        // Best-effort + async (MailService); a mail failure must not fail the submission.
        mailService.sendEmail(notifyEmail, "[Kiwiply inquiry] " + s.getTopic() + " — " + s.getName(), html, false, true);
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
