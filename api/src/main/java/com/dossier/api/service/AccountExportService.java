package com.dossier.api.service;

import com.dossier.api.domain.User;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.BugReportRepository;
import com.dossier.api.repository.SalesInquiryRepository;
import com.dossier.api.service.privacy.TermsAcceptanceService;
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
    private final NotificationPreferenceService notificationPreferenceService;
    private final ResumeBuilderDataService resumeBuilderDataService;
    private final OrgMembershipPrivacyService orgMembershipPrivacyService;
    private final TrackerDataService trackerDataService;
    private final com.dossier.api.service.jobs.JobSearchDataService jobSearchDataService;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;
    private final BugReportRepository bugReportRepository;
    private final SalesInquiryRepository salesInquiryRepository;
    private final TermsAcceptanceService termsAcceptanceService;

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
        NotificationPreferenceService notificationPreferenceService,
        ResumeBuilderDataService resumeBuilderDataService,
        OrgMembershipPrivacyService orgMembershipPrivacyService,
        TrackerDataService trackerDataService,
        com.dossier.api.service.jobs.JobSearchDataService jobSearchDataService,
        com.fasterxml.jackson.databind.ObjectMapper mapper,
        BugReportRepository bugReportRepository,
        SalesInquiryRepository salesInquiryRepository,
        TermsAcceptanceService termsAcceptanceService
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
        this.notificationPreferenceService = notificationPreferenceService;
        this.resumeBuilderDataService = resumeBuilderDataService;
        this.orgMembershipPrivacyService = orgMembershipPrivacyService;
        this.trackerDataService = trackerDataService;
        this.jobSearchDataService = jobSearchDataService;
        this.mapper = mapper;
        this.bugReportRepository = bugReportRepository;
        this.salesInquiryRepository = salesInquiryRepository;
        this.termsAcceptanceService = termsAcceptanceService;
    }

    /**
     * The export of ONE named account, for an administrator to hand over when the person can no longer sign in (an offboarded enterprise account within
     * its retention window, decision O4 phase S8). It is the person's own export, assembled by acting as that account for the duration of the call: every
     * section is read by the account's login, so nothing of any other account (a personal one with the same address included) can appear. The previous
     * security context is restored in every case.
     */
    public Map<String, Object> exportAccount(String login) {
        org.springframework.security.core.context.SecurityContext previous = org.springframework.security.core.context.SecurityContextHolder.getContext();
        org.springframework.security.core.context.SecurityContext acting = org.springframework.security.core.context.SecurityContextHolder.createEmptyContext();
        acting.setAuthentication(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(login, null, java.util.List.of()));
        org.springframework.security.core.context.SecurityContextHolder.setContext(acting);
        try {
            return exportCurrentUser();
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.setContext(previous);
        }
    }

    public Map<String, Object> exportCurrentUser() {
        User u = userService
            .getUserWithAuthorities()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));

        Map<String, Object> account = new LinkedHashMap<>();
        account.put("login", com.dossier.api.config.Constants.isEnterpriseLogin(u.getLogin()) ? null : u.getLogin()); // the synthetic ent# login is never shown
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
        // Change audit (U6.15): "added by" / "last changed by" as labels resolved now, never an account id or an enterprise login.
        out.put("applications", trackerDataService.withActorLabels(applicationSyncService.listApplications(), u.getId()));
        // APP-E2E U6.1: the tracker's memory - timeline events, notes and interviews.
        out.putAll(trackerDataService.exportForUser(u.getId()));
        // E2E-U4.0: what the user hid in job search.
        out.putAll(jobSearchDataService.exportForUser(u.getId()));
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
        // E2E-U7.0: which notifications reach the user (the switches, quiet hours, time zone); null when never saved.
        out.put("notificationPreferences", notificationPreferenceService.exportCurrentUser());
        // Org tenant model (O1.3): the organizations the user belongs to / belonged to, with role, state, dates and what they share (O6.1).
        out.put("organizations", orgMembershipPrivacyService.exportFor(u.getId(), u.getLogin()));
        out.put("aiAnswers", aiAnswerRepository.findByUserIsCurrentUser().stream().map(aiAnswerMapper::toDto).toList());
        // B2 (data map, T1.2): what the person wrote to us (bug reports, contact-us messages; staff notes on them are not included) and which terms they accepted.
        out.put("bugReports", bugReportRepository.findByUserLoginOrderByIdAsc(u.getLogin()).stream().map(b -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("source", b.getSource());
            m.put("category", b.getCategory());
            m.put("severity", b.getSeverity());
            m.put("status", b.getStatus());
            m.put("message", b.getMessage());
            m.put("url", b.getUrl());
            m.put("appVersion", b.getAppVersion());
            m.put("createdDate", b.getCreatedDate());
            return m;
        }).toList());
        out.put("salesInquiries", salesInquiryRepository.findByUserLoginOrderByIdAsc(u.getLogin()).stream().map(i -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("topic", i.getTopic());
            m.put("name", i.getName());
            m.put("email", i.getEmail());
            m.put("company", i.getCompany());
            m.put("message", i.getMessage());
            m.put("createdDate", i.getCreatedDate());
            return m;
        }).toList());
        out.put("termsAcceptance", termsAcceptanceService.exportFor(u.getId()));
        return com.dossier.api.config.Constants.isEnterpriseLogin(u.getLogin()) ? withoutSyntheticLogin(out, u.getLogin()) : out;
    }

    /**
     * An enterprise account's login (ent#&lt;org&gt;#&lt;address&gt;) is an internal key, never shown to anyone: wherever the assembled export repeats it (the
     * nested owner of a resume, for one), the value is blanked. Done on the JSON tree so no section has to know about it.
     */
    private Map<String, Object> withoutSyntheticLogin(Map<String, Object> out, String login) {
        com.fasterxml.jackson.databind.JsonNode tree = mapper.valueToTree(out);
        blank(tree, login);
        return mapper.convertValue(tree, new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {});
    }

    private static void blank(com.fasterxml.jackson.databind.JsonNode node, String login) {
        if (node.isObject()) {
            com.fasterxml.jackson.databind.node.ObjectNode object = (com.fasterxml.jackson.databind.node.ObjectNode) node;
            java.util.List<String> names = new java.util.ArrayList<>();
            object.fieldNames().forEachRemaining(names::add);
            for (String name : names) {
                com.fasterxml.jackson.databind.JsonNode child = object.get(name);
                if (child.isTextual() && login.equals(child.asText())) object.putNull(name);
                else blank(child, login);
            }
        } else if (node.isArray()) {
            for (com.fasterxml.jackson.databind.JsonNode child : node) blank(child, login);
        }
    }
}
