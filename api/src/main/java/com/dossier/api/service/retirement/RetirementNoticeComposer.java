package com.dossier.api.service.retirement;

import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.service.retirement.SuccessorAdvisor.Suggestion;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Currency;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

/**
 * Writes the words of a retirement notice (docs/subscriptions/11-plan-retirement.md section 4.2; story K10.3) from the copy register: the keys {@code email.kw.retire.*}
 * of {@code messages.properties}, one place, so the e-mail, the in-app notice and the admin preview say the same thing in the same tone: warm, specific, the date in
 * every message, no pre-selected choice, a higher price never moves anyone without their say-so. Pure given its inputs (no repository, no clock).
 */
@Component
public class RetirementNoticeComposer {

    static final String P = "email.kw.retire.";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH).withZone(ZoneOffset.UTC);

    /** What a notice is about, already looked up. {@code suggestion} is null when no successor is ranked or priced; {@code applied} writes the "moved to Free" confirmation. */
    public record Input(
        String firstName,
        String subjectName,
        boolean addon,
        Instant effectiveAt,
        String defaultOutcome,
        Suggestion suggestion,
        String currency,
        String interval,
        List<String> lockedNames,
        String message,
        int days,
        boolean applied,
        String link
    ) {}

    /** Every line of a notice, ready for the e-mail template, the in-app notice and the admin preview. */
    public record Notice(
        String subject,
        String preheader,
        String kicker,
        String line1,
        String line2,
        String intro,
        String stripTitle,
        String stripText,
        List<String> paragraphs,
        String emphasis,
        String button,
        String footer,
        String effectiveDate,
        String defaultOutcome,
        String suggest,
        String cancel,
        String message,
        String link
    ) {}

    private final MessageSource messages;

    public RetirementNoticeComposer(MessageSource messages) {
        this.messages = messages;
    }

    public Notice compose(Input in, Locale locale, Function<String, String> featureName) {
        String date = DATE.format(in.effectiveAt());
        String name = in.subjectName() == null ? "" : in.subjectName();
        String hello = in.firstName() == null || in.firstName().isBlank() ? "Hi," : "Hi " + in.firstName().trim() + ",";
        if (in.applied()) return applied(in, locale, featureName, date, name, hello);

        String planName = withoutTrailingPlan(name);
        String subject = msg("subject", locale, planName, date);
        String intro = hello + " " + msg(in.addon() ? "intro.addon" : "intro", locale, name, date);
        String suggest = suggest(in, locale, featureName);
        String outcome = outcomeLine(in, locale, date);
        String cancel = msg("cancel", locale, name, date);
        String message = plain(in.message());
        List<String> paragraphs = new ArrayList<>();
        if (suggest != null) paragraphs.add(suggest);
        paragraphs.add(cancel);
        if (message != null) paragraphs.add(message);
        String emphasis = in.days() == 1 ? msg("lastDay", locale) : null;
        return new Notice(
            subject,
            msg("pre", locale, date),
            msg("kicker", locale),
            msg("l1", locale, planName),
            msg("l2", locale),
            intro,
            msg("strip.title", locale, date),
            outcome,
            List.copyOf(paragraphs),
            emphasis,
            msg("button", locale),
            msg("footer", locale, name),
            date,
            outcome,
            suggest,
            cancel,
            message,
            in.link()
        );
    }

    private Notice applied(Input in, Locale locale, Function<String, String> featureName, String date, String name, String hello) {
        String subject = msg("applied.subject", locale);
        String intro = hello + " " + msg("applied.intro", locale, withoutTrailingPlan(name), date);
        List<String> paragraphs = new ArrayList<>();
        if (in.lockedNames() != null && !in.lockedNames().isEmpty()) paragraphs.add(msg("applied.locked", locale, String.join(", ", in.lockedNames())));
        paragraphs.add(msg("applied.unlock", locale));
        return new Notice(
            subject,
            msg("applied.pre", locale),
            msg("applied.kicker", locale),
            msg("applied.l1", locale),
            msg("applied.l2", locale),
            intro,
            msg("applied.strip.title", locale),
            msg("applied.strip.text", locale),
            List.copyOf(paragraphs),
            null,
            msg("applied.button", locale),
            msg("footer", locale, name),
            date,
            msg("applied.strip.text", locale),
            null,
            null,
            null,
            in.link()
        );
    }

    private String suggest(Input in, Locale locale, Function<String, String> featureName) {
        Suggestion s = in.suggestion();
        if (s == null || "FREE".equals(s.kind())) return null;
        String diff = diffLine(s, in.currency(), in.interval(), locale);
        String line = msg("suggest", locale, s.successorName() == null ? s.successorKey() : s.successorName(), diff);
        if (s.gaps() != null && !s.gaps().isEmpty()) {
            List<String> names = new ArrayList<>();
            for (String g : s.gaps()) names.add(g.startsWith("limit:") ? msg("gaps.limit", locale) : featureName.apply(g));
            line = line + " " + msg("gaps", locale, String.join(", ", names));
        }
        return line;
    }

    private String diffLine(Suggestion s, String currency, String interval, Locale locale) {
        String iv = intervalWord(interval, locale);
        return switch (s.priceDirection() == null ? "SAME" : s.priceDirection()) {
            case "LOWER" -> msg("diffLine.lower", locale, money(Math.abs(s.deltaMinor()), currency, locale), iv);
            case "HIGHER" -> msg("diffLine.higher", locale, money(Math.abs(s.deltaMinor()), currency, locale), iv);
            default -> msg("diffLine.same", locale);
        };
    }

    private String outcomeLine(Input in, Locale locale, String date) {
        String outcome = in.defaultOutcome() == null ? PlanRetirement.OUTCOME_FREE : in.defaultOutcome();
        if (PlanRetirement.OUTCOME_MIGRATE.equals(outcome) && in.suggestion() != null && !"FREE".equals(in.suggestion().kind())) {
            Suggestion s = in.suggestion();
            return msg("default.migrate", locale, date, s.successorName() == null ? s.successorKey() : s.successorName(), money(s.proposedMinor(), in.currency(), locale), intervalWord(in.interval(), locale));
        }
        if (PlanRetirement.OUTCOME_CANCEL.equals(outcome)) return msg("default.cancel", locale, date);
        return msg("default.free", locale, date);
    }

    /**
     * The name for the sentences that already say "plan" after it ("Your {0} plan is changing"): a plan named "Starter plan" would read "Your Starter plan plan",
     * so the closing word is dropped here and only here. A name that is nothing but "plan" stays as it is.
     */
    static String withoutTrailingPlan(String name) {
        if (name == null) return "";
        String t = name.trim();
        if (t.length() > 5 && t.regionMatches(true, t.length() - 5, " plan", 0, 5)) return t.substring(0, t.length() - 5).trim();
        return t;
    }

    /** "$19.99": the symbol of the currency when it has one, else the code; minor units are hundredths (every currency the catalog sells in today). */
    static String money(long minor, String currency, Locale locale) {
        BigDecimal amount = BigDecimal.valueOf(minor, 2);
        String code = currency == null || currency.isBlank() ? "USD" : currency;
        String symbol;
        try {
            symbol = Currency.getInstance(code).getSymbol(Locale.US);
        } catch (IllegalArgumentException e) {
            symbol = code + " ";
        }
        return symbol + amount.toPlainString();
    }

    private String intervalWord(String interval, Locale locale) {
        String key = interval == null ? "month" : switch (interval.toUpperCase(Locale.ROOT)) {
            case "QUARTER" -> "quarter";
            case "YEAR" -> "year";
            default -> "month";
        };
        return msg("interval." + key, locale);
    }

    /** The admin's markdown as calm plain text: emphasis marks and headings are dropped, links keep their address. Null for blank. */
    static String plain(String md) {
        if (md == null || md.isBlank()) return null;
        String t = md.trim();
        t = t.replaceAll("\\[([^\\]]+)\\]\\(([^)]+)\\)", "$1 ($2)");
        t = t.replaceAll("(?m)^#{1,6}\\s*", "");
        t = t.replace("**", "").replace("__", "").replace("`", "");
        t = t.replaceAll("(?m)^\\s*[*-]\\s+", "- ");
        t = t.replace("*", "");
        return t.length() > 2000 ? t.substring(0, 2000) : t;
    }

    private String msg(String key, Locale locale, Object... args) {
        return messages.getMessage(P + key, args, locale);
    }
}
