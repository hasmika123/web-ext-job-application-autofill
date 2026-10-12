package com.dossier.api.service.ai.engines;

import com.dossier.api.domain.AiCall;
import com.dossier.api.domain.ResumeAiProposal;
import com.dossier.api.domain.ResumeDoc;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.ResumeAiProposalRepository;
import com.dossier.api.repository.ResumeDocRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AiBudgetService;
import com.dossier.api.service.AiBudgetService.Decision;
import com.dossier.api.service.AiInputs;
import com.dossier.api.service.AiInputs.Ref;
import com.dossier.api.service.AiInputs.ResumeDigest;
import com.dossier.api.service.AiMeteringService;
import com.dossier.api.service.ProRequiredException;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ResumeDocException;
import com.dossier.api.service.ResumeDocService;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.ai.engines.ProposalResult.ChangeView;
import com.dossier.api.service.ai.engines.ProposalResult.ProposalView;
import com.dossier.api.service.ai.engines.ProposalResult.UsageView;
import com.dossier.api.service.ai.guard.AiTruthChecks;
import com.dossier.api.service.ai.guard.AiTruthChecks.Profile;
import com.dossier.api.service.ai.guard.AiTruthChecks.Sources;
import com.dossier.api.service.ai.prompts.Prompt;
import com.dossier.api.service.ai.prompts.resume.ResumePrompts;
import com.dossier.api.service.privacy.SensitivePatterns;
import com.dossier.api.service.dto.ResumeDocDTO;
import com.dossier.api.service.resume.ResumeDocument;
import com.dossier.api.service.resume.ResumeDocumentUpgrader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The one checked-proposal service behind every Resume Builder AI feature (Pro; DESIGN 13, R4.1). Each public
 * method follows the same fixed order, so a UI story is UI work and no invented fact can reach a resume:
 * feature switch, {@link AiBudgetService#decide} (kill switch, Pro, budget), consent, the cache, the daily cap
 * and per-minute rate, prompt render, {@link AiProvider#generate}, {@link AiMeteringService#record} (always,
 * even for an unusable reply), strict JSON, {@link AiTruthChecks} (a violating change is dropped and counted),
 * then one {@code resume_ai_proposal} row pinned to the document's content hash.
 *
 * <p>Applying a proposal ({@link #apply}) names refs and an alternative index - never text. The text comes from the
 * stored, checked proposal, and a document that changed since is refused ({@code 409 PROPOSAL_STALE}).
 *
 * <p>Written so the gate-and-call block is one private method, {@link #callModel}, which I0.3's
 * {@code AiGateway.call(AiRequest)} replaces without touching the engines above it.
 */
@Service
@Transactional
public class ResumeAiService {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeAiService.class);

    /** Rewrite modes (DESIGN 13.2): the wire value to the instruction the prompt carries. */
    static final Map<String, String> MODE_INSTRUCTIONS = Map.of(
        "stronger", "stronger - lead with a strong action verb and make the impact clearer, using only what the line already says",
        "shorter", "shorter - say the same thing in fewer words, never longer than the original",
        "formal", "more formal - a professional tone, no contractions or slang",
        "plain", "plain language - short everyday words, no jargon, the same meaning",
        "grammar", "fix grammar - correct grammar, spelling, punctuation and tense consistency only; change nothing else"
    );
    public static final Set<String> MODES = MODE_INSTRUCTIONS.keySet();

    static final Map<String, String> TONE_INSTRUCTIONS = Map.of(
        "concise", "concise - brief and to the point",
        "confident", "confident - assured, achievement-led, never boastful",
        "plain", "plain - simple everyday words"
    );
    public static final Set<String> TONES = TONE_INSTRUCTIONS.keySet();

    /** A proposal's explanation when the model's own was unusable (too long, or carried a link). */
    static final String SUMMARY_REASON = "Written from your headline, skills and experience";

    /** DESIGN 13.2: a generated summary is at most this long (and never over the document's own summary cap). */
    static final int SUMMARY_VARIANT_MAX_CHARS = 700;
    static final int MAX_ALTERNATIVES = 3;
    /** DESIGN 17: a user's open proposals are trimmed, oldest first, to this many. */
    static final int MAX_OPEN_PROPOSALS = 200;
    static final int TOP_SKILLS = 12;

    /** The builder tasks the daily cap counts (DESIGN 13.1: REWRITE / SUMMARY / SUGGEST share one cap). */
    private static final List<String> DAILY_CAP_TASKS = List.of(AiTask.REWRITE.wire(), AiTask.SUMMARY.wire(), AiTask.SUGGEST.wire());
    /** The builder tasks the per-minute rate counts. */
    private static final List<String> RATE_TASKS = List.of(
        AiTask.REWRITE.wire(),
        AiTask.SUMMARY.wire(),
        AiTask.SUGGEST.wire(),
        AiTask.COVER.wire(),
        AiTask.TRANSLATE.wire()
    );

    private final AiProvider provider;
    private final AiBudgetService budget;
    private final AiMeteringService metering;
    private final ResumeDocRepository docs;
    private final ResumeAiProposalRepository proposals;
    private final AiCallRepository calls;
    private final UserRepository users;
    private final ResumeDocService docService;
    private final ResumeBuilderSettings settings;
    private final MeterRegistry meters;
    private final ObjectMapper om;
    private final boolean enabled;

    public ResumeAiService(
        AiProvider provider,
        AiBudgetService budget,
        AiMeteringService metering,
        ResumeDocRepository docs,
        ResumeAiProposalRepository proposals,
        AiCallRepository calls,
        UserRepository users,
        ResumeDocService docService,
        ResumeBuilderSettings settings,
        MeterRegistry meters,
        ObjectMapper om,
        @Value("${dossier.ai.enabled:false}") boolean enabled
    ) {
        this.provider = provider;
        this.budget = budget;
        this.metering = metering;
        this.docs = docs;
        this.proposals = proposals;
        this.calls = calls;
        this.users = users;
        this.docService = docService;
        this.settings = settings;
        this.meters = meters;
        this.om = om;
        this.enabled = enabled;
    }

    // ---- rewrite ---------------------------------------------------------------------------------

    /**
     * Rewrite up to {@code resume.ai.rewriteMaxRefs} lines of a resume in {@code mode}. 404 for a resume that is
     * not the caller's, 400 {@code INVALID_MODE} / {@code INVALID_REFS} for a request that cannot be answered,
     * 402 {@code PRO_REQUIRED} for Free.
     */
    public ProposalResult rewrite(Long resumeId, List<String> refs, String mode, boolean consent) {
        User user = currentUser();
        ResumeDoc doc = ownedDoc(user, resumeId);
        String m = mode == null ? "stronger" : mode.trim().toLowerCase(Locale.ROOT);
        if (!MODES.contains(m)) throw badRequest("INVALID_MODE", "mode must be one of " + new TreeSet<>(MODES));
        ResumeDigest digest = AiInputs.resumeDigestV2(docJson(doc), AiInputs.DETAILED);
        List<String> wanted = requestedRefs(refs, digest);

        Prompt prompt = ResumePrompts.get("rewrite.bullets");
        int bulletMax = settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_BULLET_CHARS);
        int summaryMax = settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_SUMMARY_CHARS);
        int maxChars = 0;
        Set<String> sections = new LinkedHashSet<>();
        StringBuilder lines = new StringBuilder();
        for (String ref : wanted) {
            Ref r = digest.refs().get(ref);
            maxChars = Math.max(maxChars, "SUMMARY".equals(r.sectionKind()) ? summaryMax : bulletMax);
            sections.add(AiInputs.forModel(r.section()));
            lines.append('[').append(ref).append("] ").append(AiInputs.forModel(r.text())).append('\n');
        }
        Map<String, String> slots = new LinkedHashMap<>();
        slots.put("mode", MODE_INSTRUCTIONS.get(m));
        slots.put("maxChars", String.valueOf(maxChars));
        slots.put("headline", digest.headline().isEmpty() ? "(none)" : AiInputs.forModel(digest.headline()));
        slots.put("section", String.join("; ", sections));
        slots.put("lines", lines.toString().stripTrailing());

        String cacheKey = cacheKey(AiTask.REWRITE, m, prompt, doc.getContentHash(), new TreeSet<>(wanted), "", "", "");
        Call call = callModel(user, doc, AiTask.REWRITE, prompt, slots, cacheKey, consent);
        if (call.early() != null) return call.early();

        JsonNode changes = call.json().path("changes");
        if (!changes.isArray()) return error(call.usage());

        Sources base = Sources.of(digest.sourceText());
        ArrayNode kept = om.createArrayNode();
        Set<String> seen = new LinkedHashSet<>();
        int dropped = 0;
        for (JsonNode c : changes) {
            String ref = c.path("ref").asText("").trim();
            Ref r = digest.refs().get(ref);
            if (r == null || !wanted.contains(ref) || !seen.add(ref)) {
                dropped++;
                continue;
            }
            List<String> alternatives = checkedTexts(texts(c.path("alternatives"), c.path("after"), c.path("text")), r, base, m, "SUMMARY".equals(r.sectionKind()) ? summaryMax : bulletMax);
            if (alternatives.isEmpty()) {
                dropped++;
                continue;
            }
            ObjectNode change = kept.addObject();
            change.put("ref", ref);
            change.put("section", r.section());
            change.put("before", r.text());
            ArrayNode alts = change.putArray("alternatives");
            alternatives.forEach(alts::add);
            change.put("reason", reasonOr(c.path("reason").asText(""), "Reworded as asked (" + m + ")"));
            change.putArray("sources").add(ref);
            change.put("formatted", r.formatted());
        }
        return finish(user, doc, AiTask.REWRITE, m, prompt, cacheKey, call, kept, om.createArrayNode(), dropped, null);
    }

    /** The alternatives of one change that pass the truth checks, in the model's order. */
    private List<String> checkedTexts(List<String> candidates, Ref ref, Sources base, String mode, int maxChars) {
        Sources sources = base.withNumbers(AiTruthChecks.numbers(ref.text())).withBefore(ref.text()).withMaxChars(maxChars);
        List<String> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : candidates) {
            String text = oneLine(raw);
            if (out.size() >= MAX_ALTERNATIVES) break;
            if (!seen.add(text.toLowerCase(Locale.ROOT))) continue;
            if ("shorter".equals(mode) && text.length() > ref.text().length()) continue;
            if (AiTruthChecks.check(text, sources, Profile.REWRITE).isEmpty()) out.add(text);
        }
        return out;
    }

    // ---- summary ---------------------------------------------------------------------------------

    /** Draft up to three summaries of the resume in a tone; the proposal has one change, ref {@code summary}. */
    public ProposalResult summary(Long resumeId, String tone, boolean consent) {
        User user = currentUser();
        ResumeDoc doc = ownedDoc(user, resumeId);
        String t = tone == null ? "confident" : tone.trim().toLowerCase(Locale.ROOT);
        if (!TONES.contains(t)) throw badRequest("INVALID_TONE", "tone must be one of " + new TreeSet<>(TONES));
        JsonNode json = docJson(doc);
        ResumeDigest digest = AiInputs.resumeDigestV2(json, AiInputs.DETAILED);

        Prompt prompt = ResumePrompts.get("summary.generate");
        int summaryMax = Math.min(SUMMARY_VARIANT_MAX_CHARS, settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_SUMMARY_CHARS));
        Map<String, String> slots = new LinkedHashMap<>();
        slots.put("tone", TONE_INSTRUCTIONS.get(t));
        slots.put("maxChars", String.valueOf(summaryMax));
        slots.put("headline", digest.headline().isEmpty() ? "(none)" : AiInputs.forModel(digest.headline()));
        String target = ResumeDocument.str(json.path("meta"), "target");
        slots.put("target", target.isEmpty() ? "(none)" : AiInputs.forModel(target));
        slots.put("skills", topSkills(json));
        slots.put("resume", digest.text());

        String cacheKey = cacheKey(AiTask.SUMMARY, "", prompt, doc.getContentHash(), new TreeSet<>(), "", t, "");
        Call call = callModel(user, doc, AiTask.SUMMARY, prompt, slots, cacheKey, consent);
        if (call.early() != null) return call.early();

        JsonNode variants = call.json().path("variants");
        if (!variants.isArray()) return error(call.usage());
        String current = currentSummary(digest);
        Sources sources = Sources.of(digest.sourceText()).withMaxChars(summaryMax);
        List<String> alternatives = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        int dropped = 0;
        for (JsonNode v : variants) {
            String text = oneLine(v.asText(""));
            if (alternatives.size() >= MAX_ALTERNATIVES) break;
            if (!seen.add(text.toLowerCase(Locale.ROOT)) || text.equalsIgnoreCase(current) || !AiTruthChecks.check(text, sources, Profile.SUMMARY).isEmpty()) {
                dropped++;
                continue;
            }
            alternatives.add(text);
        }
        ArrayNode kept = om.createArrayNode();
        if (!alternatives.isEmpty()) {
            ObjectNode change = kept.addObject();
            change.put("ref", ResumeDocService.SUMMARY_REF);
            change.put("section", "Summary");
            change.put("before", current);
            ArrayNode alts = change.putArray("alternatives");
            alternatives.forEach(alts::add);
            change.put("reason", SUMMARY_REASON);
            change.putArray("sources");
            change.put("formatted", summaryFormatted(digest));
        }
        return finish(user, doc, AiTask.SUMMARY, null, prompt, cacheKey, call, kept, om.createArrayNode(), dropped, t);
    }

    // ---- suggestions (R4.6) ----------------------------------------------------------------------

    /** The card kinds in the order the carousel shows them (DESIGN 13.3: summary, bullets, keywords, skills, section). */
    static final List<String> KIND_ORDER = List.of("summary", "bullets", "keywords", "skills", "section");
    static final int TITLE_MAX_CHARS = 60;
    static final int BODY_MAX_CHARS = 160;
    /** What a failing Resume Score group means in the prompt's words ("Fix real gaps first"), by group id. */
    static final Map<String, String> GROUP_GAPS = Map.of(
        "G1", "the summary is missing or unclear",
        "G2", "experience bullets need work",
        "G3", "job keywords are missing",
        "G4", "formatting and length",
        "G5", "few measurable results",
        "G6", "ATS readability"
    );

    /**
     * Ask for up to {@code resume.ai.suggestMax} improvement cards for a resume (DESIGN 13.2, R4.6). Each card is
     * stored as its own OPEN {@code suggest} proposal (kind, title, body and its checked changes) pinned to the
     * document's content hash; a change that fails the truth checks is dropped, and a card left with no change is
     * dropped. The answer for the same document is the stored one at zero cost; {@code refresh} asks again anyway
     * (the manual Refresh), and a fresh set replaces the cards it supersedes. 402 {@code PRO_REQUIRED} for Free.
     */
    public ProposalListResult suggest(Long resumeId, boolean consent, boolean refresh) {
        User user = currentUser();
        ResumeDoc doc = ownedDoc(user, resumeId);
        JsonNode json = docJson(doc);
        ResumeDigest digest = AiInputs.resumeDigestV2(json, AiInputs.DETAILED);

        Prompt prompt = ResumePrompts.get("resume.suggest");
        int max = settings.getInt(ResumeBuilderSettingKeys.AI_SUGGEST_MAX);
        int bulletMax = settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_BULLET_CHARS);
        int summaryMax = settings.getInt(ResumeBuilderSettingKeys.DOC_LIMIT_SUMMARY_CHARS);
        Map<String, String> slots = new LinkedHashMap<>();
        slots.put("max", String.valueOf(max));
        slots.put("gaps", scoreGaps(doc));
        slots.put("keywords", "(none)"); // the job's key skills arrive with the job target (R5.6)
        slots.put("jd", "");
        slots.put("resume", digest.text());

        String cacheKey = cacheKey(AiTask.SUGGEST, "", prompt, doc.getContentHash(), new TreeSet<>(), "", "", "");
        Call call = callModel(user, doc, AiTask.SUGGEST, prompt, slots, cacheKey, consent, !refresh);
        if (call.early() != null) {
            ProposalResult early = call.early();
            if (!ProposalResult.CACHED.equals(early.status())) return ProposalListResult.of(early);
            return listOf(ProposalResult.CACHED, user, doc, early.usage(), null);
        }

        JsonNode cards = call.json().path("suggestions");
        if (!cards.isArray()) return ProposalListResult.of(error(call.usage()));
        Sources base = Sources.of(digest.sourceText());
        record Card(String kind, String title, String body, ArrayNode changes) {}
        List<Card> kept = new ArrayList<>();
        Set<String> usedRefs = new LinkedHashSet<>();
        int dropped = 0;
        for (JsonNode s : cards) {
            if (kept.size() >= max) break;
            String kind = s.path("kind").asText("").trim().toLowerCase(Locale.ROOT);
            String title = clip(oneLine(s.path("title").asText("")), TITLE_MAX_CHARS);
            String body = clip(oneLine(s.path("body").asText("")), BODY_MAX_CHARS);
            if (!KIND_ORDER.contains(kind) || title.isEmpty() || !safeCardText(title) || !safeCardText(body)) {
                dropped++;
                continue;
            }
            ArrayNode changes = om.createArrayNode();
            Set<String> cardRefs = new LinkedHashSet<>();
            for (JsonNode c : s.path("changes")) {
                String ref = c.path("ref").asText("").trim();
                Ref r = digest.refs().get(ref);
                // One card per line: a line another card already proposes (or this card does twice) is not offered again.
                if (r == null || usedRefs.contains(ref) || !cardRefs.add(ref)) {
                    dropped++;
                    continue;
                }
                List<String> after = checkedTexts(List.of(c.path("after").asText("")), r, base, "", "SUMMARY".equals(r.sectionKind()) ? summaryMax : bulletMax);
                if (after.isEmpty()) {
                    dropped++;
                    cardRefs.remove(ref);
                    continue;
                }
                ObjectNode change = changes.addObject();
                change.put("ref", ref);
                change.put("section", r.section());
                change.put("before", r.text());
                change.putArray("alternatives").add(after.get(0));
                change.put("reason", reasonOr(c.path("reason").asText(""), "Suggested to strengthen this line"));
                change.putArray("sources").add(ref);
                change.put("formatted", r.formatted());
            }
            if (changes.isEmpty()) continue; // a card with nothing left to propose is dropped (its changes were counted above)
            usedRefs.addAll(cardRefs);
            kept.add(new Card(kind, title, body, changes));
        }
        meters.counter("ai.truth.checked", "task", AiTask.SUGGEST.wire()).increment(kept.size() + dropped);
        meters.counter("ai.truth.dropped", "task", AiTask.SUGGEST.wire()).increment(dropped);
        if (kept.isEmpty()) return new ProposalListResult(ProposalResult.NOTHING_TO_CHANGE, List.of(), doc.getContentHash(), null, call.usage(), null, dropped);

        List<ResumeAiProposal> superseded = proposals.findByUserIdAndResumeIdAndTaskAndStatusOrderByIdAsc(user.getId(), doc.getResumeId(), AiTask.SUGGEST.wire(), ResumeAiProposal.STATUS_OPEN);
        kept.sort(java.util.Comparator.comparingInt(c -> KIND_ORDER.indexOf(c.kind())));
        List<ResumeAiProposal> stored = new ArrayList<>();
        for (Card card : kept) {
            ObjectNode result = om.createObjectNode();
            result.set("changes", card.changes());
            result.set("suggestions", om.createArrayNode());
            result.put("dropped", dropped);
            result.put("prompt", prompt.id() + "@" + prompt.version());
            ResumeAiProposal row = new ResumeAiProposal();
            row.setUser(user);
            row.setResumeId(doc.getResumeId());
            row.setContentHash(doc.getContentHash());
            row.setTask(AiTask.SUGGEST.wire());
            row.setCacheKey(cacheKey);
            row.setResultJson(result.toString());
            row.setModel(call.model());
            row.setAiCallId(call.callId());
            row.setKind(card.kind());
            row.setTitle(card.title());
            row.setBody(card.body());
            stored.add(proposals.save(row));
        }
        // The new set replaces the cards it supersedes (older, or the same document asked again).
        for (ResumeAiProposal old : superseded) {
            old.setStatus(ResumeAiProposal.STATUS_DISMISSED);
            proposals.save(old);
        }
        trimOpen(user.getId());
        return listOf(ProposalResult.OK, stored, doc, call.usage(), dropped);
    }

    /** The resume's open suggestion cards (no AI call): in carousel order, each marked {@code stale} when the document has moved on. */
    @Transactional(readOnly = true)
    public ProposalListResult suggestions(Long resumeId) {
        User user = currentUser();
        ResumeDoc doc = ownedDoc(user, resumeId);
        return listOf(ProposalResult.OK, user, doc, null, null);
    }

    private ProposalListResult listOf(String status, User user, ResumeDoc doc, UsageView usage, Integer dropped) {
        return listOf(status, proposals.findByUserIdAndResumeIdAndTaskAndStatusOrderByIdAsc(user.getId(), doc.getResumeId(), AiTask.SUGGEST.wire(), ResumeAiProposal.STATUS_OPEN), doc, usage, dropped);
    }

    private ProposalListResult listOf(String status, List<ResumeAiProposal> open, ResumeDoc doc, UsageView usage, Integer dropped) {
        List<ResumeAiProposal> rows = new ArrayList<>(open);
        rows.sort(java.util.Comparator.comparingInt(r -> {
            int i = KIND_ORDER.indexOf(r.getKind());
            return i < 0 ? KIND_ORDER.size() : i;
        }));
        List<ProposalView> views = new ArrayList<>();
        boolean stale = false;
        for (ResumeAiProposal row : rows) {
            ProposalView v = present(row, doc.getContentHash());
            if (v.changes().isEmpty()) continue;
            stale |= v.stale();
            views.add(v);
        }
        Instant staleAt = stale ? doc.getUpdatedAt().plus(Duration.ofMinutes(settings.getInt(ResumeBuilderSettingKeys.AI_SUGGEST_STALE_MINUTES))) : null;
        return new ProposalListResult(status, views, doc.getContentHash(), staleAt, usage, null, dropped);
    }

    /** A card's title or body: no link, no e-mail, nothing the privacy patterns would redact. */
    private static boolean safeCardText(String text) {
        return AiTruthChecks.checkReason(text).isEmpty() && SensitivePatterns.scan(text).isEmpty();
    }

    private static String clip(String text, int max) {
        if (text.length() <= max) return text;
        int cut = text.lastIndexOf(' ', max - 1);
        return text.substring(0, cut > max / 2 ? cut : max - 1).stripTrailing() + "…";
    }

    /** The failing Resume Score groups of the stored score (DESIGN 11.5), in the prompt's words; "(none recorded)" when there is no score. */
    private String scoreGaps(ResumeDoc doc) {
        JsonNode score = readJson(doc.getScoreJson());
        List<String> gaps = new ArrayList<>();
        if (score != null) {
            for (JsonNode g : score.path("groups")) {
                String text = GROUP_GAPS.get(g.path("id").asText(""));
                if (text != null && !g.path("pass").asBoolean(true)) gaps.add(text);
            }
        }
        return gaps.isEmpty() ? "(none recorded)" : String.join("; ", gaps);
    }

    /**
     * After an apply the document has a new content hash: the other open suggestion cards of the resume stay usable
     * (re-pinned to it) when every line they propose to change still reads as it did, so applying one card does not
     * leave the carousel stale. A card whose line was just rewritten is left pinned to the old hash (stale).
     */
    private void repinSuggestions(User user, Long resumeId, String oldHash) {
        ResumeDoc fresh = docs.findByResumeIdAndUserId(resumeId, user.getId()).orElse(null);
        if (fresh == null || fresh.getContentHash() == null || fresh.getContentHash().equals(oldHash)) return;
        ResumeDigest digest = AiInputs.resumeDigestV2(docJson(fresh), AiInputs.DETAILED);
        for (ResumeAiProposal p : proposals.findByUserIdAndResumeIdAndTaskAndStatusOrderByIdAsc(user.getId(), resumeId, AiTask.SUGGEST.wire(), ResumeAiProposal.STATUS_OPEN)) {
            if (!oldHash.equals(p.getContentHash())) continue;
            JsonNode stored = readJson(p.getResultJson());
            boolean intact = stored != null;
            if (stored != null) {
                for (JsonNode c : stored.path("changes")) {
                    Ref r = digest.refs().get(c.path("ref").asText(""));
                    if (r == null || !r.text().equals(c.path("before").asText(""))) intact = false;
                }
            }
            if (intact) {
                p.setContentHash(fresh.getContentHash());
                proposals.save(p);
            }
        }
    }

    // ---- apply, dismiss, list --------------------------------------------------------------------

    /**
     * Apply the kept changes of a proposal to its resume. {@code keep} are refs of the proposal; {@code alternatives}
     * picks an alternative per ref by index (default 0). 404 not yours, 409 {@code PROPOSAL_CLOSED} (already
     * applied or dismissed) or {@code PROPOSAL_STALE} (the resume changed), 400 {@code KEEP_EMPTY} /
     * {@code UNKNOWN_REF} / {@code BAD_ALTERNATIVE}, 422 {@code PLACEHOLDER_REMAINS}. Writes through
     * {@link ResumeDocService#applyAiTexts} (marks cleared, {@code src: "ai"}, version {@code AI_APPLY}).
     */
    public ResumeDocDTO apply(Long proposalId, List<String> keep, Map<String, Integer> alternatives) {
        User user = currentUser();
        ResumeAiProposal row = proposals
            .findByIdAndUserId(proposalId, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such proposal"));
        if (!ResumeAiProposal.STATUS_OPEN.equals(row.getStatus())) {
            throw new ResumeDocException(409, "PROPOSAL_CLOSED", "This suggestion was already used or dismissed", Map.of());
        }
        Set<String> kept = keep == null ? Set.of() : new LinkedHashSet<>(keep);
        if (kept.isEmpty()) throw badRequest("KEEP_EMPTY", "Keep at least one change");
        ResumeDoc doc = docs.findByResumeIdAndUserId(row.getResumeId(), user.getId()).orElse(null);
        if (doc == null || !row.getContentHash().equals(doc.getContentHash())) {
            throw new ResumeDocException(409, "PROPOSAL_STALE", "Your resume changed since this suggestion was made", Map.of());
        }

        Map<String, JsonNode> byRef = new LinkedHashMap<>();
        for (JsonNode c : readJson(row.getResultJson()).path("changes")) byRef.put(c.path("ref").asText(""), c);
        Map<String, String> texts = new LinkedHashMap<>();
        for (String ref : kept) {
            JsonNode change = byRef.get(ref);
            if (change == null) throw badRequest("UNKNOWN_REF", "That change is not in this suggestion: " + ref);
            JsonNode alts = change.path("alternatives");
            Integer idx = alternatives == null ? null : alternatives.get(ref);
            int i = idx == null ? 0 : idx;
            if (i < 0 || i >= alts.size()) throw badRequest("BAD_ALTERNATIVE", "No alternative " + i + " for " + ref);
            String text = alts.get(i).asText("");
            if (text.toLowerCase(Locale.ROOT).contains(AiTruthChecks.PLACEHOLDER)) {
                throw new ResumeDocException(
                    422,
                    "PLACEHOLDER_REMAINS",
                    "Replace " + AiTruthChecks.PLACEHOLDER + " with a real number before applying",
                    Map.of("ref", ref)
                );
            }
            texts.put(ref, text);
        }
        ResumeDocDTO dto = docService.applyAiTexts(row.getResumeId(), row.getContentHash(), texts);
        row.setStatus(ResumeAiProposal.STATUS_APPLIED);
        proposals.save(row);
        repinSuggestions(user, row.getResumeId(), row.getContentHash());
        return dto;
    }

    /** Set a proposal aside; its cache entry stops answering. 404 when it is not the caller's. Idempotent. */
    public void dismiss(Long proposalId) {
        User user = currentUser();
        ResumeAiProposal row = proposals
            .findByIdAndUserId(proposalId, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such proposal"));
        if (ResumeAiProposal.STATUS_OPEN.equals(row.getStatus())) {
            row.setStatus(ResumeAiProposal.STATUS_DISMISSED);
            proposals.save(row);
        }
    }

    /** The resume's open proposals, newest first, each marked {@code stale} when the document has moved on. */
    @Transactional(readOnly = true)
    public List<ProposalView> openProposals(Long resumeId) {
        User user = currentUser();
        ResumeDoc doc = ownedDoc(user, resumeId);
        List<ProposalView> out = new ArrayList<>();
        for (ResumeAiProposal p : proposals.findByUserIdAndResumeIdAndStatusOrderByCreatedAtDesc(user.getId(), resumeId, ResumeAiProposal.STATUS_OPEN)) {
            out.add(present(p, doc.getContentHash()));
        }
        return out;
    }

    // ---- the gate-and-call block (I0.3's AiGateway.call replaces this method) ---------------------

    /**
     * What {@link #callModel} hands back: either {@code early} (a refusal or a cache hit - the caller returns it as
     * is) or the model's parsed {@code json} with the usage after the call, the ledger row and the model used.
     */
    private record Call(ProposalResult early, JsonNode json, UsageView usage, Long callId, String model) {}

    /**
     * Feature switch, budget decision, consent, cache, caps, prompt render, provider call, metering and strict JSON
     * (one automatic retry with a "return only JSON" nudge). Never throws for a provider failure: that is
     * {@code error}. Throws {@link ProRequiredException} (Free) and {@code 429 RATE_LIMITED}.
     */
    private Call callModel(User user, ResumeDoc doc, AiTask task, Prompt prompt, Map<String, String> slots, String cacheKey, boolean consent) {
        return callModel(user, doc, task, prompt, slots, cacheKey, consent, true);
    }

    /** {@code useCache} false asks for a fresh answer (the suggestions' manual Refresh): the stored one is not looked up. */
    private Call callModel(User user, ResumeDoc doc, AiTask task, Prompt prompt, Map<String, String> slots, String cacheKey, boolean consent, boolean useCache) {
        String login = user.getLogin();
        if (!enabled || !provider.isConfigured() || !settings.getBool(ResumeBuilderSettingKeys.AI_FEATURE_RESUME)) {
            return early(ProposalResult.refusal(ProposalResult.DISABLED, null));
        }
        Decision d = budget.decide(login, task);
        switch (d.verdict()) {
            case TASK_DISABLED -> {
                return early(ProposalResult.refusal(ProposalResult.DISABLED, null));
            }
            case PRO_REQUIRED -> throw new ProRequiredException(ProRequiredException.CODE_PRO_REQUIRED, featureName(task) + " is part of Kiwiply Pro");
            default -> {}
        }
        UsageView usage = usage(d);
        if (!consent) return early(ProposalResult.refusal(ProposalResult.CONSENT_REQUIRED, usage));

        var hit = useCache
            ? proposals.findFirstByUserIdAndResumeIdAndCacheKeyAndStatusOrderByCreatedAtDesc(user.getId(), doc.getResumeId(), cacheKey, ResumeAiProposal.STATUS_OPEN)
            : java.util.Optional.<ResumeAiProposal>empty();
        if (hit.isPresent()) {
            return early(new ProposalResult(ProposalResult.CACHED, present(hit.get(), doc.getContentHash()), usage, null, null));
        }
        if (d.verdict() == AiBudgetService.Verdict.EXHAUSTED) return early(ProposalResult.refusal(ProposalResult.QUOTA_EXCEEDED, usage));

        Instant now = Instant.now();
        int perMinute = settings.getInt(ResumeBuilderSettingKeys.RATE_AI_PER_MIN);
        if (calls.countByLoginAndTaskInAndCreatedAtGreaterThanEqual(login, RATE_TASKS, now.minus(Duration.ofMinutes(1))) >= perMinute) {
            throw new ResumeDocException(429, "RATE_LIMITED", "Too many AI requests - try again in a moment", Map.of("retryAfter", 60));
        }
        int dailyCap = settings.getInt(ResumeBuilderSettingKeys.AI_CAP_RESUME_DAILY);
        Instant dayStart = LocalDate.now(ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC).toInstant();
        long today = calls.countByLoginAndTaskInAndCreatedAtGreaterThanEqual(login, DAILY_CAP_TASKS, dayStart);
        if (today >= dailyCap) {
            UsageView daily = new UsageView((int) Math.min(today, Integer.MAX_VALUE), dailyCap, dayStart.plus(Duration.ofDays(1)), false);
            return early(new ProposalResult(ProposalResult.QUOTA_EXCEEDED, null, daily, ProposalResult.CAP_DAILY, null));
        }

        String question = prompt.render(slots);
        int maxTokens = settings.getInt(ResumeBuilderSettingKeys.AI_OUTPUT_TOKENS_REWRITE);
        JsonNode json;
        AiResult result;
        try {
            result = provider.generate(task, d.model(), question, "", maxTokens);
            // The provider billed us whether or not the reply is usable, so every call is recorded first.
            metering.record(login, task, result);
            json = readJson(result.text());
            if (json == null || !json.isObject()) {
                result = provider.generate(task, d.model(), question + "\n\nYour previous reply was not valid JSON. Return ONLY the JSON object described above, nothing else.", "", maxTokens);
                metering.record(login, task, result);
                json = readJson(result.text());
            }
        } catch (AiProviderException e) {
            LOG.warn("Resume AI {} failed: {}", task.wire(), e.getMessage());
            return early(ProposalResult.refusal(ProposalResult.ERROR, usage));
        }
        UsageView after = usage(budget.decide(login, task));
        if (json == null || !json.isObject()) {
            LOG.warn("Resume AI {} returned no usable JSON", task.wire());
            return early(ProposalResult.refusal(ProposalResult.ERROR, after));
        }
        Long callId = calls.findFirstByLoginAndTaskOrderByIdDesc(login, task.wire()).map(AiCall::getId).orElse(null);
        return new Call(null, json, after, callId, result.model());
    }

    private static Call early(ProposalResult r) {
        return new Call(r, null, null, null, null);
    }

    /** Store the checked changes as an OPEN proposal (or answer {@code nothingToChange}) and present it. */
    private ProposalResult finish(
        User user,
        ResumeDoc doc,
        AiTask task,
        String mode,
        Prompt prompt,
        String cacheKey,
        Call call,
        ArrayNode changes,
        ArrayNode suggestions,
        int dropped,
        String tone
    ) {
        int considered = changes.size() + dropped;
        meters.counter("ai.truth.checked", "task", task.wire()).increment(considered);
        meters.counter("ai.truth.dropped", "task", task.wire()).increment(dropped);
        if (changes.isEmpty()) {
            return new ProposalResult(ProposalResult.NOTHING_TO_CHANGE, null, call.usage(), null, dropped);
        }
        ObjectNode result = om.createObjectNode();
        result.set("changes", changes);
        result.set("suggestions", suggestions);
        result.put("dropped", dropped);
        result.put("prompt", prompt.id() + "@" + prompt.version());
        if (tone != null) result.put("tone", tone);

        ResumeAiProposal row = new ResumeAiProposal();
        row.setUser(user);
        row.setResumeId(doc.getResumeId());
        row.setContentHash(doc.getContentHash());
        row.setTask(task.wire());
        row.setMode(mode);
        row.setCacheKey(cacheKey);
        row.setResultJson(result.toString());
        row.setModel(call.model());
        row.setAiCallId(call.callId());
        row = proposals.save(row);
        trimOpen(user.getId());
        return new ProposalResult(ProposalResult.OK, present(row, doc.getContentHash()), call.usage(), null, dropped);
    }

    private void trimOpen(Long userId) {
        List<ResumeAiProposal> open = proposals.findByUserIdAndStatusOrderByCreatedAtAsc(userId, ResumeAiProposal.STATUS_OPEN);
        if (open.size() > MAX_OPEN_PROPOSALS) proposals.deleteAll(open.subList(0, open.size() - MAX_OPEN_PROPOSALS));
    }

    // ---- presenting a stored proposal --------------------------------------------------------------

    private ProposalView present(ResumeAiProposal row, String currentHash) {
        JsonNode j = readJson(row.getResultJson());
        List<ChangeView> changes = new ArrayList<>();
        List<String> suggestions = new ArrayList<>();
        if (j != null) {
            for (JsonNode c : j.path("changes")) {
                List<String> alts = new ArrayList<>();
                c.path("alternatives").forEach(a -> alts.add(a.asText()));
                if (alts.isEmpty()) continue;
                List<String> sources = new ArrayList<>();
                c.path("sources").forEach(s -> sources.add(s.asText()));
                changes.add(
                    new ChangeView(
                        c.path("ref").asText(),
                        c.path("section").asText(""),
                        c.path("before").asText(""),
                        alts.get(0),
                        alts.size() > 1 ? alts : null,
                        c.path("reason").asText(""),
                        sources,
                        c.path("formatted").asBoolean(false)
                    )
                );
            }
            j.path("suggestions").forEach(s -> suggestions.add(s.asText()));
        }
        return new ProposalView(
            row.getId(),
            row.getTask(),
            row.getMode(),
            !row.getContentHash().equals(currentHash),
            row.getCreatedAt(),
            changes,
            suggestions,
            row.getKind(),
            row.getTitle(),
            row.getBody(),
            row.getModel(),
            row.getAiCallId()
        );
    }

    // ---- helpers -----------------------------------------------------------------------------------

    /** The requested refs: non-empty, distinct, at most {@code resume.ai.rewriteMaxRefs}, every one a visible line of the resume. */
    private List<String> requestedRefs(List<String> refs, ResumeDigest digest) {
        int max = settings.getInt(ResumeBuilderSettingKeys.AI_REWRITE_MAX_REFS);
        List<String> wanted = refs == null ? List.of() : new ArrayList<>(new LinkedHashSet<>(refs));
        if (wanted.isEmpty()) throw badRequest("INVALID_REFS", "Choose at least one line to rewrite");
        if (wanted.size() > max) throw badRequest("INVALID_REFS", "At most " + max + " lines can be rewritten at once");
        for (String ref : wanted) {
            if (ref == null || !digest.refs().containsKey(ref)) throw badRequest("INVALID_REFS", "Not a line of this resume: " + ref);
        }
        return wanted;
    }

    /** sha256(task|mode|promptVersion|contentHash|refs sorted|jdHash|tone|language) - DESIGN 13.1. */
    static String cacheKey(AiTask task, String mode, Prompt prompt, String contentHash, Set<String> refs, String jdHash, String tone, String language) {
        return AiInputs.sha256(
            String.join("|", task.wire(), mode, prompt.id() + "@" + prompt.version(), contentHash, String.join(",", refs), jdHash, tone, language)
        );
    }

    private static String featureName(AiTask task) {
        return switch (task) {
            case REWRITE -> "Rewrite with AI";
            case SUMMARY -> "AI summary";
            case SUGGEST -> "AI suggestions";
            case COVER -> "AI cover letters";
            case TRANSLATE -> "AI translation";
            default -> "This AI feature";
        };
    }

    private static UsageView usage(Decision d) {
        return new UsageView(d.used(), d.limit(), d.resetsAt(), d.economy());
    }

    private static ProposalResult error(UsageView usage) {
        return ProposalResult.refusal(ProposalResult.ERROR, usage);
    }

    /** The model's alternatives: an array of strings, or the single string a lazier reply used. */
    private static List<String> texts(JsonNode alternatives, JsonNode... fallbacks) {
        List<String> out = new ArrayList<>();
        if (alternatives.isArray()) {
            alternatives.forEach(a -> {
                if (a.isTextual()) out.add(a.textValue());
            });
        }
        if (out.isEmpty()) {
            for (JsonNode f : fallbacks) if (f.isTextual()) out.add(f.textValue());
        }
        return out;
    }

    private static String oneLine(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim();
    }

    /** The model's explanation, or {@code fallback} when it is empty, too long or carries a link. */
    private static String reasonOr(String reason, String fallback) {
        String r = oneLine(reason);
        return r.isEmpty() || !AiTruthChecks.checkReason(r).isEmpty() ? fallback : r;
    }

    private static String topSkills(JsonNode doc) {
        List<String> skills = new ArrayList<>();
        for (JsonNode section : ResumeDocument.visibleSections(doc, ResumeDocument.Kind.SKILLS)) {
            for (JsonNode item : ResumeDocument.visibleItems(section)) {
                for (JsonNode s : ResumeDocument.list(item, "skills")) {
                    String t = s.isTextual() ? AiInputs.forModel(s.textValue()) : "";
                    if (!t.isEmpty() && skills.size() < TOP_SKILLS) skills.add(t);
                }
            }
        }
        return skills.isEmpty() ? "(none)" : String.join(", ", skills);
    }

    private static String currentSummary(ResumeDigest digest) {
        for (Ref r : digest.refs().values()) if ("SUMMARY".equals(r.sectionKind())) return r.text();
        return "";
    }

    private static boolean summaryFormatted(ResumeDigest digest) {
        for (Ref r : digest.refs().values()) if ("SUMMARY".equals(r.sectionKind())) return r.formatted();
        return false;
    }

    /** The first JSON object in a reply (models sometimes wrap it in prose or a fence), or null. */
    private JsonNode readJson(String text) {
        try {
            String t = text == null ? "" : text.trim();
            int start = t.indexOf('{');
            if (start < 0) return null;
            return om.readTree(t.substring(start, t.lastIndexOf('}') + 1));
        } catch (Exception e) {
            return null;
        }
    }

    /** The stored document as the current schema (a v1 row is upgraded in memory); an empty object if it cannot be read. */
    private static JsonNode docJson(ResumeDoc d) {
        try {
            return ResumeDocumentUpgrader.upgrade(ResumeDocument.parse(d.getDocJson()));
        } catch (RuntimeException e) {
            return JsonNodeFactory.instance.objectNode();
        }
    }

    private static ResumeDocException badRequest(String code, String message) {
        return new ResumeDocException(400, code, message, Map.of());
    }

    private ResumeDoc ownedDoc(User user, Long resumeId) {
        return docs
            .findByResumeIdAndUserId(resumeId, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resume document not found"));
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
