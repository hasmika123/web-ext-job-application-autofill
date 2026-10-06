package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ApplicationKeys;
import com.dossier.api.service.ApplicationSyncService;
import com.dossier.api.service.dto.ApplicationDTO;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * What the inbox shows on the board (Phase 14.4b): suggested applications from mail about jobs the
 * board doesn't track, and the emails behind each tracked application.
 *
 * <p>Accepting a suggestion creates the application through the board's own upsert (so its dedup
 * applies), at the stage the mail showed — confirmed for a confirmation, Interview for an invite,
 * Offer for an offer — dated by the mail. Other open suggestions from the same company are folded in
 * with it. Dismissing hides the suggestion and the company's other open ones.
 */
@Service
public class InboxMailService {

    public record SuggestionView(Long id, String company, String role, String category, String subject, String fromName, String fromAddress, Instant sentAt) {}

    public record MailView(
        Long id,
        String direction,
        String subject,
        String fromName,
        String fromAddress,
        Instant sentAt,
        String category,
        String statusChange,
        String classifiedBy,
        String snippet
    ) {}

    static final int SNIPPET = 280;

    private final InboxMessageRepository messages;
    private final ApplicationRepository applications;
    private final ApplicationSyncService applicationSync;
    private final UserRepository users;

    public InboxMailService(
        InboxMessageRepository messages,
        ApplicationRepository applications,
        ApplicationSyncService applicationSync,
        UserRepository users
    ) {
        this.messages = messages;
        this.applications = applications;
        this.applicationSync = applicationSync;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<SuggestionView> suggestions() {
        User u = currentUser();
        return messages
            .findByUserIdAndSuggestionOrderBySentAtDesc(u.getId(), "NEW")
            .stream()
            .map(m ->
                new SuggestionView(m.getId(), m.getCompanyGuess(), m.getRoleGuess(), m.getCategory(), m.getSubject(), m.getFromName(), m.getFromAddress(), m.getSentAt())
            )
            .toList();
    }

    /**
     * Put a suggested job on the board. {@code company}/{@code role} may correct what the mail said;
     * blank keeps it. Returns the application's id.
     */
    @Transactional
    public Long accept(Long messageId, String company, String role) {
        User u = currentUser();
        InboxMessage m = suggestion(u, messageId);
        String c = blank(company) ? m.getCompanyGuess() : company.trim();
        String r = blank(role) ? m.getRoleGuess() : role.trim();
        if (blank(c)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the company's name");
        if (blank(r)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the role");

        ApplicationStatus status = stageOf(InboxParser.category(m.getCategory()));
        ApplicationDTO dto = new ApplicationDTO();
        dto.setCompany(c.length() > 200 ? c.substring(0, 200) : c);
        dto.setRoleTitle(r.length() > 200 ? r.substring(0, 200) : r);
        dto.setStatus(status);
        dto.setSource("inbox");
        if (status != ApplicationStatus.SAVED) dto.setAppliedAt(m.getSentAt() != null ? m.getSentAt() : Instant.now());
        if (MailClassifier.Category.APPLIED.name().equals(m.getCategory())) dto.setSubmissionConfirmed(true);
        Long appId = applicationSync.upsertApplication(dto).getId();

        String key = ApplicationKeys.company(m.getCompanyGuess());
        for (InboxMessage other : messages.findByUserIdAndSuggestionOrderBySentAtDesc(u.getId(), "NEW")) {
            if (other.getId().equals(m.getId()) || (!key.isEmpty() && key.equals(ApplicationKeys.company(other.getCompanyGuess())))) {
                other.setSuggestion("ACCEPTED");
                other.setApplicationId(appId);
            }
        }
        m.setStatusChange(status.name());
        return appId;
    }

    @Transactional
    public void dismiss(Long messageId) {
        User u = currentUser();
        InboxMessage m = suggestion(u, messageId);
        String key = ApplicationKeys.company(m.getCompanyGuess());
        for (InboxMessage other : messages.findByUserIdAndSuggestionOrderBySentAtDesc(u.getId(), "NEW")) {
            if (other.getId().equals(m.getId()) || (!key.isEmpty() && key.equals(ApplicationKeys.company(other.getCompanyGuess())))) {
                other.setSuggestion("DISMISSED");
            }
        }
    }

    /** The emails about one of the user's applications, newest first. 404 for someone else's. */
    @Transactional(readOnly = true)
    public List<MailView> forApplication(Long applicationId) {
        User u = currentUser();
        Application a = applications
            .findById(applicationId)
            .filter(x -> x.getUser() != null && u.getId().equals(x.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such application"));
        return messages
            .findByUserIdAndApplicationIdOrderBySentAtDesc(u.getId(), a.getId())
            .stream()
            .map(m ->
                new MailView(
                    m.getId(),
                    m.getDirection(),
                    m.getSubject(),
                    m.getFromName(),
                    m.getFromAddress(),
                    m.getSentAt(),
                    m.getCategory(),
                    m.getStatusChange(),
                    m.getClassifiedBy(),
                    snippet(m.getBodyText())
                )
            )
            .toList();
    }

    /** The board stage a suggestion's mail shows. */
    static ApplicationStatus stageOf(MailClassifier.Category c) {
        if (c == null) return ApplicationStatus.SAVED;
        return switch (c) {
            case INTERVIEW -> ApplicationStatus.INTERVIEW;
            case OFFER -> ApplicationStatus.OFFER;
            case APPLIED, ASSESSMENT -> ApplicationStatus.APPLIED;
            default -> ApplicationStatus.SAVED;
        };
    }

    private InboxMessage suggestion(User u, Long messageId) {
        InboxMessage m = messages
            .findOneByIdAndUserId(messageId, u.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such suggestion"));
        if (!"NEW".equals(m.getSuggestion())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Already handled");
        return m;
    }

    static String snippet(String body) {
        if (body == null || body.isBlank()) return null;
        String t = body.replaceAll("\\s+", " ").trim();
        return t.length() > SNIPPET ? t.substring(0, SNIPPET - 1) + "…" : t;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
