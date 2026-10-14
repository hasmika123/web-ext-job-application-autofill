package com.dossier.api.service.ent.mkt.activity;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ent.mkt.activity.MktActivityTypes.Group;
import com.dossier.api.service.ent.mkt.activity.MktActivityTypes.Type;
import org.junit.jupiter.api.Test;

/** The raw-kind to feed-type mapping of every source: pure functions, no I/O. */
class MktActivityTypesTest {

    @Test
    void resumeKinds() {
        assertThat(MktActivityTypes.resume("UPDATED")).isEqualTo(Type.RESUME_UPDATED);
        assertThat(MktActivityTypes.resume("CREATED")).isEqualTo(Type.RESUME_ADDED);
        assertThat(MktActivityTypes.resume("APPROVED")).isEqualTo(Type.RESUME_APPROVED);
        assertThat(MktActivityTypes.resume("APPROVAL_REQUESTED")).isEqualTo(Type.RESUME_APPROVAL_REQUESTED);
        assertThat(MktActivityTypes.resume("MARKED_FOR_UPDATE")).isEqualTo(Type.RESUME_FLAGGED);
        assertThat(MktActivityTypes.resume("???")).isNull();
        assertThat(MktActivityTypes.resume(null)).isNull();
    }

    @Test
    void submissionKindsFollowTheRecordedValue() {
        assertThat(MktActivityTypes.submission("APPROVAL_DECIDED", "APPROVED")).isEqualTo(Type.SUBMISSION_APPROVED);
        assertThat(MktActivityTypes.submission("APPROVAL_DECIDED", "REJECTED")).isEqualTo(Type.SUBMISSION_REJECTED);
        assertThat(MktActivityTypes.submission("APPROVAL_DECIDED", "PENDING")).isNull();
        assertThat(MktActivityTypes.submission("STATUS_RECORDED", "SUBMITTED")).isEqualTo(Type.CANDIDATE_SUBMITTED);
        assertThat(MktActivityTypes.submission("STATUS_RECORDED", "CLIENT_REVIEW")).isEqualTo(Type.SUBMISSION_CLIENT_REVIEW);
        assertThat(MktActivityTypes.submission("STATUS_RECORDED", "INTERVIEW_REQUESTED")).isEqualTo(Type.SUBMISSION_INTERVIEW_REQUESTED);
        assertThat(MktActivityTypes.submission("STATUS_RECORDED", "OTHER")).isEqualTo(Type.SUBMISSION_STATUS_RECORDED);
        assertThat(MktActivityTypes.submission("CREATED", null)).isEqualTo(Type.SUBMISSION_PREPARED);
        assertThat(MktActivityTypes.submission("WITHDRAWN", null)).isEqualTo(Type.SUBMISSION_WITHDRAWN);
    }

    @Test
    void followupInterviewAndOpportunityKinds() {
        assertThat(MktActivityTypes.followup("CALL_LOGGED", "x")).isEqualTo(Type.FOLLOWUP_LOGGED);
        assertThat(MktActivityTypes.followup("REMINDER_SENT", null)).isEqualTo(Type.FOLLOWUP_REMINDER);
        assertThat(MktActivityTypes.followup("STATUS_CHANGED", "IN_PROGRESS -> COMPLETED")).isEqualTo(Type.FOLLOWUP_COMPLETED);
        assertThat(MktActivityTypes.followup("STATUS_CHANGED", "PENDING -> WAITING")).isEqualTo(Type.FOLLOWUP_STATUS);
        assertThat(MktActivityTypes.interview("SLOT_CONFIRMED")).isEqualTo(Type.INTERVIEW_SCHEDULED);
        assertThat(MktActivityTypes.interview("FEEDBACK_RECORDED")).isEqualTo(Type.FEEDBACK_RECEIVED);
        assertThat(MktActivityTypes.interview("RESCHEDULE_PROPOSED")).isEqualTo(Type.INTERVIEW_RESCHEDULE_PROPOSED);
        assertThat(MktActivityTypes.interview("REMINDER_REQUESTED")).isEqualTo(Type.INTERVIEW_REMINDER);
        assertThat(MktActivityTypes.opportunity("ASSIGNED")).isEqualTo(Type.OPPORTUNITY_ASSIGNED);
        assertThat(MktActivityTypes.opportunity("INTEREST_CHANGED")).isEqualTo(Type.OPPORTUNITY_INTEREST_CHANGED);
        assertThat(MktActivityTypes.opportunity("UNKNOWN")).isNull();
    }

    @Test
    void applicationStageChangesMapByTheStageReached() {
        assertThat(MktActivityTypes.application("STAGE_CHANGE", "OFFER")).isEqualTo(Type.OFFER_RECEIVED);
        assertThat(MktActivityTypes.application("STAGE_CHANGE", "SUBMITTED")).isEqualTo(Type.CANDIDATE_SUBMITTED);
        assertThat(MktActivityTypes.application("STAGE_CHANGE", "ASSIGNED")).isEqualTo(Type.OPPORTUNITY_ASSIGNED);
        assertThat(MktActivityTypes.application("STAGE_CHANGE", "INTERVIEWING")).isEqualTo(Type.APPLICATION_MOVED);
        assertThat(MktActivityTypes.application("CREATED", null)).isEqualTo(Type.APPLICATION_ADDED);
        assertThat(MktActivityTypes.application("NOTE", null)).isEqualTo(Type.APPLICATION_NOTE);
        assertThat(MktActivityTypes.application("???", null)).isNull();
        assertThat(MktActivityTypes.stageLabel("INTERVIEWING")).isEqualTo("Interview");
        assertThat(MktActivityTypes.stageLabel("UNDER_REVIEW")).isEqualTo("Review");
    }

    @Test
    void groupsParseLeniently() {
        assertThat(Group.parse("follow-up")).contains(Group.FOLLOWUP);
        assertThat(Group.parse(" resume ")).contains(Group.RESUME);
        assertThat(Group.parse("nope")).isEmpty();
        assertThat(Group.parse(null)).isEmpty();
        assertThat(Group.FEEDBACK.summaryGroup()).isEqualTo(Group.INTERVIEW);
        assertThat(Group.RESUME.summaryGroup()).isEqualTo(Group.RESUME);
    }

    @Test
    void everyTypeHasACopyAndGroupAndManualTypesNeverClaimASubmissionToTheClient() {
        for (Type t : Type.values()) {
            assertThat(t.title).isNotBlank();
            assertThat(t.phrase).isNotBlank();
            assertThat(t.tag).isNotBlank();
            assertThat(t.group).isNotNull();
        }
        assertThat(Type.manualTypes()).doesNotContain(Type.CANDIDATE_SUBMITTED, Type.PLACEMENT_CONFIRMED, Type.SUBMISSION_APPROVED);
    }
}
