package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * Everything the Resume Builder web reads from settings, in one object (DESIGN 9.1 plus
 * {@code resumes} from 9.10). Evaluated per request from {@code ResumeBuilderSettings}; the web
 * keeps a copy of the defaults ({@code resume-builder-config.ts}) for when the API is unreachable.
 *
 * @param plan      {@code FREE}, {@code PRO} or {@code AUTOPILOT}
 * @param aiAllowed whether the plan has builder AI - the web shows locks from this, never from plan names
 */
public record ResumeBuilderConfigDTO(
    Templates templates,
    Limits limits,
    Score score,
    Match match,
    Theme theme,
    Features features,
    Ai ai,
    String plan,
    boolean aiAllowed,
    Resumes resumes,
    Profile profile,
    Lists list,
    Pdf pdf
) {
    public record Templates(
        List<String> enabled,
        @JsonProperty("default") String defaultId,
        @Schema(type = "object", description = "Per-template partial TemplateCapabilities; may only tighten.") JsonNode overrides,
        @Schema(description = "Template ids in the order the Popular Templates strip shows them first (resume.templates.popular).") List<String> popular
    ) {}

    public record Limits(int sections, int items, int bullets, int bulletChars, int summaryChars, int marks, int docBytes) {}

    public record Score(
        String rulesetVersion,
        @Schema(type = "object", description = "Rule id to weight.") JsonNode weights,
        @Schema(type = "object", description = "Group id (G1..G6) to weight.") JsonNode groupWeights,
        double passThreshold,
        @Schema(description = "Bands [{min, title, body}], highest min first.") JsonNode bands
    ) {}

    public record Match(
        @Schema(type = "object", description = "{skills, title, years, industry, education}; sums to 100.") JsonNode weights,
        int keySkillsCount,
        @Schema(type = "object", description = "{keySkills, experience, industry}.") JsonNode thresholds,
        int maxJdChars,
        boolean embeddings
    ) {}

    public record Theme(List<String> accentPalette) {}

    public record Features(
        boolean photo,
        boolean docx,
        boolean aiSuggestions,
        boolean jobMatch,
        boolean tailor,
        boolean printLayout,
        boolean pdfView
    ) {}

    public record Ai(boolean suggestAutoRefresh, int suggestStaleMinutes, int rewriteMaxRefs) {}

    /** The signed-in user's live (non-archived) resume count and their plan's cap. */
    public record Resumes(int count, int max) {}

    /**
     * Common Profile limits (R1.1): one item's bytes, live items per user, items per import call; the
     * bio value / summary character caps an import writes, the completeness percent under which the
     * dashboard offers the setup, and the resume file upload cap in bytes (R1.4).
     */
    public record Profile(
        int itemMaxBytes,
        int maxItemsPerUser,
        int maxImportItems,
        int bioValueMaxChars,
        int bioSummaryMaxChars,
        int setupPromptBelowPercent,
        int uploadMaxBytes
    ) {}

    /** The My Resumes page (R2.6): the Quick Tips lines and the card count above which the grid is virtualised. */
    public record Lists(List<String> quickTips, int virtualizeAbove) {}

    /** PDF settings the editor reads (R3.3): how long Save & Download waits for the stored PDF; whether the PDF view re-renders by itself. */
    public record Pdf(int waitMs, boolean viewAutoRefresh) {}
}
