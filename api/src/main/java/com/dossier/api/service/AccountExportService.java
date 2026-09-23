package com.dossier.api.service;

import com.dossier.api.domain.User;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.service.mapper.AiAnswerMapper;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Self-service DSAR export (Phase 9.X.2): assembles a JSON copy of the CURRENT user's data —
 * account, bio, resume metadata, applications, field cache, and AI answers. Structured data only;
 * resume FILE bytes are not included (a separate, heavier option). Reuses the existing user-scoped
 * services/repos, so it returns exactly the data the user already owns.
 */
@Service
@Transactional(readOnly = true)
public class AccountExportService {

    private final UserService userService;
    private final ProfileService profileService;
    private final ApplicationSyncService applicationSyncService;
    private final FieldCacheSyncService fieldCacheSyncService;
    private final AiAnswerRepository aiAnswerRepository;
    private final AiAnswerMapper aiAnswerMapper;
    private final ProfileSuggestionService profileSuggestionService;
    private final InboxService inboxService;
    private final NotificationService notificationService;

    public AccountExportService(
        UserService userService,
        ProfileService profileService,
        ApplicationSyncService applicationSyncService,
        FieldCacheSyncService fieldCacheSyncService,
        AiAnswerRepository aiAnswerRepository,
        AiAnswerMapper aiAnswerMapper,
        ProfileSuggestionService profileSuggestionService,
        InboxService inboxService,
        NotificationService notificationService
    ) {
        this.userService = userService;
        this.profileService = profileService;
        this.applicationSyncService = applicationSyncService;
        this.fieldCacheSyncService = fieldCacheSyncService;
        this.aiAnswerRepository = aiAnswerRepository;
        this.aiAnswerMapper = aiAnswerMapper;
        this.profileSuggestionService = profileSuggestionService;
        this.inboxService = inboxService;
        this.notificationService = notificationService;
    }

    public Map<String, Object> exportCurrentUser() {
        User u = userService
            .getUserWithAuthorities()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));

        Map<String, Object> account = new LinkedHashMap<>();
        account.put("login", u.getLogin());
        account.put("email", u.getEmail());
        account.put("firstName", u.getFirstName());
        account.put("lastName", u.getLastName());
        account.put("langKey", u.getLangKey());
        account.put("createdDate", u.getCreatedDate());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exportedAt", Instant.now().toString());
        out.put("account", account);
        out.put("bio", profileService.getProfile().orElse(null));
        out.put("resumes", profileService.listResumes());
        out.put("applications", applicationSyncService.listApplications());
        out.put("fieldCache", fieldCacheSyncService.list());
        out.put("profileSuggestions", profileSuggestionService.exportCurrentUser());
        // 14.7 — the connected inbox (never its password) and everything read from it, and notifications.
        out.put("inbox", inboxService.exportCurrentUser());
        out.put("notifications", notificationService.exportCurrentUser());
        out.put("aiAnswers", aiAnswerRepository.findByUserIsCurrentUser().stream().map(aiAnswerMapper::toDto).toList());
        return out;
    }
}
