package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.inbox.MailClassifier.Category;
import org.junit.jupiter.api.Test;

/** Reading job emails by rules (Phase 14.4a), on the wording hiring systems' templates use. */
class MailClassifierTest {

    private static MailClassifier.Reading read(String subject, String body, String fromName) {
        return MailClassifier.read(subject, body, fromName);
    }

    @Test
    void confirmations() {
        MailClassifier.Reading gh = read(
            "Thank you for applying to Acme",
            "Hi Sam,\nThanks for applying to the Senior Backend Engineer position at Acme. Our team will review your application.",
            "Acme Hiring Team"
        );
        assertThat(gh.category()).isEqualTo(Category.APPLIED);
        assertThat(gh.ambiguous()).isFalse();
        assertThat(gh.company()).isEqualTo("Acme");
        assertThat(gh.role()).isEqualTo("Senior Backend Engineer");

        assertThat(read("Application received", "We have received your application for Data Analyst.", "Globex Careers").category()).isEqualTo(
            Category.APPLIED
        );
    }

    @Test
    void rejections() {
        MailClassifier.Reading r = read(
            "Your application to Initech",
            "Thank you for your interest in Initech. After careful review, we have decided not to move forward with your application at this time.",
            null
        );
        assertThat(r.category()).isEqualTo(Category.REJECTED);
        assertThat(r.ambiguous()).isFalse();
        assertThat(r.company()).isEqualTo("Initech");

        assertThat(read("Update on your application", "We regret to inform you that the position has been filled.", null).category()).isEqualTo(
            Category.REJECTED
        );
        assertThat(
            read("Hooli", "We decided to move forward with other candidates whose experience more closely matches.", null).category()
        ).isEqualTo(Category.REJECTED);
    }

    @Test
    void interviewsAndAssessments() {
        MailClassifier.Reading i = read(
            "Next steps with Pied Piper",
            "Hi Sam, we would love to chat! Please share your availability for a 30-minute phone screen: https://calendly.com/pp/screen",
            "Monica from Pied Piper"
        );
        assertThat(i.category()).isEqualTo(Category.INTERVIEW);
        assertThat(i.ambiguous()).isFalse();

        assertThat(read("Your coding challenge", "Please complete the HackerRank assessment within 5 days.", null).category()).isEqualTo(
            Category.ASSESSMENT
        );
    }

    @Test
    void offers() {
        assertThat(read("Offer letter - Wayne Enterprises", "We are pleased to offer you the role of Product Designer.", null).category()).isEqualTo(
            Category.OFFER
        );
    }

    @Test
    void alertsAreNotAboutAnApplication() {
        MailClassifier.Reading a = read("30+ new jobs for you", "Jobs you may be interested in: Backend Engineer at Stripe", "LinkedIn Job Alerts");
        assertThat(a.category()).isEqualTo(Category.ALERT);
        assertThat(a.ambiguous()).isFalse();
    }

    @Test
    void contradictionsAndSilenceGoToTheModel() {
        // "Unfortunately" + an interview: rescheduling, not a rejection.
        MailClassifier.Reading reschedule = read(
            "Interview time",
            "Unfortunately I need to move our interview. Could you share your availability?",
            null
        );
        assertThat(reschedule.category()).isEqualTo(Category.INTERVIEW);
        assertThat(reschedule.ambiguous()).isTrue();

        // Mentioning a past interview doesn't blur a clear rejection…
        MailClassifier.Reading after = read("Following your interview", "After your interview, we have decided not to move forward.", null);
        assertThat(after.category()).isEqualTo(Category.REJECTED);
        assertThat(after.ambiguous()).isFalse();
        // …but a rejection that also asks to schedule one contradicts itself.
        assertThat(
            read("Update", "We will not be moving forward for the Designer role, but would like to schedule a call about another one.", null).ambiguous()
        ).isTrue();

        // Nothing the rules know.
        MailClassifier.Reading quiet = read("Quick question", "Hi Sam, are you open to relocating to Denver?", "Jane at Acme");
        assertThat(quiet.category()).isEqualTo(Category.OTHER);
        assertThat(quiet.ambiguous()).isTrue();
    }

    @Test
    void theCompanyCanComeFromTheSendersName() {
        assertThat(MailClassifier.companyFrom("Quick question", "Hello", "Globex Recruiting via Greenhouse")).isEqualTo("Globex");
        assertThat(MailClassifier.companyFrom("Quick question", "Hello", "Jane")).isNull();
    }
}
