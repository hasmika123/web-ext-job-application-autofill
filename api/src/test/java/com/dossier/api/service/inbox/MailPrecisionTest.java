package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.inbox.InboxDecisionPolicy.Outcome;
import com.dossier.api.service.inbox.MailClassifier.Category;
import com.dossier.api.service.inbox.MailEvent.MatchKind;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * 27 synthetic mails (all companies, people and ids are fictional) read the way the parser reads them: classify,
 * rank the applications, build the {@link MailEvent}, ask the default policy (apply at 80, hold from 50). Each pins the
 * category, how the application was found, and what would happen.
 */
class MailPrecisionTest {

    private static final Instant T0 = Instant.parse("2026-10-01T09:00:00Z");
    private static long ids = 0;

    private static Application acmeBe, acmePm, globex, initech, umbrella;
    private static List<Application> apps;

    private static Application app(String company, String role, String atsId, String url, boolean archived, Instant created) {
        Application a = new Application().company(company).roleTitle(role).status(ApplicationStatus.APPLIED).createdAt(created);
        a.setId(++ids);
        a.setArchived(archived);
        a.setExternalJobId(atsId);
        a.setJobUrl(url);
        return a;
    }

    @BeforeAll
    static void fixtures() {
        acmeBe = app("Acme, Inc.", "Backend Engineer", "R-48213", "https://boards.greenhouse.io/acme/jobs/4412", false, T0);
        acmePm = app("Acme, Inc.", "Product Manager", null, "https://boards.greenhouse.io/acme/jobs/4413", false, T0);
        globex = app("Globex", "Designer", "A12", "https://jobs.lever.co/globex/77aa-11", false, T0);
        initech = app("Initech", "Data Analyst", null, null, false, T0);
        umbrella = app("Umbrella", "Security Engineer", null, null, true, T0);
        apps = List.of(acmeBe, acmePm, globex, initech, umbrella);
    }

    private record Mail(
        String name,
        String from,
        String fromName,
        String subject,
        String body,
        Long threadApp,
        boolean ai,
        Category category,
        MatchKind kind,
        Outcome outcome,
        Long app
    ) {}

    private static Mail mail(String name, String from, String fromName, String subject, String body, Category c, MatchKind k, Outcome o, Application a) {
        return new Mail(name, from, fromName, subject, body, null, false, c, k, o, a == null ? null : a.getId());
    }

    private static Mail threaded(Mail m, Application thread) {
        return new Mail(m.name, m.from, m.fromName, m.subject, m.body, thread.getId(), m.ai, m.category, m.kind, m.outcome, m.app);
    }

    private static List<Mail> corpus() {
        List<Mail> c = new ArrayList<>();
        c.add(mail("01 greenhouse receipt names company and role", "no-reply@us.greenhouse-mail.io", "Acme Hiring Team", "Thank you for applying to Acme",
            "We received your application for the Backend Engineer position at Acme.", Category.APPLIED, MatchKind.COMPANY_ROLE, Outcome.APPLY, acmeBe));
        c.add(mail("02 ats id in the body", "no-reply@myworkday.com", "Workday", "We got your application",
            "Thank you for applying. We received your application. Your reference is R-48213.", Category.APPLIED, MatchKind.ATS_ID, Outcome.APPLY, acmeBe));
        c.add(mail("03 lower-case ats id still counts", "jobs@smartrecruiters.com", "Careers", "Application received",
            "Your application has been received. Ref r-48213 for your records.", Category.APPLIED, MatchKind.ATS_ID, Outcome.APPLY, acmeBe));
        c.add(mail("04 job link with tracking noise", "no-reply@greenhouse.io", "Greenhouse", "Application received",
            "Your application has been received: https://boards.greenhouse.io/acme/jobs/4413?utm_source=mail", Category.APPLIED, MatchKind.JOB_LINK, Outcome.APPLY, acmePm));
        c.add(mail("05 job link of a different posting does not match", "no-reply@greenhouse.io", "Acme Recruiting", "Application received",
            "Your application has been received: https://boards.greenhouse.io/acme/jobs/9999", Category.APPLIED, MatchKind.AMBIGUOUS, Outcome.HOLD, null));
        c.add(mail("06 rejection from the company's own domain", "jane@globex.com", "Jane Doe", "Update on your Globex application",
            "We regret to inform you we decided to move forward with other candidates.", Category.REJECTED, MatchKind.COMPANY, Outcome.APPLY, globex));
        c.add(mail("07 interview invite names the role", "no-reply@hire.lever.co", "Globex", "Interview invitation - Designer at Globex",
            "We would love to speak with you. Please share your availability.", Category.INTERVIEW, MatchKind.COMPANY_ROLE, Outcome.APPLY, globex));
        c.add(mail("08 two acme roles and no role named is never guessed", "no-reply@greenhouse.io", "Acme Recruiting", "An update on your Acme application",
            "We have decided not to move forward with your candidacy.", Category.REJECTED, MatchKind.AMBIGUOUS, Outcome.HOLD, null));
        c.add(mail("09 two acme roles, the subject names one", "no-reply@greenhouse.io", "Acme Recruiting", "Your Product Manager application at Acme",
            "We have decided not to move forward with your candidacy.", Category.REJECTED, MatchKind.COMPANY_ROLE, Outcome.APPLY, acmePm));
        c.add(mail("10 offer from the company domain", "hr@initech.com", "Initech HR", "Your offer from Initech",
            "We are pleased to offer you the position. Your offer details are attached below.", Category.OFFER, MatchKind.COMPANY, Outcome.APPLY, initech));
        c.add(threaded(mail("11 reply in a known thread from a private address", "recruiter@gmail.com", "Sam Roe", "Re: our chat",
            "We would like to schedule a call with you next week.", Category.INTERVIEW, MatchKind.THREAD, Outcome.APPLY, initech), initech));
        c.add(mail("12 job alert digest", "jobs-noreply@linkedin.com", "LinkedIn", "New jobs for you",
            "Recommended jobs: weekly digest of jobs matching your profile.", Category.ALERT, MatchKind.NONE, Outcome.IGNORE, null));
        c.add(mail("13 vague recruiter note", "sam@example.org", "Sam", "An opportunity",
            "Unfortunately I have no details yet.", Category.OTHER, MatchKind.NONE, Outcome.IGNORE, null));
        c.add(mail("14 invite from a company with no tracked application", "talent@hooli.com", "Hooli Talent", "Interview invitation",
            "We would love to speak with you about the role.", Category.INTERVIEW, MatchKind.NONE, Outcome.IGNORE, null));
        c.add(mail("15 archived application is never matched", "people@umbrella.com", "Umbrella People", "Your Umbrella application",
            "We regret to inform you that we decided to move forward with other candidates.", Category.REJECTED, MatchKind.NONE, Outcome.IGNORE, null));
        c.add(mail("16 under review from the display name", "no-reply@icims.com", "Initech Recruiting", "Application status",
            "Your application is currently under review by the hiring team.", Category.IN_REVIEW, MatchKind.COMPANY, Outcome.APPLY, initech));
        c.add(mail("17 company only in the subject is held", "no-reply@hackerrank.com", "HackerRank", "Initech coding challenge",
            "Complete the assessment within 7 days.", Category.ASSESSMENT, MatchKind.COMPANY, Outcome.HOLD, initech));
        c.add(mail("18 an ats id that is too short is not an id", "hr@globex.com", "Globex", "Quick note about A12",
            "We are pleased to offer you a place on the team. Offer letter attached.", Category.OFFER, MatchKind.COMPANY, Outcome.APPLY, globex));
        c.add(mail("19 offer and rejection in one mail needs a reader", "hr@globex.com", "Globex", "Your application",
            "We are pleased to offer you a trial. We regret to inform you the full role is filled.", Category.OTHER, MatchKind.COMPANY, Outcome.IGNORE, globex));
        c.add(mail("20 display-name company with a strong subject", "hi@example.com", "Globex Recruiting", "Interview invitation",
            "We would love to speak with you about the role.", Category.INTERVIEW, MatchKind.COMPANY, Outcome.APPLY, globex));
        c.add(mail("21 display-name company with a weak subject is held", "hi@example.com", "Globex Recruiting", "Hello",
            "We would love to speak with you about the role.", Category.INTERVIEW, MatchKind.COMPANY, Outcome.HOLD, globex));
        c.add(threaded(mail("22 ats id and thread disagree", "no-reply@myworkday.com", "Workday", "Application update",
            "We have decided not to move forward. Reference R-48213.", Category.REJECTED, MatchKind.AMBIGUOUS, Outcome.HOLD, null), globex));
        c.add(mail("23 a bare company address is not a job link", "no-reply@greenhouse.io", "Greenhouse", "Application received",
            "Your application has been received. See https://acme.com for more.", Category.APPLIED, MatchKind.NONE, Outcome.IGNORE, null));
        c.add(mail("24 ats sender that names no company", "no-reply@greenhouse-mail.io", "Greenhouse", "Hello",
            "We have decided not to move forward with your application.", Category.REJECTED, MatchKind.NONE, Outcome.IGNORE, null));
        c.add(mail("25 assessment with company in the display name", "no-reply@codesignal.com", "Initech Recruiting", "Your Initech assessment",
            "Please take the coding challenge within 5 days.", Category.ASSESSMENT, MatchKind.COMPANY, Outcome.APPLY, initech));
        c.add(mail("26 a decision from an unknown sender is held even when the match is sure", "someone@example.net", "Someone", "Your Backend Engineer application at Acme",
            "We are not moving forward with your application.", Category.REJECTED, MatchKind.COMPANY_ROLE, Outcome.HOLD, acmeBe));
        Mail ai = mail("27 a model-only reading from an unknown sender is held", "someone@example.net", "Initech Careers", "News",
            "Some words the rules cannot read.", Category.INTERVIEW, MatchKind.COMPANY, Outcome.HOLD, initech);
        c.add(new Mail(ai.name, ai.from, ai.fromName, ai.subject, ai.body, null, true, ai.category, ai.kind, ai.outcome, ai.app));
        return c;
    }

    @Test
    void everyMailIsReadAndMatchedAsExpected() {
        SoftAssertions soft = new SoftAssertions();
        List<Mail> corpus = corpus();
        assertThat(corpus.size()).isGreaterThanOrEqualTo(25);
        for (Mail c : corpus) {
            InboxMessage m = new InboxMessage();
            m.setFromAddress(c.from());
            m.setFromName(c.fromName());
            m.setSubject(c.subject());
            m.setBodyText(c.body());
            MailClassifier.Reading r = MailClassifier.read(c.subject(), c.body(), c.fromName());
            Category category = c.ai() ? c.category() : r.category();
            m.setClassifiedBy(c.ai() ? "AI" : "RULE");
            MailMatcher.Ranking rk = MailMatcher.rank(
                apps,
                new MailMatcher.Facts(r.company(), r.role(), c.subject(), c.body(), c.from(), c.fromName(), "me@gmail.com", c.threadApp())
            );
            MailEvent e = InboxParser.event(m, category, rk);
            Outcome outcome = r.ambiguous() && !c.ai() ? Outcome.IGNORE : DefaultInboxDecisionPolicy.decide(e, 80, 50).outcome();
            String id = c.name();
            soft.assertThat(category).as(id + " category").isEqualTo(c.category());
            soft.assertThat(e.matchKind()).as(id + " match kind").isEqualTo(c.kind());
            soft.assertThat(outcome).as(id + " outcome (confidence " + e.confidence() + ")").isEqualTo(c.outcome());
            soft.assertThat(e.matchedApplicationId()).as(id + " application").isEqualTo(c.app());
            soft.assertThat(e.evidence().length()).as(id + " evidence length").isLessThanOrEqualTo(MailEvent.MAX_EVIDENCE);
            soft.assertThat(e.evidence()).as(id + " evidence has no address").doesNotContain("@");
        }
        soft.assertAll();
    }
}
