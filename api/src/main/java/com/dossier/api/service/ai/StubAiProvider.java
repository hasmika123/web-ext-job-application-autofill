package com.dossier.api.service.ai;

import com.dossier.api.service.privacy.SensitivePatterns;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A deterministic stand-in for the real LLM (I1.14), so every server-AI flow can be exercised end to end - through
 * the router, the budget, the ledger, the truth checks - with no key, no network and no cost. It is selected ONLY by
 * the {@code ai-stub} Spring profile (see {@code AiConfiguration}, which refuses to start it next to {@code prod});
 * it is never a bean and nothing else constructs it.
 *
 * <p>It answers each {@link AiTask} in the shape that task's service parses, derived from the prompt it was given
 * (the numbered ids, refs and option lists the prompt itself contains), never from a model. It is also
 * <b>adversarial on purpose</b>: writing tasks (rewrite, summary, suggest, tailor) return one acceptable text and one
 * that invents a number, so a run proves the truth checks drop the invented one.
 *
 * <p>Two probes the smoke script relies on, both visible only in the stub's own answer:
 * <ul>
 *   <li>if the prompt it received still contains a never-collected value ({@link SensitivePatterns}), the answer says
 *       {@value #SAW_SENSITIVE} - which proves a value reached the "provider" when it should have been stripped;</li>
 *   <li>if the prompt contains {@value #FAIL_MARKER}, the call fails as an HTTP 503 (to prove the failure ledger row).</li>
 * </ul>
 */
public final class StubAiProvider implements AiProvider {

    /** Appears in an answer when the stub was handed a never-collected value. */
    public static final String SAW_SENSITIVE = "STUB-SAW-SENSITIVE";
    /** Put this in a prompt to make the stub fail that call with an HTTP 503. */
    public static final String FAIL_MARKER = "STUB-FAIL-503";
    /** The number the stub's "bad" rewrites invent; no real fixture contains it. */
    public static final String INVENTED_NUMBER = "340%";

    private static final Pattern REF_LINE = Pattern.compile("(?m)^\\s*(?:Summary |Achievement )?\\[([A-Za-z0-9_]+)\\]:? (.+)$");
    private static final Pattern PICK_OPTION = Pattern.compile("(?m)^- (.+)$");
    private static final Pattern MAP_FIELD = Pattern.compile("(?m)^(\\d+)\\. (.+)$");
    private static final Pattern TOP_SKILLS = Pattern.compile("(?m)^Top skills: (.+)$");
    private static final Pattern SKILLS_LINE = Pattern.compile("(?m)^Skills: (.+)$");
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    private static final int LATENCY_MS = 5;

    private final String defaultModel;
    private final boolean readsResumes;

    public StubAiProvider(String defaultModel) {
        this(defaultModel, true);
    }

    /**
     * @param readsResumes false = resume parsing answers "unavailable" (503) instead of the canned resume, so a client falls back to its own
     *     parser and shows the real resume. The enterprise demo sets this ({@code DOSSIER_AI_STUB_PARSE_RESUME=false}): the canned
     *     "Ada Stub" resume would replace the presenter's real one on stage.
     */
    public StubAiProvider(String defaultModel, boolean readsResumes) {
        this.defaultModel = defaultModel == null || defaultModel.isBlank() ? "gemini-2.5-flash-lite" : defaultModel.trim();
        this.readsResumes = readsResumes;
    }

    @Override
    public String id() {
        return "gemini";
    }

    @Override
    public boolean isConfigured() {
        return true;
    }

    @Override
    public String defaultModel() {
        return defaultModel;
    }

    @Override
    public AiResult generate(AiTask task, String model, String question, String context) {
        return generate(task, model, question, context, 0);
    }

    @Override
    public AiResult generate(AiTask task, String model, String question, String context, int maxOutputTokens) {
        String prompt = (question == null ? "" : question) + "\n" + (context == null ? "" : context);
        failIfAsked(prompt);
        if (task == AiTask.PARSE && !readsResumes) throw new AiProviderException("The stub does not read resumes (dossier.ai.stub-parse-resume=false)", 503, null);
        String text = answer(task, prompt, question == null ? "" : question);
        return result(text, model, prompt);
    }

    @Override
    public AiResult generateWithTimeout(AiTask task, String model, String question, String context, int maxOutputTokens, int timeoutMs) {
        return generate(task, model, question, context, maxOutputTokens);
    }

    @Override
    public AiResult parseResume(String model, String text, String fileBase64, String fileMimeType) {
        String prompt = text == null ? "" : text;
        failIfAsked(prompt);
        if (!readsResumes) throw new AiProviderException("The stub does not read resumes (dossier.ai.stub-parse-resume=false)", 503, null);
        return result(parsedResume(prompt), model, prompt);
    }

    @Override
    public AiResult parseResume(String model, String text, String fileBase64, String fileMimeType, int maxOutputTokens) {
        return parseResume(model, text, fileBase64, fileMimeType);
    }

    // ---- answers ------------------------------------------------------------------------------------------

    private static String answer(AiTask task, String prompt, String question) {
        String sensitive = SensitivePatterns.scan(prompt).isEmpty() ? "" : " " + SAW_SENSITIVE + ".";
        return switch (task) {
            case DRAFT -> draft(question, prompt) + sensitive;
            case PICK -> pick(question);
            case MAP -> mapFields(question);
            case ENRICH -> "{\"jobType\":\"FULL_TIME\",\"jobMode\":\"REMOTE\",\"salaryMin\":null,\"salaryMax\":null,\"salaryCurrency\":null,\"salaryPeriod\":null}";
            case PARSE -> parsedResume(prompt);
            case MATCH -> scores(prompt, "r", 88, 12);
            case JOBS -> scores(prompt, "j", 85, 9);
            case FIT -> fit(prompt, sensitive);
            case TAILOR -> tailor(prompt);
            case REWRITE -> rewrite(prompt);
            case SUMMARY -> summary(prompt, sensitive);
            case SUGGEST -> suggest(prompt);
            case INBOX -> "{\"results\":[]}";
            case PROBE -> "OK";
            case COVER, TRANSLATE -> "{}";
        };
    }

    /** The LAST option under "Options (choose ONE):" - deterministic, and not the first, so a lazy default is visible. */
    private static String pick(String question) {
        int at = question.indexOf("Options");
        // only the option list itself: the candidate background that follows it has "- " bullet lines too
        String list = at < 0 ? question : question.substring(at);
        int end = list.indexOf("\n\n");
        Matcher m = PICK_OPTION.matcher(end > 0 ? list.substring(0, end) : list);
        String last = "Yes";
        while (m.find()) last = m.group(1).trim();
        return last;
    }

    /** Numbered labels to the canonical keys a person would pick for them; anything else "unknown". */
    private static String mapFields(String question) {
        int at = question.indexOf("Fields:");
        Matcher m = MAP_FIELD.matcher(at < 0 ? question : question.substring(at));
        Map<String, String> out = new LinkedHashMap<>();
        while (m.find()) {
            String label = m.group(2).toLowerCase(Locale.ROOT);
            String key = label.contains("first") ? "firstName"
                : label.contains("last") || label.contains("surname") ? "lastName"
                : label.contains("email") ? "email"
                : label.contains("phone") ? "phone"
                : "unknown";
            out.put(m.group(1), key);
        }
        StringBuilder sb = new StringBuilder("{");
        out.forEach((n, k) -> sb.append(sb.length() > 1 ? "," : "").append('"').append(n).append("\":\"").append(k).append('"'));
        return sb.append('}').toString();
    }

    /** {@code {"scores":[{"id":"<prefix>N","score":..,"why":..}]}} for every {@code [<prefix>N]} id the prompt lists, best first. */
    private static final Pattern DRAFT_COMPANY = Pattern.compile("(?i)\\b(?:work (?:at|for)|join(?:ing)?|interested in|apply(?:ing)? to|about) ([A-Z][A-Za-z0-9&.\\-]*(?: [A-Z][A-Za-z0-9&.\\-]*){0,3})");

    /**
     * A draft that reads as written for the question asked (the demo stack shows it on screen): the kind of question picks the shape, a company
     * the question names is used by name, and the skills come from the background when it lists them. Still deterministic, still no model.
     */
    static String draft(String question, String prompt) {
        String q = question == null ? "" : question;
        String lower = q.toLowerCase(java.util.Locale.ROOT);
        List<String> skills = listAfter(TOP_SKILLS, prompt, 3);
        if (skills.isEmpty()) skills = listAfter(SKILLS_LINE, prompt, 3);
        String stack = skills.isEmpty() ? "cloud infrastructure, automation and reliable delivery" : String.join(", ", skills);
        Matcher c = DRAFT_COMPANY.matcher(q);
        String company = c.find() ? c.group(1).replaceAll("[?.!,]+$", "") : "your team";
        if (lower.contains("why")) {
            return "I'm drawn to " + company + " because the role centres on the work I do best: " + stack + ". In my recent projects I've taken ownership of systems "
                + "other teams depend on, and I'd bring that same care for reliability and clear communication here.";
        }
        if (lower.contains("challenge") || lower.contains("difficult") || lower.contains("problem")) {
            return "On a recent project a release pipeline kept failing under load. I traced it to shared state between jobs, split the work into isolated steps and added "
                + "checks before each deploy. Releases became predictable again, and the team adopted the pattern for other services.";
        }
        if (lower.contains("salary") || lower.contains("compensation") || lower.contains("rate")) {
            return "I'm flexible and happy to discuss compensation once we've confirmed the scope of the role. My priority is a good fit with the team and the work.";
        }
        if (lower.contains("start") || lower.contains("available") || lower.contains("notice")) {
            return "I can start within two weeks of an offer, and I'm happy to align the exact date with your onboarding schedule.";
        }
        if (lower.contains("yourself") || lower.contains("background") || lower.contains("experience")) {
            return "I'm an engineer focused on " + stack + ". I like turning messy requirements into simple, well-tested systems, and I work closely with product "
                + "and operations so what we ship is easy to run.";
        }
        return "My background in " + stack + " lines up closely with what this question asks. I focus on dependable, well-documented work and keep the people "
            + "who rely on it informed.";
    }

    private static String scores(String prompt, String prefix, int top, int step) {
        Matcher m = Pattern.compile("\\[(" + prefix + "\\d+)\\]").matcher(prompt);
        List<String> ids = new ArrayList<>();
        while (m.find()) if (!ids.contains(m.group(1))) ids.add(m.group(1));
        StringBuilder sb = new StringBuilder("{\"scores\":[");
        for (int i = 0; i < ids.size(); i++) {
            sb.append(i > 0 ? "," : "").append("{\"id\":\"").append(ids.get(i)).append("\",\"score\":").append(Math.max(5, top - i * step)).append(",\"why\":\"Core stack lines up with the role\"}");
        }
        return sb.append("]}").toString();
    }

    private static String fit(String prompt, String sensitive) {
        List<String> skills = listAfter(SKILLS_LINE, prompt, 3);
        StringBuilder matched = new StringBuilder();
        for (String s : skills) matched.append(matched.length() > 0 ? "," : "").append(quote(s));
        return "{\"score\":78,\"summary\":\"Solid match on the core stack." + sensitive.replace("\"", "") + "\",\"matched\":[" + matched + "],\"missing\":[\"GraphQL\"],\"redFlags\":[]}";
    }

    /** Tailor: the first bullet reworded acceptably, the last one with an invented number (to be dropped). */
    private static String tailor(String prompt) {
        Matcher m = Pattern.compile("(?m)^\\s*\\[(e\\d+b\\d+)\\] (.+)$").matcher(prompt);
        List<String[]> bullets = new ArrayList<>();
        while (m.find()) bullets.add(new String[] { m.group(1), m.group(2).trim() });
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < bullets.size(); i++) {
            boolean bad = i == bullets.size() - 1 && bullets.size() > 1;
            String text = bad ? bullets.get(i)[1] + " and grew revenue " + INVENTED_NUMBER : reword(bullets.get(i)[1]);
            b.append(b.length() > 0 ? "," : "").append("{\"ref\":").append(quote(bullets.get(i)[0])).append(",\"text\":").append(quote(text)).append('}');
        }
        List<String> skills = listAfter(SKILLS_LINE, prompt, 20);
        java.util.Collections.reverse(skills);
        StringBuilder order = new StringBuilder();
        for (String s : skills) order.append(order.length() > 0 ? "," : "").append(quote(s));
        return "{\"bullets\":[" + b + "],\"skillsOrder\":[" + order + "],\"suggestions\":[\"GraphQL\"]}";
    }

    /** Rewrite: ref 1 gets a good and a bad alternative, the LAST ref (when there are two or more) only a bad one. */
    private static String rewrite(String prompt) {
        List<String[]> lines = refLines(prompt, "Lines:");
        StringBuilder out = new StringBuilder("{\"changes\":[");
        for (int i = 0; i < lines.size(); i++) {
            String ref = lines.get(i)[0];
            String text = lines.get(i)[1];
            boolean badOnly = i == lines.size() - 1 && lines.size() > 1;
            String alts = badOnly ? quote(text + " and grew revenue " + INVENTED_NUMBER) : quote(reword(text)) + "," + quote(text + " and grew revenue " + INVENTED_NUMBER);
            out.append(i > 0 ? "," : "").append("{\"ref\":").append(quote(ref)).append(",\"alternatives\":[").append(alts).append("],\"reason\":\"Reworded as asked\"}");
        }
        return out.append("]}").toString();
    }

    private static String summary(String prompt, String sensitive) {
        List<String> skills = listAfter(TOP_SKILLS, prompt, 4);
        String stack = skills.isEmpty() || "(none)".equals(skills.get(0)) ? "software delivery" : String.join(", ", skills);
        String good = "Dependable engineer who ships carefully, with hands-on experience in " + stack + "." + sensitive;
        String bad = "Engineer with 15 years of experience delivering results.";
        return "{\"variants\":[" + quote(good) + "," + quote(bad) + "]}";
    }

    /** Suggest: a good "bullets" card on the first ref, and a "summary" card that invents a number (to be dropped). */
    private static String suggest(String prompt) {
        List<String[]> lines = refLines(prompt, "Resume:");
        if (lines.isEmpty()) return "{\"suggestions\":[]}";
        String[] first = lines.get(0);
        String[] last = lines.get(lines.size() - 1);
        StringBuilder cards = new StringBuilder();
        cards.append("{\"kind\":\"bullets\",\"title\":\"Make this line land\",\"body\":\"A clearer version of the same achievement.\",\"changes\":[{\"ref\":")
            .append(quote(first[0])).append(",\"after\":").append(quote(reword(first[1]))).append(",\"reason\":\"Clearer wording\"}]}");
        if (lines.size() > 1) {
            cards.append(",{\"kind\":\"summary\",\"title\":\"Add a result\",\"body\":\"Lead with an outcome.\",\"changes\":[{\"ref\":")
                .append(quote(last[0])).append(",\"after\":").append(quote(last[1] + " and grew revenue " + INVENTED_NUMBER)).append(",\"reason\":\"A number reads well\"}]}");
        }
        return "{\"suggestions\":[" + cards + "]}";
    }

    /** A canned structured resume; the email is lifted from the text when it has one, so the parse is not blind. */
    private static String parsedResume(String text) {
        Matcher m = EMAIL.matcher(text == null ? "" : text);
        String email = m.find() ? m.group() : "ada.stub@example.test";
        String sensitive = SensitivePatterns.scan(text == null ? "" : text).isEmpty() ? "" : " " + SAW_SENSITIVE + ".";
        return "{\"summary\":\"Backend engineer who ships reliable services." + sensitive + "\","
            + "\"skills\":[\"Java\",\"SQL\",\"Kubernetes\"],"
            + "\"experience\":[{\"company\":\"Acme Corp\",\"title\":\"Backend Engineer\",\"location\":\"Austin, TX\",\"startDate\":\"Jan 2020\",\"endDate\":\"\",\"current\":true,"
            + "\"bullets\":[\"Built the billing service\",\"Reduced p99 latency by 40%\"]}],"
            + "\"education\":[{\"school\":\"State University\",\"degree\":\"BS\",\"field\":\"Computer Science\",\"location\":\"\",\"startDate\":\"2014\",\"endDate\":\"2018\",\"gpa\":\"\"}],"
            + "\"languages\":[],\"projects\":[],"
            + "\"bio\":{\"firstName\":\"Ada\",\"lastName\":\"Stub\",\"email\":" + quote(email) + ",\"phone\":\"\",\"city\":\"Austin\",\"state\":\"TX\",\"country\":\"US\",\"linkedin\":\"\",\"github\":\"\",\"website\":\"\"}}";
    }

    // ---- helpers ------------------------------------------------------------------------------------------

    /** A reworded line that adds no number, date or capitalised name: the same text, finished off with a plain tail. */
    private static String reword(String text) {
        String t = text.trim();
        return t.endsWith(" end to end") ? t.substring(0, t.length() - " end to end".length()) : t + " end to end";
    }

    private static List<String[]> refLines(String prompt, String after) {
        int at = prompt.indexOf(after);
        Matcher m = REF_LINE.matcher(at < 0 ? prompt : prompt.substring(at));
        List<String[]> out = new ArrayList<>();
        while (m.find()) out.add(new String[] { m.group(1), m.group(2).trim() });
        return out;
    }

    private static List<String> listAfter(Pattern p, String prompt, int max) {
        Matcher m = p.matcher(prompt);
        List<String> out = new ArrayList<>();
        if (m.find()) {
            for (String s : m.group(1).split(",")) {
                String v = s.trim();
                if (!v.isEmpty() && out.size() < max) out.add(v);
            }
        }
        return out;
    }

    private static String quote(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c < 0x20 ? " " : String.valueOf(c));
            }
        }
        return sb.append('"').toString();
    }

    private static void failIfAsked(String prompt) {
        if (prompt.contains(FAIL_MARKER)) throw new AiProviderException("Stub provider failure (as asked)", 503, null);
    }

    private AiResult result(String text, String model, String prompt) {
        try {
            Thread.sleep(LATENCY_MS); // a real call takes time; keeps latency_ms honest in the ledger
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        String m = model == null || model.isBlank() ? defaultModel : model.trim();
        int in = Math.max(1, prompt.length() / 4);
        int out = Math.max(1, text.length() / 4);
        return new AiResult(text, m, in, 0, out);
    }
}
