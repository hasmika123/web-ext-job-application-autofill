package com.dossier.api.service;

import com.dossier.api.domain.User;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.service.inbox.InboxService;
import com.dossier.api.service.org.OrgMembershipPrivacyService;
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
    private final ResumeBuilderDataService resumeBuilderDataService;
    private final OrgMembershipPrivacyService orgMembershipPrivacyService;

    public AccountExportService(
        UserService userService,
        ProfileService profileService,
        ApplicationSyncService applicationSyncService,
        FieldCacheSyncService fieldCacheSyncService,
        AiAnswerRepository aiAnswerRepository,
        AiAnswerMapper aiAnswerMapper,
        ProfileSuggestionService profileSuggestionService,
        InboxService inboxService,
        NotificationService notificationService,
        ResumeBuilderDataService resumeBuilderDataService,
        OrgMembershipPrivacyService orgMembershipPrivacyService
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
        this.resumeBuilderDataService = resumeBuilderDataService;
        this.orgMembershipPrivacyService = orgMembershipPrivacyService;
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
        // Resume Builder (R0.1): the Common Profile's structured items and the built documents.
        out.put("profileItems", resumeBuilderDataService.exportProfileItems(u.getId()));
        out.put("resumeDocs", resumeBuilderDataService.exportResumeDocs(u.getId()));
        // R3.11: who the user shared their resumes with (never the link tokens - those are credentials).
        out.put("resumeShares", resumeBuilderDataService.exportResumeShares(u.getId()));
        // Onboarding v2: the unfinished setup draft (the user's own unconfirmed data), or null.
        out.put("onboardingDraft", resumeBuilderDataService.exportOnboardingDraft(u.getId()));
        out.put("profileSuggestions", profileSuggestionService.exportCurrentUser());
        // 14.7 — the connected inbox (never its password) and everything read from it, and notifications.
        out.put("inbox", inboxService.exportCurrentUser());
        out.put("notifications", notificationService.exportCurrentUser());
        // Org tenant model (O1.3): the organizations the user belongs to / belonged to, with role, state and dates.
        out.put("organizations", orgMembershipPrivacyService.exportFor(u.getId()));
        out.put("aiAnswers", aiAnswerRepository.findByUserIsCurrentUser().stream().map(aiAnswerMapper::toDto).toList());
        return out;
    }
}
