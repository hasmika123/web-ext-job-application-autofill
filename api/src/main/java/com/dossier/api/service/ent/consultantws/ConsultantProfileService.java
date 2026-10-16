package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsCertification;
import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import com.dossier.api.domain.ent.consultantws.CwsProfilePref;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.repository.ent.consultantws.CwsCertificationRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfileDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfilePrefRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.OrgResumeExperienceRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Availability;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Certification;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Experience;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.ExperienceItem;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Me;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Missing;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.PrefItem;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Preferences;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Skill;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Strength;
import com.dossier.api.service.ent.consultantws.ConsultantProfileDTO.Summary;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace "My Career Profile" (docs/enterprise-v2/page-consultant-profile.md). The gate is
 * {@link ConsultantHomeService#requireSelf}: an ACTIVE consultant with their own consultant_profile, else the generic 404. No method
 * takes a consultant id from the client; every row is looked up org-first and then checked to belong to the caller (anything else
 * is the generic 404). Every free-text value goes through the PII scanner {@link SensitiveContent}. Each write answers with the
 * fresh view and refreshes the stored completeness / has_certifications / has_preferences values.
 */
@Service
public class ConsultantProfileService {

    public static final List<String> AVAILABILITY = List.of("AVAILABLE", "ON_PROJECT", "NOTICE", "UNAVAILABLE");
    public static final List<String> EMPLOYMENT_TYPES = List.of("CONTRACT", "CONTRACT_TO_HIRE", "FULL_TIME", "PART_TIME");
    /** Status choices only: never a document, visa or permit number. */
    public static final List<String> WORK_AUTH = List.of("AUTHORIZED_NO_SPONSORSHIP", "AUTHORIZED_NEEDS_SPONSORSHIP", "NOT_AUTHORIZED");
    public static final String ROLE = "ROLE";
    public static final String LOCATION = "LOCATION";
    public static final String EMPLOYMENT_TYPE = "EMPLOYMENT_TYPE";

    static final int MAX_SKILLS = 30;
    static final int MAX_CERTS = 20;
    static final int MAX_PREFS = 12;
    static final int SUMMARY_MAX = 2000;
    static final int GOALS_MAX = 1000;
    private static final int CHECKS = 9;

    private final ConsultantHomeService home;
    private final ConsultantProfileRepository consultants;
    private final ConsultantSkillRepository skills;
    private final OrgResumeRepository resumes;
    private final OrgResumeExperienceRepository experience;
    private final CwsCertificationRepository certs;
    private final CwsProfilePrefRepository prefs;
    private final CwsProfileDetailRepository details;
    private final Clock clock;

    @Autowired
    public ConsultantProfileService(
        ConsultantHomeService home,
        ConsultantProfileRepository consultants,
        ConsultantSkillRepository skills,
        OrgResumeRepository resumes,
        OrgResumeExperienceRepository experience,
        CwsCertificationRepository certs,
        CwsProfilePrefRepository prefs,
        CwsProfileDetailRepository details
    ) {
        this.home = home;
        this.consultants = consultants;
        this.skills = skills;
        this.resumes = resumes;
        this.experience = experience;
        this.certs = certs;
        this.prefs = prefs;
        this.details = details;
        this.clock = Clock.systemUTC();
    }

    // ---- read -----------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response profile(OrgMembership me) {
        return view(home.requireSelf(me), false);
    }

    // ---- writes (each answers with the fresh view) ----------------------------------------------------------------

    @Transactional
    public Response setAvailability(OrgMembership me, String status) {
        ConsultantProfile c = home.requireSelf(me);
        String s = status == null ? "" : status.trim().toUpperCase();
        if (!AVAILABILITY.contains(s)) throw OrgException.invalid("status", "must be one of " + String.join(", ", AVAILABILITY));
        c.setAvailabilityStatus(s);
        c.setAvailabilitySince(LocalDate.now(clock));
        c.setUpdatedAt(Instant.now(clock));
        consultants.save(c);
        return view(c, true);
    }

    /** Replaces the three contact fields (a blank clears one). Contact data only; each value is validated and PII-scanned. */
    @Transactional
    public Response setContact(OrgMembership me, ConsultantProfileDTO.ContactBody body) {
        ConsultantProfile c = home.requireSelf(me);
        if (body == null) throw OrgException.invalid("body", "send the contact details");
        c.setPhone(com.dossier.api.service.ent.consultants.ConsultantContact.phone(body.phone()));
        c.setTimeZone(com.dossier.api.service.ent.consultants.ConsultantContact.timeZone(body.timeZone()));
        c.setPreferredContact(com.dossier.api.service.ent.consultants.ConsultantContact.preferred(body.preferredContact()));
        c.setUpdatedAt(Instant.now(clock));
        consultants.save(c);
        return view(c, true);
    }

    @Transactional
    public Response setSummary(OrgMembership me, String text) {
        ConsultantProfile c = home.requireSelf(me);
        String t = freeText("summary", text, SUMMARY_MAX, true);
        Optional<OrgResume> resume = primaryResume(c);
        if (resume.isPresent()) {
            OrgResume r = resume.get();
            r.setSummaryText(t);
            r.setUpdatedAt(Instant.now(clock));
            resumes.save(r);
        } else {
            CwsProfileDetail d = detail(c);
            d.setSummaryText(t);
            touch(d);
        }
        return view(c, true);
    }

    @Transactional
    public Response setCareerGoals(OrgMembership me, String text) {
        ConsultantProfile c = home.requireSelf(me);
        CwsProfileDetail d = detail(c);
        d.setCareerGoals(freeText("careerGoals", text, GOALS_MAX, true));
        touch(d);
        return view(c, true);
    }

    @Transactional
    public Response setWorkAuthorization(OrgMembership me, String value) {
        ConsultantProfile c = home.requireSelf(me);
        String v = value == null || value.isBlank() ? null : value.trim().toUpperCase();
        if (v != null && !WORK_AUTH.contains(v)) throw OrgException.invalid("workAuthorization", "must be one of " + String.join(", ", WORK_AUTH));
        CwsProfileDetail d = detail(c);
        d.setWorkAuthorization(v);
        touch(d);
        return view(c, true);
    }

    @Transactional
    public Response addSkill(OrgMembership me, String skill) {
        ConsultantProfile c = home.requireSelf(me);
        String s = freeText("skill", skill, 60, false);
        List<ConsultantSkill> mine = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(c.getOrgId(), c.getId());
        if (mine.stream().noneMatch(x -> x.getSkill().equalsIgnoreCase(s))) {
            if (mine.size() >= MAX_SKILLS) throw OrgException.invalid("skill", "at most " + MAX_SKILLS + " skills");
            ConsultantSkill row = new ConsultantSkill();
            row.setOrgId(c.getOrgId());
            row.setConsultantId(c.getId());
            row.setSkill(s);
            row.setPrimarySkill(true);
            row.setSortOrder(mine.stream().map(ConsultantSkill::getSortOrder).filter(o -> o != null).max(Integer::compare).orElse(-1) + 1);
            skills.save(row);
        }
        return view(c, true);
    }

    @Transactional
    public Response removeSkill(OrgMembership me, Long skillId) {
        ConsultantProfile c = home.requireSelf(me);
        ConsultantSkill row = skills.findByOrgIdAndId(c.getOrgId(), skillId).filter(x -> c.getId().equals(x.getConsultantId())).orElseThrow(OrgNotFoundException::new);
        skills.delete(row);
        return view(c, true);
    }

    @Transactional
    public Response addCertification(OrgMembership me, String name, String issuer, String issued) {
        ConsultantProfile c = home.requireSelf(me);
        String n = freeText("name", name, 160, false);
        String i = freeText("issuer", issuer, 120, true);
        LocalDate on = null;
        if (issued != null && !issued.isBlank()) {
            YearMonth ym;
            try {
                ym = YearMonth.parse(issued.trim());
            } catch (DateTimeParseException e) {
                throw OrgException.invalid("issuedOn", "must be a month like 2023-03");
            }
            if (ym.isAfter(YearMonth.now(clock)) || ym.getYear() < 1970) throw OrgException.invalid("issuedOn", "must be a past month (yyyy-MM)");
            on = ym.atDay(1);
        }
        if (certs.countByOrgIdAndConsultantId(c.getOrgId(), c.getId()) >= MAX_CERTS) throw OrgException.invalid("name", "at most " + MAX_CERTS + " certifications");
        CwsCertification row = new CwsCertification();
        row.setOrgId(c.getOrgId());
        row.setConsultantId(c.getId());
        row.setName(n);
        row.setIssuer(i);
        row.setIssuedOn(on);
        certs.save(row);
        return view(c, true);
    }

    @Transactional
    public Response removeCertification(OrgMembership me, Long certId) {
        ConsultantProfile c = home.requireSelf(me);
        CwsCertification row = certs.findByOrgIdAndId(c.getOrgId(), certId).filter(x -> c.getId().equals(x.getConsultantId())).orElseThrow(OrgNotFoundException::new);
        certs.delete(row);
        return view(c, true);
    }

    /** kind ROLE or LOCATION (employment types are a fixed set: {@link #setEmploymentTypes}). */
    @Transactional
    public Response addPref(OrgMembership me, String kind, String value) {
        ConsultantProfile c = home.requireSelf(me);
        String k = kind == null ? "" : kind.trim().toUpperCase();
        if (!ROLE.equals(k) && !LOCATION.equals(k)) throw OrgException.invalid("kind", "must be ROLE or LOCATION");
        String v = freeText("value", value, 80, false);
        List<CwsProfilePref> mine = prefs.findByOrgIdAndConsultantIdAndKindOrderBySortOrderAscIdAsc(c.getOrgId(), c.getId(), k);
        if (mine.stream().noneMatch(x -> x.getValue().equalsIgnoreCase(v))) {
            if (mine.size() >= MAX_PREFS) throw OrgException.invalid("value", "at most " + MAX_PREFS + " entries");
            CwsProfilePref row = new CwsProfilePref();
            row.setOrgId(c.getOrgId());
            row.setConsultantId(c.getId());
            row.setKind(k);
            row.setValue(v);
            row.setSortOrder(mine.stream().map(CwsProfilePref::getSortOrder).max(Integer::compare).orElse(-1) + 1);
            prefs.save(row);
        }
        return view(c, true);
    }

    @Transactional
    public Response removePref(OrgMembership me, Long prefId) {
        ConsultantProfile c = home.requireSelf(me);
        CwsProfilePref row = prefs.findByOrgIdAndId(c.getOrgId(), prefId).filter(x -> c.getId().equals(x.getConsultantId()) && !EMPLOYMENT_TYPE.equals(x.getKind())).orElseThrow(OrgNotFoundException::new);
        prefs.delete(row);
        return view(c, true);
    }

    /** Replaces the chosen employment types (a subset of {@link #EMPLOYMENT_TYPES}; empty clears them). */
    @Transactional
    public Response setEmploymentTypes(OrgMembership me, List<String> values) {
        ConsultantProfile c = home.requireSelf(me);
        Set<String> wanted = new LinkedHashSet<>();
        for (String v : values == null ? List.<String>of() : values) {
            String s = v == null ? "" : v.trim().toUpperCase();
            if (!EMPLOYMENT_TYPES.contains(s)) throw OrgException.invalid("values", "each must be one of " + String.join(", ", EMPLOYMENT_TYPES));
            wanted.add(s);
        }
        List<CwsProfilePref> existing = prefs.findByOrgIdAndConsultantIdAndKindOrderBySortOrderAscIdAsc(c.getOrgId(), c.getId(), EMPLOYMENT_TYPE);
        Set<String> have = new LinkedHashSet<>();
        for (CwsProfilePref p : existing) {
            if (wanted.contains(p.getValue())) have.add(p.getValue());
            else prefs.delete(p);
        }
        prefs.flush();
        int order = 0;
        for (String w : wanted) {
            if (!have.contains(w)) {
                CwsProfilePref row = new CwsProfilePref();
                row.setOrgId(c.getOrgId());
                row.setConsultantId(c.getId());
                row.setKind(EMPLOYMENT_TYPE);
                row.setValue(w);
                row.setSortOrder(order);
                prefs.save(row);
            }
            order++;
        }
        return view(c, true);
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    /** Trimmed, bounded, no control characters or angle brackets, PII-scanned. Blank is null when {@code optional}, else a 422. */
    static String freeText(String field, String raw, int max, boolean optional) {
        String t = raw == null ? "" : raw.strip();
        if (t.isEmpty()) {
            if (optional) return null;
            throw OrgException.invalid(field, "is required");
        }
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(ch -> Character.isISOControl(ch) && ch != '\n' && ch != '\r' && ch != '\t') || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) {
            throw OrgException.invalid(field, "contains characters that are not allowed");
        }
        SensitiveContent.check(field, field, t);
        return t;
    }

    private Optional<OrgResume> primaryResume(ConsultantProfile c) {
        List<OrgResume> mine = resumes.findByOrgIdAndConsultantId(c.getOrgId(), c.getId());
        return mine.stream().filter(OrgResume::isPrimaryForOrg).findFirst().or(() -> mine.stream().max(Comparator.comparing(OrgResume::getUpdatedAt, Comparator.nullsFirst(Comparator.naturalOrder()))));
    }

    private CwsProfileDetail detail(ConsultantProfile c) {
        return details.findByOrgIdAndConsultantId(c.getOrgId(), c.getId()).orElseGet(() -> {
            CwsProfileDetail d = new CwsProfileDetail();
            d.setOrgId(c.getOrgId());
            d.setConsultantId(c.getId());
            return d;
        });
    }

    private void touch(CwsProfileDetail d) {
        d.setUpdatedAt(Instant.now(clock));
        details.save(d);
    }

    /**
     * Builds the view. After a write ({@code refresh}) it also reconciles has_certifications / has_preferences with the tables and
     * stores the recomputed completeness, so the consultant directory stays honest. A plain read shows the stored value.
     */
    private Response view(ConsultantProfile c, boolean refresh) {
        Long org = c.getOrgId();
        List<ConsultantSkill> skillRows = skills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(org, c.getId()).stream()
            .sorted(Comparator.comparing((ConsultantSkill s) -> !s.isPrimarySkill()).thenComparing(s -> s.getSortOrder() == null ? 0 : s.getSortOrder()))
            .toList();
        List<CwsCertification> certRows = certs.findByOrgIdAndConsultantIdOrderByIssuedOnDescIdDesc(org, c.getId());
        List<CwsProfilePref> prefRows = prefs.findByOrgIdAndConsultantIdOrderByKindAscSortOrderAscIdAsc(org, c.getId());
        CwsProfileDetail d = details.findByOrgIdAndConsultantId(org, c.getId()).orElse(null);
        Optional<OrgResume> resume = primaryResume(c);

        List<PrefItem> roles = prefRows.stream().filter(p -> ROLE.equals(p.getKind())).map(p -> new PrefItem(p.getId(), p.getValue())).toList();
        List<PrefItem> locations = prefRows.stream().filter(p -> LOCATION.equals(p.getKind())).map(p -> new PrefItem(p.getId(), p.getValue())).toList();
        List<String> types = prefRows.stream().filter(p -> EMPLOYMENT_TYPE.equals(p.getKind())).map(CwsProfilePref::getValue).toList();

        String resumeSummary = resume.map(OrgResume::getSummaryText).filter(s -> !s.isBlank()).orElse(null);
        String profileSummary = d == null || d.getSummaryText() == null || d.getSummaryText().isBlank() ? null : d.getSummaryText();
        String summaryText = resumeSummary != null ? resumeSummary : profileSummary;
        String source = resumeSummary != null ? "RESUME" : profileSummary != null ? "PROFILE" : "NONE";

        List<ExperienceItem> exp = resume
            .map(r -> experience.findByOrgIdAndResumeIdOrderBySortOrderAsc(org, r.getId()).stream().map(e -> new ExperienceItem(e.getId(), e.getTitle(), e.getEmployer(), e.getStartYear(), e.getEndYear())).toList())
            .orElse(List.of());
        String goals = d == null ? null : d.getCareerGoals();
        String auth = d == null ? null : d.getWorkAuthorization();

        if (refresh) {
            c.setHasCertifications(!certRows.isEmpty());
            c.setHasPreferences(!roles.isEmpty() || !locations.isEmpty() || !types.isEmpty());
        }
        // the checklist behind "Missing Details": what is actually absent (the flag counts as a certification until a write reconciles it)
        List<Missing> missing = new ArrayList<>();
        if (summaryText == null) missing.add(new Missing("summary", "Add a professional summary", "summary"));
        if (skillRows.size() < 3) missing.add(new Missing("skills", "Add at least three skills", "skills"));
        if (certRows.isEmpty() && !c.isHasCertifications()) missing.add(new Missing("certifications", "Add at least one certification", "certifications"));
        if (exp.isEmpty()) missing.add(new Missing("experience", "Add work experience to your resume", "experience"));
        if (roles.isEmpty()) missing.add(new Missing("roles", "Add a preferred role", "roles"));
        if (locations.isEmpty()) missing.add(new Missing("locations", "Add a preferred location", "locations"));
        if (types.isEmpty()) missing.add(new Missing("employment", "Specify preferred employment type", "employment"));
        if (auth == null) missing.add(new Missing("authorization", "Choose your work authorization", "authorization"));
        if (goals == null || goals.isBlank()) missing.add(new Missing("goals", "Set your career goals", "goals"));

        if (refresh) {
            c.setProfileCompleteness(Math.round(100f * (CHECKS - missing.size()) / CHECKS));
            c.setUpdatedAt(Instant.now(clock));
            consultants.save(c);
        }
        // always the live checklist's figure (D12 P2: a stored 54% beside an empty Missing Details list read as a contradiction); the stored value is only the directory's cache
        int percent = Math.round(100f * (CHECKS - missing.size()) / CHECKS);

        return new Response(
            org,
            new Me(c.getId(), c.getDisplayName(), c.getJobTitle(), c.getYearsExperience(), c.getLocationLabel(), c.getWorkMode(), c.getPhone(), c.getTimeZone(), c.getPreferredContact()),
            new Availability(c.getAvailabilityStatus(), c.getAvailabilitySince(), c.getAvailableFrom()),
            new Strength(percent, List.copyOf(missing)),
            new Summary(summaryText, source, resume.isPresent()),
            skillRows.stream().map(s -> new Skill(s.getId(), s.getSkill(), s.isPrimarySkill())).toList(),
            certRows.stream().map(x -> new Certification(x.getId(), x.getName(), x.getIssuer(), x.getIssuedOn())).toList(),
            new Experience(resume.map(OrgResume::getName).orElse(null), exp),
            new Preferences(roles, locations, types),
            auth,
            goals
        );
    }
}
