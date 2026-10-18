package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsCertification;
import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import com.dossier.api.domain.ent.consultantws.CwsProfilePref;
import com.dossier.api.domain.ent.consultantws.CwsSetting;
import com.dossier.api.domain.ent.consultantws.CwsSettingEvent;
import com.dossier.api.domain.ent.consultantws.CwsAvailabilityHistory;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityHistoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsCertificationRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfileDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfilePrefRepository;
import com.dossier.api.repository.ent.consultantws.CwsSettingEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsSettingRepository;
import com.dossier.api.repository.ent.consultantws.CwsWorkPreferenceRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.Account;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.Activity;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.AppearanceRequest;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.CareerPreferences;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.ConnectedToolsTile;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.Documents;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.PrivacyRequest;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.PrivacyTile;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.ProfileStatusTile;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.Settings;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.Tiles;
import com.dossier.api.service.ent.consultantws.ConsultantSettingsDTO.Tool;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Settings page (docs/enterprise-v2/page-consultant-settings.md). Gate: {@link ConsultantHomeService#requireSelf}; no
 * method takes a consultant id from the client. Only privacy and appearance are written here (cws_setting, one row per consultant, plus a
 * cws_setting_event per change). Account facts and career preferences are READ from the profile; password, two-factor and sign-in alerts are
 * not handled here at all (no self-service API exists for tenant members), and no password, token, key or phone number is read, stored or returned.
 * Connected tools have no integrations behind them, so the catalog is returned as NOT_AVAILABLE and nothing is ever "connected".
 */
@Service
public class ConsultantSettingsService {

    public static final String WRITE_PERMISSION = "self.share_scope.set";
    public static final List<String> VISIBILITY = List.of(CwsSetting.ORG_ONLY, CwsSetting.APPROVED_EMPLOYERS, CwsSetting.PRIVATE);
    public static final List<String> THEMES = List.of("LIGHT", "DARK", "SYSTEM");
    /** Stored as labels only: no translation is implied. */
    public static final List<String> LANGUAGES = List.of("en-US", "en-GB", "es-ES", "fr-FR", "de-DE");
    public static final List<Tool> TOOL_CATALOG = List.of(
        new Tool("linkedin", "LinkedIn", "NOT_AVAILABLE"),
        new Tool("google-drive", "Google Drive", "NOT_AVAILABLE"),
        new Tool("github", "GitHub", "NOT_AVAILABLE"),
        new Tool("dropbox", "Dropbox", "NOT_AVAILABLE")
    );
    static final int ACTIVITY_LIMIT = 10;

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final ConsultantProfileRepository consultants;
    private final OrganizationRepository orgs;
    private final CwsSettingRepository settings;
    private final CwsSettingEventRepository events;
    private final CwsProfilePrefRepository profilePrefs;
    private final CwsProfileDetailRepository profileDetails;
    private final CwsCertificationRepository certifications;
    private final CwsWorkPreferenceRepository workPrefs;
    private final CwsAvailabilityHistoryRepository availabilityHistory;
    private final OrgResumeRepository resumes;
    private final Clock clock;

    @Autowired
    public ConsultantSettingsService(
        ConsultantHomeService gate,
        AuthorizationService authorization,
        ConsultantProfileRepository consultants,
        OrganizationRepository orgs,
        CwsSettingRepository settings,
        CwsSettingEventRepository events,
        CwsProfilePrefRepository profilePrefs,
        CwsProfileDetailRepository profileDetails,
        CwsCertificationRepository certifications,
        CwsWorkPreferenceRepository workPrefs,
        CwsAvailabilityHistoryRepository availabilityHistory,
        OrgResumeRepository resumes
    ) {
        this.gate = gate;
        this.authorization = authorization;
        this.consultants = consultants;
        this.orgs = orgs;
        this.settings = settings;
        this.events = events;
        this.profilePrefs = profilePrefs;
        this.profileDetails = profileDetails;
        this.certifications = certifications;
        this.workPrefs = workPrefs;
        this.availabilityHistory = availabilityHistory;
        this.resumes = resumes;
        this.clock = Clock.systemUTC();
    }

    // ---- read -----------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me) {
        return view(gate.requireSelf(me));
    }

    // ---- writes (each answers with the fresh page) -----------------------------------------------------------------

    @Transactional
    public Response setPrivacy(OrgMembership me, PrivacyRequest body) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(WRITE_PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        if (body == null) throw OrgException.invalid("profileVisibility", "send at least one setting");
        String visibility = null;
        if (body.profileVisibility() != null) {
            visibility = body.profileVisibility().trim().toUpperCase(Locale.ROOT);
            if (!VISIBILITY.contains(visibility)) throw OrgException.invalid("profileVisibility", "must be one of " + String.join(", ", VISIBILITY));
        }
        CwsSetting row = settings.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()).orElse(null);
        CwsSetting cur = row != null ? row : fresh(c);
        List<String> changed = new ArrayList<>();
        if (visibility != null && !visibility.equals(cur.getProfileVisibility())) {
            cur.setProfileVisibility(visibility);
            changed.add("profile visibility");
        }
        if (body.shareProfileWithEmployers() != null && body.shareProfileWithEmployers() != cur.isShareProfileWithEmployers()) {
            cur.setShareProfileWithEmployers(body.shareProfileWithEmployers());
            changed.add("sharing with employers");
        }
        if (body.showContactInformation() != null && body.showContactInformation() != cur.isShowContactInformation()) {
            cur.setShowContactInformation(body.showContactInformation());
            changed.add("contact information");
        }
        if (body.allowAnalytics() != null && body.allowAnalytics() != cur.isAllowAnalytics()) {
            cur.setAllowAnalytics(body.allowAnalytics());
            changed.add("analytics usage");
        }
        if (!changed.isEmpty()) {
            cur.setUpdatedAt(Instant.now(clock));
            settings.save(cur);
            record(c, CwsSettingEvent.PRIVACY, "Privacy settings updated", "Changed " + String.join(", ", changed));
        }
        return view(c);
    }

    @Transactional
    public Response setAppearance(OrgMembership me, AppearanceRequest body) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(WRITE_PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        if (body == null) throw OrgException.invalid("theme", "send at least one setting");
        String theme = null;
        if (body.theme() != null) {
            theme = body.theme().trim().toUpperCase(Locale.ROOT);
            if (!THEMES.contains(theme)) throw OrgException.invalid("theme", "must be one of " + String.join(", ", THEMES));
        }
        String language = null;
        if (body.language() != null) {
            language = body.language().trim();
            if (!LANGUAGES.contains(language)) throw OrgException.invalid("language", "must be one of " + String.join(", ", LANGUAGES));
        }
        String zone = null;
        if (body.timezone() != null) {
            zone = body.timezone().trim();
            if (zone.isEmpty() || zone.length() > 60 || !ZoneId.getAvailableZoneIds().contains(zone)) throw OrgException.invalid("timezone", "must be an IANA time zone such as America/New_York");
        }
        CwsSetting row = settings.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()).orElse(null);
        CwsSetting cur = row != null ? row : fresh(c);
        List<String> changed = new ArrayList<>();
        if (theme != null && !theme.equals(cur.getTheme())) {
            cur.setTheme(theme);
            changed.add("theme");
        }
        if (language != null && !language.equals(cur.getLanguage())) {
            cur.setLanguage(language);
            changed.add("language");
        }
        if (zone != null && !zone.equals(cur.getTimezone())) {
            cur.setTimezone(zone);
            changed.add("time zone");
        }
        if (!changed.isEmpty()) {
            cur.setUpdatedAt(Instant.now(clock));
            settings.save(cur);
            record(c, CwsSettingEvent.APPEARANCE, "Appearance settings updated", "Changed " + String.join(", ", changed));
        }
        return view(c);
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    private CwsSetting fresh(ConsultantProfile c) {
        CwsSetting s = new CwsSetting();
        s.setOrgId(c.getOrgId());
        s.setConsultantId(c.getId());
        return s;
    }

    private void record(ConsultantProfile c, String kind, String label, String detail) {
        CwsSettingEvent e = new CwsSettingEvent();
        e.setOrgId(c.getOrgId());
        e.setConsultantId(c.getId());
        e.setKind(kind);
        e.setLabel(label);
        e.setDetail(detail);
        e.setOccurredAt(Instant.now(clock));
        events.save(e);
    }

    private Response view(ConsultantProfile c) {
        Long org = c.getOrgId();
        String orgName = orgs.findByOrgId(org).map(o -> o.getName()).orElse("your organization");
        CwsSetting row = settings.findByOrgIdAndConsultantId(org, c.getId()).orElse(null);
        CwsSetting s = row != null ? row : fresh(c);
        Settings out = new Settings(s.getProfileVisibility(), s.isShareProfileWithEmployers(), s.isShowContactInformation(), s.isAllowAnalytics(), s.getTheme(), s.getLanguage(), s.getTimezone(), row == null, row == null ? null : s.getUpdatedAt());

        int percent = Math.max(0, Math.min(100, c.getProfileCompleteness() == null ? 0 : c.getProfileCompleteness()));
        String level = CwsSetting.PRIVATE.equals(s.getProfileVisibility())
            ? "PRIVATE"
            : CwsSetting.APPROVED_EMPLOYERS.equals(s.getProfileVisibility()) || s.isShareProfileWithEmployers() ? "SHARED" : "PERSONAL";
        Tiles tiles = new Tiles(new ProfileStatusTile(percent, percent >= 100), new PrivacyTile(level, orgName), new ConnectedToolsTile(0, TOOL_CATALOG.size()));

        List<CwsProfilePref> prefs = profilePrefs.findByOrgIdAndConsultantIdOrderByKindAscSortOrderAscIdAsc(org, c.getId());
        var work = workPrefs.findByOrgIdAndConsultantId(org, c.getId()).orElse(null);
        CareerPreferences career = new CareerPreferences(
            values(prefs, ConsultantProfileService.EMPLOYMENT_TYPE),
            c.getWorkMode(),
            values(prefs, ConsultantProfileService.ROLE),
            values(prefs, ConsultantProfileService.LOCATION),
            work == null ? null : work.getRateMinMinor(),
            work == null ? null : work.getRateMaxMinor(),
            c.getAvailabilityStatus()
        );

        List<Activity> activity = new ArrayList<>();
        for (CwsSettingEvent e : events.findTop10ByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(org, c.getId())) {
            activity.add(new Activity(e.getKind(), e.getLabel(), e.getDetail(), e.getOccurredAt()));
        }
        CwsProfileDetail detail = profileDetails.findByOrgIdAndConsultantId(org, c.getId()).orElse(null);
        Instant profileAt = detail == null ? null : detail.getUpdatedAt();
        for (CwsCertification cert : certifications.findByOrgIdAndConsultantIdOrderByIssuedOnDescIdDesc(org, c.getId())) {
            if (cert.getCreatedAt() != null && (profileAt == null || cert.getCreatedAt().isAfter(profileAt))) profileAt = cert.getCreatedAt();
        }
        for (CwsProfilePref p : prefs) {
            if (p.getCreatedAt() != null && (profileAt == null || p.getCreatedAt().isAfter(profileAt))) profileAt = p.getCreatedAt();
        }
        if (profileAt != null) activity.add(new Activity("PROFILE", "Profile updated", "Your career profile was saved", profileAt));
        Instant availAt = availabilityHistory.findByOrgIdAndConsultantIdOrderByEffectiveDateDescIdDesc(org, c.getId()).stream().map(CwsAvailabilityHistory::getCreatedAt).filter(t -> t != null).max(Comparator.naturalOrder()).orElse(null);
        if (availAt != null) activity.add(new Activity("AVAILABILITY", "Availability updated", "Your availability changed", availAt));
        activity.sort(Comparator.comparing(Activity::at).reversed());
        List<Activity> top = activity.size() > ACTIVITY_LIMIT ? activity.subList(0, ACTIVITY_LIMIT) : activity;

        return new Response(
            org,
            Instant.now(clock),
            c.getDisplayName(),
            orgName,
            new Account(c.getDisplayName(), c.getEmail(), c.getLocationLabel()),
            tiles,
            career,
            out,
            TOOL_CATALOG,
            new Documents(resumes.findByOrgIdAndConsultantId(org, c.getId()).size()),
            List.copyOf(top),
            LANGUAGES
        );
    }

    private static List<String> values(List<CwsProfilePref> prefs, String kind) {
        return prefs.stream().filter(p -> kind.equals(p.getKind())).map(CwsProfilePref::getValue).toList();
    }
}
