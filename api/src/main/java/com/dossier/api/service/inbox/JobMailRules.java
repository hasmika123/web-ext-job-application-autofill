package com.dossier.api.service.inbox;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Which mail is job mail (Phase 14.3) — the only mail whose body text Kiwiply keeps (user decision
 * 2026-09-22: headers for everything, body only for job mail). Deterministic, cheap, and generous
 * on purpose: 14.4 does the real reading, this only decides what is worth keeping to read. Job mail
 * is any of:
 *
 * <ul>
 *   <li><b>From a hiring system</b> — a known ATS or job-board sending domain (or, for sent mail,
 *       to one).</li>
 *   <li><b>About a tracked application</b> — the company's name appears in the other party's
 *       domain, name or the subject.</li>
 *   <li><b>A hiring subject</b> — "your application", "interview", "offer", "assessment"…</li>
 * </ul>
 */
public final class JobMailRules {

    /** Sending domains of ATSs and job boards; a sender at any subdomain of one counts. */
    static final Set<String> HIRING_DOMAINS = Set.of(
        "greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "ashbyhq.com", "myworkday.com", "workday.com",
        "myworkdayjobs.com", "icims.com", "smartrecruiters.com", "jobvite.com", "workablemail.com", "workable.com",
        "bamboohr.com", "taleo.net", "successfactors.com", "successfactors.eu", "recruitee.com", "breezy.hr",
        "applytojob.com", "jazzhr.com", "teamtailor.com", "teamtailor-mail.com", "personio.com", "personio.de",
        "rippling.com", "paylocity.com", "ultipro.com", "ukg.com", "dayforcehcm.com", "oraclecloud.com", "avature.net",
        "eightfold.ai", "gem.com", "hiringthing.com", "pinpointhq.com", "comeet.co", "hibob.com", "linkedin.com",
        "indeed.com", "indeedemail.com", "ziprecruiter.com", "glassdoor.com", "wellfound.com", "angel.co", "hired.com",
        "welcometothejungle.com", "otta.com", "dice.com", "monster.com", "hackerrank.com", "codesignal.com",
        "codility.com", "karat.com", "hirevue.com", "calendly.com", "goodtime.io", "modernhire.com"
    );

    private static final Pattern HIRING_SUBJECT = Pattern.compile(
        "(?i)\\b(your application|application (received|update|status)|thank(s| you) for (applying|your interest|your application)|" +
        "interview|phone screen|screening call|next steps|offer|assessment|take[- ]home|coding (challenge|exercise)|" +
        "position|candidacy|candidate|recruit\\w*|hiring (team|manager)|job opportunit\\w*|role at)\\b"
    );

    private JobMailRules() {}

    /**
     * @param counterparties the other side's addresses — the sender for inbound mail, the recipients
     *                       for sent mail
     * @param companies      the companies of the user's tracked applications
     */
    public static boolean isJobMail(Collection<String> counterparties, String fromName, String subject, Collection<String> companies) {
        List<String> domains = counterparties.stream().map(JobMailRules::domainOf).filter(d -> !d.isEmpty()).toList();
        for (String d : domains) if (isHiringDomain(d)) return true;
        String subj = subject == null ? "" : subject;
        if (HIRING_SUBJECT.matcher(subj).find()) return true;
        Set<String> names = companyKeys(companies);
        if (names.isEmpty()) return false;
        String haystack = norm(subj + " " + (fromName == null ? "" : fromName));
        for (String d : domains) haystack += " " + norm(d.replace('.', ' '));
        for (String n : names) if ((" " + haystack + " ").contains(" " + n + " ") || compact(haystack).contains(n.replace(" ", ""))) return true;
        return false;
    }

    static boolean isHiringDomain(String domain) {
        for (String h : HIRING_DOMAINS) if (domain.equals(h) || domain.endsWith("." + h)) return true;
        return false;
    }

    static String domainOf(String address) {
        if (address == null) return "";
        int at = address.lastIndexOf('@');
        return at < 0 ? "" : address.substring(at + 1).trim().toLowerCase(Locale.ROOT);
    }

    /** Company names worth matching: normalised, at least 3 letters, minus legal suffixes. */
    static Set<String> companyKeys(Collection<String> companies) {
        Set<String> out = new HashSet<>();
        for (String c : companies) {
            String n = norm(c).replaceAll("\\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|sa|ag|bv|the)\\b", " ").replaceAll("\\s+", " ").trim();
            if (n.replace(" ", "").length() >= 3) out.add(n);
        }
        return out;
    }

    private static String norm(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    private static String compact(String s) {
        return s.replace(" ", "");
    }
}
