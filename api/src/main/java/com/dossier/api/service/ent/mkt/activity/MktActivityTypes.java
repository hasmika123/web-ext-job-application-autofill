package com.dossier.api.service.ent.mkt.activity;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * The vocabulary of the Activities feed: every line is one {@link Type} and every type belongs to one {@link Group} (the filter, the second-level chip and
 * the "Activity Summary by Type" row). The mapping functions turn a raw event kind of an existing source table into a type; an unknown kind of a source is
 * skipped (never shown as a guess). Pure functions, no I/O.
 */
public final class MktActivityTypes {

    private MktActivityTypes() {}

    /** Filter / chip groups. {@code summary} is the group whose "Activity Summary by Type" row it is counted in (feedback counts under Interviews). */
    public enum Group {
        RESUME("Resume", "Resume Updates", null, "resume"),
        OPPORTUNITY("Opportunity", "Opportunities", null, "opportunity"),
        SUBMISSION("Submission", "Submissions", null, "submission"),
        FOLLOWUP("Follow-up", "Client Follow-ups", null, "followup"),
        INTERVIEW("Interview", "Interviews", null, "interview"),
        FEEDBACK("Feedback", "Interviews", "INTERVIEW", "feedback"),
        APPLICATION("Application", "Applications", null, "application"),
        OFFER("Offer", "Offers", null, "offer"),
        PLACEMENT("Placement", "Placements", null, "placement");

        public final String label;
        public final String summaryLabel;
        private final String summaryKey;
        public final String icon;

        Group(String label, String summaryLabel, String summaryKey, String icon) {
            this.label = label;
            this.summaryLabel = summaryLabel;
            this.summaryKey = summaryKey;
            this.icon = icon;
        }

        /** The group this one is counted under in the summary and the KPI tiles. */
        public Group summaryGroup() {
            return summaryKey == null ? this : valueOf(summaryKey);
        }

        public static Optional<Group> parse(String raw) {
            if (raw == null || raw.isBlank()) return Optional.empty();
            String k = raw.strip().toUpperCase(Locale.ROOT).replaceAll("[-_ ]", "");
            return Arrays.stream(values()).filter(g -> g.name().replace("_", "").equals(k)).findFirst();
        }
    }

    /** Feed line types. {@code manual} types can be written with "Log Activity"; the others only ever come from the source records. */
    public enum Type {
        RESUME_ADDED(Group.RESUME, "Resume Added", "Resume added to the library", "Profile", false),
        RESUME_UPDATED(Group.RESUME, "Resume Updated", "Updated resume", "Profile", true),
        RESUME_APPROVAL_REQUESTED(Group.RESUME, "Resume Approval Requested", "Asked for approval of the resume", "Approval", false),
        RESUME_APPROVED(Group.RESUME, "Resume Approved", "Resume approved", "Approval", false),
        RESUME_FLAGGED(Group.RESUME, "Resume Marked for Update", "Flagged as needing an update", "Profile", false),
        OPPORTUNITY_ADDED(Group.OPPORTUNITY, "Opportunity Added", "Added as an opportunity", "Marketing", false),
        OPPORTUNITY_ASSIGNED(Group.OPPORTUNITY, "Opportunity Assigned", "Assigned to new opportunity", "Marketing", true),
        OPPORTUNITY_REVIEWED(Group.OPPORTUNITY, "Opportunity Reviewed", "Reviewed opportunity", "Marketing", false),
        OPPORTUNITY_INTEREST_REQUESTED(Group.OPPORTUNITY, "Interest Requested", "Asked the consultant for their interest", "Marketing", false),
        OPPORTUNITY_INTEREST_CHANGED(Group.OPPORTUNITY, "Interest Updated", "Consultant interest changed", "Marketing", false),
        OPPORTUNITY_RESUME_REQUESTED(Group.OPPORTUNITY, "Resume Requested", "Asked the consultant for an updated resume", "Marketing", false),
        SUBMISSION_PREPARED(Group.SUBMISSION, "Submission Prepared", "Draft submission prepared", "Draft", true),
        SUBMISSION_APPROVAL_REQUESTED(Group.SUBMISSION, "Submission Sent for Approval", "Asked the consultant to approve", "Approval", false),
        SUBMISSION_APPROVED(Group.SUBMISSION, "Consultant Approved Submission", "Approved to submit to client", "Approval", false),
        SUBMISSION_REJECTED(Group.SUBMISSION, "Consultant Declined Submission", "Declined by the consultant", "Approval", false),
        CANDIDATE_SUBMITTED(Group.SUBMISSION, "Candidate Submitted to Client", "Submitted profile for consideration", "Client", false),
        SUBMISSION_CLIENT_REVIEW(Group.SUBMISSION, "Client Reviewing Submission", "In client review", "Client", false),
        SUBMISSION_INTERVIEW_REQUESTED(Group.SUBMISSION, "Client Requested Interview", "The client asked for an interview", "Client", false),
        SUBMISSION_STATUS_RECORDED(Group.SUBMISSION, "Submission Status Recorded", "Status recorded", "Status", false),
        SUBMISSION_WITHDRAWN(Group.SUBMISSION, "Submission Withdrawn", "Submission withdrawn", "Withdrawn", false),
        FOLLOWUP_LOGGED(Group.FOLLOWUP, "Recruiter Follow-up Logged", "Call logged", "Client Call", true),
        FOLLOWUP_REMINDER(Group.FOLLOWUP, "Follow-up Reminder Recorded", "Reminder request recorded", "Reminder", false),
        FOLLOWUP_COMPLETED(Group.FOLLOWUP, "Follow-up Completed", "Follow-up completed", "Client Call", false),
        FOLLOWUP_STATUS(Group.FOLLOWUP, "Follow-up Updated", "Status changed", "Status", false),
        INTERVIEW_SCHEDULED(Group.INTERVIEW, "Interview Scheduled", "Interview slot confirmed", "Scheduling", true),
        INTERVIEW_RESCHEDULE_PROPOSED(Group.INTERVIEW, "Reschedule Proposed", "New interview time proposed", "Scheduling", false),
        INTERVIEW_REMINDER(Group.INTERVIEW, "Interview Reminder Requested", "Reminder request recorded", "Reminder", false),
        FEEDBACK_RECEIVED(Group.FEEDBACK, "Interview Feedback Received", "Feedback recorded", "Debrief", true),
        APPLICATION_ADDED(Group.APPLICATION, "Application Added", "Application added to the pipeline", "Pipeline", false),
        APPLICATION_MOVED(Group.APPLICATION, "Application Moved", "Moved to the next stage", "Pipeline", true),
        APPLICATION_NOTE(Group.APPLICATION, "Application Note Added", "Note added", "Pipeline", false),
        OFFER_RECEIVED(Group.OFFER, "Offer Received", "Received written offer from client", "Success", true),
        PLACEMENT_CONFIRMED(Group.PLACEMENT, "Placement Confirmed", "Consultant started - position filled", "Closed", false);

        public final Group group;
        public final String title;
        public final String phrase;
        public final String tag;
        public final boolean manual;

        Type(Group group, String title, String phrase, String tag, boolean manual) {
            this.group = group;
            this.title = title;
            this.phrase = phrase;
            this.tag = tag;
            this.manual = manual;
        }

        public static Optional<Type> parse(String raw) {
            if (raw == null || raw.isBlank()) return Optional.empty();
            String k = raw.strip().toUpperCase(Locale.ROOT);
            return Arrays.stream(values()).filter(t -> t.name().equals(k)).findFirst();
        }

        public static List<Type> manualTypes() {
            return Arrays.stream(values()).filter(t -> t.manual).toList();
        }
    }

    // ---- per source: raw kind -> type (null = not an activity, skip) ------------------------------------------------------

    public static Type resume(String kind) {
        if (kind == null) return null;
        return switch (kind) {
            case "CREATED" -> Type.RESUME_ADDED;
            case "UPDATED" -> Type.RESUME_UPDATED;
            case "APPROVAL_REQUESTED" -> Type.RESUME_APPROVAL_REQUESTED;
            case "APPROVED" -> Type.RESUME_APPROVED;
            case "MARKED_FOR_UPDATE" -> Type.RESUME_FLAGGED;
            default -> null;
        };
    }

    public static Type opportunity(String kind) {
        if (kind == null) return null;
        return switch (kind) {
            case "CREATED" -> Type.OPPORTUNITY_ADDED;
            case "ASSIGNED" -> Type.OPPORTUNITY_ASSIGNED;
            case "REVIEWED" -> Type.OPPORTUNITY_REVIEWED;
            case "INTEREST_REQUESTED" -> Type.OPPORTUNITY_INTEREST_REQUESTED;
            case "INTEREST_CHANGED" -> Type.OPPORTUNITY_INTEREST_CHANGED;
            case "RESUME_REQUESTED" -> Type.OPPORTUNITY_RESUME_REQUESTED;
            default -> null;
        };
    }

    /** {@code to} is the event's {@code to_value} (the approval decision or the recorded status). */
    public static Type submission(String kind, String to) {
        if (kind == null) return null;
        String t = to == null ? "" : to;
        return switch (kind) {
            case "CREATED" -> Type.SUBMISSION_PREPARED;
            case "APPROVAL_REQUESTED" -> Type.SUBMISSION_APPROVAL_REQUESTED;
            case "APPROVAL_DECIDED" -> "APPROVED".equals(t) ? Type.SUBMISSION_APPROVED : "REJECTED".equals(t) ? Type.SUBMISSION_REJECTED : null;
            case "STATUS_RECORDED" -> switch (t) {
                case "SUBMITTED" -> Type.CANDIDATE_SUBMITTED;
                case "CLIENT_REVIEW" -> Type.SUBMISSION_CLIENT_REVIEW;
                case "INTERVIEW_REQUESTED" -> Type.SUBMISSION_INTERVIEW_REQUESTED;
                default -> Type.SUBMISSION_STATUS_RECORDED;
            };
            case "WITHDRAWN" -> Type.SUBMISSION_WITHDRAWN;
            default -> null;
        };
    }

    /** {@code note} is the event's note: a status change is written "A -> B", so one that ends in COMPLETED is a completion. */
    public static Type followup(String kind, String note) {
        if (kind == null) return null;
        return switch (kind) {
            case "CALL_LOGGED" -> Type.FOLLOWUP_LOGGED;
            case "REMINDER_SENT" -> Type.FOLLOWUP_REMINDER;
            case "STATUS_CHANGED" -> note != null && note.endsWith("-> COMPLETED") ? Type.FOLLOWUP_COMPLETED : Type.FOLLOWUP_STATUS;
            default -> null;
        };
    }

    public static Type interview(String kind) {
        if (kind == null) return null;
        return switch (kind) {
            case "SLOT_CONFIRMED" -> Type.INTERVIEW_SCHEDULED;
            case "RESCHEDULE_PROPOSED" -> Type.INTERVIEW_RESCHEDULE_PROPOSED;
            case "FEEDBACK_RECORDED" -> Type.FEEDBACK_RECEIVED;
            case "REMINDER_REQUESTED" -> Type.INTERVIEW_REMINDER;
            default -> null;
        };
    }

    /** An application timeline event: a stage change maps by the stage it moved to. */
    public static Type application(String eventType, String toStage) {
        if (eventType == null) return null;
        return switch (eventType) {
            case "CREATED" -> Type.APPLICATION_ADDED;
            case "NOTE" -> Type.APPLICATION_NOTE;
            case "STAGE_CHANGE" -> {
                String s = toStage == null ? "" : toStage;
                yield switch (s) {
                    case "ASSIGNED" -> Type.OPPORTUNITY_ASSIGNED;
                    case "SUBMITTED" -> Type.CANDIDATE_SUBMITTED;
                    case "OFFER" -> Type.OFFER_RECEIVED;
                    default -> Type.APPLICATION_MOVED;
                };
            }
            default -> null;
        };
    }

    /** "Moved to Interview" style stage word for an application move. */
    public static String stageLabel(String stage) {
        if (stage == null) return null;
        return switch (stage) {
            case "UNDER_REVIEW" -> "Review";
            case "INTERVIEWING" -> "Interview";
            case "CLOSED" -> "Closed";
            case "SUBMITTED" -> "Submitted";
            case "OFFER" -> "Offer";
            case "ASSIGNED" -> "Assigned";
            default -> null;
        };
    }
}
