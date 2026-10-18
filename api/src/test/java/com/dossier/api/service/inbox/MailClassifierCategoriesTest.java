package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.inbox.MailClassifier.Category;
import com.dossier.api.service.inbox.MailClassifier.Effect;
import org.junit.jupiter.api.Test;

/** Recruiter outreach, closed roles, assessment reminders and bulk mail - and what each category may do. */
class MailClassifierCategoriesTest {

    private static MailClassifier.Reading read(String subject, String body, String fromName) {
        return MailClassifier.read(subject, body, fromName);
    }

    @Test
    void theEffectTableSaysWhatEachCategoryMayDo() {
        for (Category c : new Category[] { Category.APPLIED, Category.IN_REVIEW, Category.INTERVIEW, Category.ASSESSMENT, Category.REJECTED, Category.OFFER }) {
            assertThat(c.effect()).isEqualTo(Effect.STATUS);
            assertThat(c.mayChangeStatus()).isTrue();
        }
        assertThat(Category.RECRUITER_OUTREACH.effect()).isEqualTo(Effect.SUGGESTION_ONLY);
        assertThat(Category.APPLICATION_CLOSED.effect()).isEqualTo(Effect.TIMELINE_ONLY);
        assertThat(Category.ASSESSMENT_REMINDER.effect()).isEqualTo(Effect.TIMELINE_ONLY);
        assertThat(Category.NEWSLETTER.effect()).isEqualTo(Effect.NONE);
        assertThat(Category.ALERT.effect()).isEqualTo(Effect.NONE);
        assertThat(Category.OTHER.effect()).isEqualTo(Effect.NONE);
    }

    @Test
    void onlyStatusCategoriesCanEverMoveAnApplication() {
        for (Category c : Category.values()) {
            if (c.mayChangeStatus()) continue;
            for (ApplicationStatus s : ApplicationStatus.values()) {
                assertThat(MailMatcher.next(s, c)).as("%s from %s", c, s).isNull();
            }
        }
    }

    @Test
    void aRecruiterWhoFoundThePersonIsOutreach() {
        MailClassifier.Reading r = read(
            "Backend role at Initech",
            "Hi Sam, I came across your profile and your background caught my eye. I'm a technical recruiter at Initech and we have a role that might be a good fit. Open to a quick chat?",
            "Pat Lee"
        );
        assertThat(r.category()).isEqualTo(Category.RECRUITER_OUTREACH);
        assertThat(r.ambiguous()).isFalse();
    }

    @Test
    void outreachNeedsNoApplicationInTheMail() {
        // Same recruiter wording, but the person applied: this is about their application, not a cold approach.
        MailClassifier.Reading r = read("Your application to Initech", "Thank you for applying. I'm a recruiter at Initech and I'd love to chat about next steps.", "Pat Lee");
        assertThat(r.category()).isNotEqualTo(Category.RECRUITER_OUTREACH);
    }

    @Test
    void aClosedRoleIsNotARejection() {
        assertThat(read("Update on the Data Analyst role", "The position has been filled and we are no longer accepting applications.", "Globex Careers").category()).isEqualTo(
            Category.APPLICATION_CLOSED
        );
        assertThat(read("Role closed", "We have closed this role. Thank you for your interest in Globex.", "Globex Careers").category()).isEqualTo(Category.APPLICATION_CLOSED);
        assertThat(read("Hiring paused", "Hiring for this role has been paused.", "Globex").category()).isEqualTo(Category.APPLICATION_CLOSED);
    }

    @Test
    void aFilledRoleInsideARealRejectionStaysARejection() {
        assertThat(read("Update on your application", "We regret to inform you that the position has been filled.", null).category()).isEqualTo(Category.REJECTED);
        assertThat(read("Your application", "We have decided not to move forward as the position has been filled.", null).category()).isEqualTo(Category.REJECTED);
    }

    @Test
    void anAssessmentReminderIsNotANewAssessment() {
        assertThat(read("Reminder: complete your assessment", "Hi Sam, a friendly reminder that your HackerRank assessment for Acme expires tomorrow.", "Acme Careers").category()).isEqualTo(
            Category.ASSESSMENT_REMINDER
        );
        assertThat(read("Your coding challenge", "You haven't started your coding challenge yet. It expires in 2 days.", "Acme").category()).isEqualTo(Category.ASSESSMENT_REMINDER);
    }

    @Test
    void anAssessmentInvitationStaysAssessmentEvenWithADeadline() {
        MailClassifier.Reading r = read("Your assessment for Acme", "Please complete the HackerRank coding challenge by Friday, May 8. The deadline is firm.", "Acme Careers");
        assertThat(r.category()).isEqualTo(Category.ASSESSMENT);
    }

    @Test
    void newslettersAndDigestsAreNotJobMail() {
        assertThat(read("Your weekly digest", "Top stories this week. Unsubscribe | Manage preferences", "Career Weekly").category()).isEqualTo(Category.ALERT);
        assertThat(read("Jobs you may like", "Backend Engineer at Stripe and 12 more. Unsubscribe here.", "JobBoard").category()).isEqualTo(Category.ALERT);
        assertThat(read("Job alert: Java Developer", "5 new matches for your search. Manage your email preferences.", "Indeed").category()).isEqualTo(Category.ALERT);
        assertThat(read("Spring sale: 40% off courses", "Learn something new. Unsubscribe at any time.", "LearnCo").category()).isEqualTo(Category.NEWSLETTER);
        assertThat(read("Our newsletter", "News from the team. You are receiving this email because you subscribed. Unsubscribe.", "Team").category()).isEqualTo(Category.NEWSLETTER);
    }

    @Test
    void anUnsubscribeFooterDoesNotHideARealJobMail() {
        assertThat(read("Thank you for applying to Acme", "We received your application. Unsubscribe from updates.", "Acme").category()).isEqualTo(Category.APPLIED);
        assertThat(read("Your application to Acme", "We have decided not to move forward. Manage preferences.", "Acme").category()).isEqualTo(Category.REJECTED);
        assertThat(read("Let's schedule an interview", "Could we schedule an interview on Tuesday? Unsubscribe.", "Acme Recruiting").category()).isEqualTo(Category.INTERVIEW);
    }
}
