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
    Pdf pdf,
    Share share,
    Versions versions,
    @Schema(description = "Onboarding v2 tunables (R1.8): the dashboard card, the time estimates, the draft cap, the payoff.") Onboarding onboarding
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
        boolean pdfView,
        @Schema(description = "Share links are on (feature.resume_share_links.enabled); the header hides Shared with Recruiters when off.") boolean shareLinks
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

    /**
     * Resume sharing limits and defaults the header bar and Resume settings need (R3.10, R3.12): how many active links and
     * named people one resume may have, how long a new link lives by default (days, 0 = no expiry) and whether a new link
     * allows the PDF download by default.
     */
    public record Share(int maxLinks, int maxGrants, int linkDefaultDays, boolean allowDownloadDefault) {}

    /** Version history retention the header's All versions sheet states: automatic rows kept per resume (named ones are kept always). */
    public record Versions(int retentionAuto) {}

    /**
     * Onboarding v2 (R1.8, ONBOARDING-V2-DESIGN 9): {@code enabled} = {@code feature.onboarding_v2.enabled},
     * {@code estimateMinutes} the "~N min" label, {@code stepSeconds} the per-step seconds behind "about N min left",
     * {@code draftMaxBytes} the draft cap, {@code card} the dashboard card's timings, {@code confetti} / {@code mascot}
     * the flair switches, {@code personaStep} whether the "which one's you?" step is asked, {@code payoffActions} the
     * ordered next actions on the payoff screen.
     */
    public record Onboarding(
        boolean enabled,
        int estimateMinutes,
        @Schema(type = "object", description = "Step key (hello, source, review, skills, you, prefs) to seconds.") JsonNode stepSeconds,
        int draftMaxBytes,
        OnboardingCard card,
        boolean confetti,
        boolean mascot,
        boolean personaStep,
        List<String> payoffActions,
        OnboardingDelight delight
    ) {}

    /**
     * The delight layer (R1.14, ONBOARDING-DELIGHT-DESIGN 8): {@code enabled} is the whole layer; the other switches gate one
     * feature each; {@code interstitialMs} is the section interstitial's wait (0 = none) and {@code interstitials} which sections
     * get it; {@code copy} overrides the copy deck by key.
     */
    public record OnboardingDelight(
        boolean enabled,
        boolean haptics,
        boolean combo,
        boolean highlights,
        boolean milestones,
        int interstitialMs,
        List<String> interstitials,
        boolean barRider,
        boolean share,
        @Schema(type = "object", description = "Copy deck key to a string or an array of strings.") JsonNode copy
    ) {}

    public record OnboardingCard(int snoozeDays, int resurfaceBelowPercent, int resurfaceAfterDays, int maxResurfaces) {}
}
