package com.dossier.api.service;

import static com.dossier.api.service.ResumeBuilderSettingKeys.*;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.ResumeBuilderConfigDTO;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Evaluates the builder settings into the one config object the web reads (DESIGN 9.1). Pure reads:
 * every value comes from {@link ResumeBuilderSettings}, the plan fields from {@link ResumeEntitlements}.
 */
@Service
public class ResumeBuilderConfigService {

    private final ResumeBuilderSettings settings;
    private final ResumeEntitlements entitlements;

    public ResumeBuilderConfigService(ResumeBuilderSettings settings, ResumeEntitlements entitlements) {
        this.settings = settings;
        this.entitlements = entitlements;
    }

    /** The config for the signed-in user. */
    public ResumeBuilderConfigDTO forCurrentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return build(login);
    }

    ResumeBuilderConfigDTO build(String login) {
        ResumeBuilderSettings s = settings;
        return new ResumeBuilderConfigDTO(
            new ResumeBuilderConfigDTO.Templates(
                strings(TEMPLATES_ENABLED),
                s.getString(TEMPLATES_DEFAULT),
                s.getJson(TEMPLATES_OVERRIDES, JsonNode.class),
                strings(TEMPLATES_POPULAR)
            ),
            new ResumeBuilderConfigDTO.Limits(
                s.getInt(DOC_LIMIT_SECTIONS),
                s.getInt(DOC_LIMIT_ITEMS),
                s.getInt(DOC_LIMIT_BULLETS),
                s.getInt(DOC_LIMIT_BULLET_CHARS),
                s.getInt(DOC_LIMIT_SUMMARY_CHARS),
                s.getInt(DOC_LIMIT_MARKS),
                s.getInt(DOC_LIMIT_DOC_BYTES)
            ),
            new ResumeBuilderConfigDTO.Score(
                s.getString(SCORE_RULESET_VERSION),
                s.getJson(SCORE_WEIGHTS, JsonNode.class),
                s.getJson(SCORE_GROUP_WEIGHTS, JsonNode.class),
                s.getDecimal(SCORE_PASS_THRESHOLD),
                s.getJson(SCORE_BANDS, JsonNode.class)
            ),
            new ResumeBuilderConfigDTO.Match(
                s.getJson(MATCH_WEIGHTS, JsonNode.class),
                s.getInt(MATCH_KEY_SKILLS_COUNT),
                s.getJson(MATCH_THRESHOLDS, JsonNode.class),
                s.getInt(JOBMATCH_MAX_JD_CHARS),
                s.getBool(JOBMATCH_EMBEDDINGS)
            ),
            new ResumeBuilderConfigDTO.Theme(strings(THEME_ACCENT_PALETTE)),
            new ResumeBuilderConfigDTO.Features(
                s.getBool(FEATURE_PHOTO),
                s.getBool(FEATURE_DOCX),
                s.getBool(AI_FEATURE_RESUME),
                s.getBool(FEATURE_JOB_MATCH),
                s.getBool(FEATURE_TAILOR),
                s.getBool(FEATURE_PRINT_LAYOUT),
                s.getBool(FEATURE_PDF_VIEW)
            ),
            new ResumeBuilderConfigDTO.Ai(
                s.getBool(AI_SUGGEST_AUTO_REFRESH),
                s.getInt(AI_SUGGEST_STALE_MINUTES),
                s.getInt(AI_REWRITE_MAX_REFS)
            ),
            entitlements.planName(login),
            entitlements.builderAiAllowed(login),
            new ResumeBuilderConfigDTO.Resumes(entitlements.liveResumeCount(), entitlements.resumesMax(login)),
            new ResumeBuilderConfigDTO.Profile(
                s.getInt(PROFILE_ITEM_MAX_BYTES),
                s.getInt(PROFILE_ITEMS_MAX_PER_USER),
                s.getInt(PROFILE_IMPORT_MAX_ITEMS),
                s.getInt(PROFILE_BIO_VALUE_MAX_CHARS),
                s.getInt(PROFILE_BIO_SUMMARY_MAX_CHARS),
                s.getInt(PROFILE_SETUP_PROMPT_BELOW_PERCENT),
                s.getInt(PROFILE_UPLOAD_MAX_BYTES)
            ),
            new ResumeBuilderConfigDTO.Lists(strings(LIST_QUICK_TIPS), s.getInt(LIST_VIRTUALIZE_ABOVE))
        );
    }

    private List<String> strings(String key) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : settings.getJson(key, JsonNode.class)) out.add(n.asText());
        return out;
    }
}
