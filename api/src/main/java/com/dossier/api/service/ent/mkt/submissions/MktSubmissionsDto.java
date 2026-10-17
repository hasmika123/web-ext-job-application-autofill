package com.dossier.api.service.ent.mkt.submissions;

import com.dossier.api.service.dto.ChangeActorDTO;
import java.time.Instant;
import java.util.List;

/**
 * The wire shapes of the Marketing Submissions page (`/api/orgs/{orgId}/mkt/submissions`). One GET draws the whole board; the writes return the
 * changed row. E1: nothing here describes sending anything to a client; a submission is a record the marketer prepares and the consultant approves.
 */
public final class MktSubmissionsDto {

    private MktSubmissionsDto() {}

    /** A KPI tile: the number, the percent change against the comparison window (null = nothing to compare), and the last eight buckets. */
    public record Kpi(long value, Double deltaPct, List<Long> sparkline) {}

    public record Kpis(Kpi pendingApprovals, Kpi submittedToday, Kpi underClientReview, Kpi rejected) {}

    public record Person(Long id, String name, String role, String avatarUrl) {}

    public record Job(Long id, String title, String code) {}

    public record ClientRef(Long id, String name) {}

    /** {@code version} is "v3.2"; {@code updatedOn} the resume's last change when the package was prepared. {@code usingApprovedVersion} (X7.4): true when the resume is still approved, not stale, and this package was prepared with the approved version; false when it was edited since or is awaiting approval again; null when it cannot be told. */
    public record ResumeRef(Long id, String version, Instant updatedOn, Boolean usingApprovedVersion) {}

    /**
     * One table row. {@code bucket} is the Submissions-by-Status slice the row belongs to (AWAITING_APPROVAL while the approval is open, else its status).
     * {@code actions} lists what the caller may record on it now: REQUEST_APPROVAL, WITHDRAW, RECORD_APPROVAL, RECORD_STATUS (empty = view only).
     */
    public record Row(
        Long id, String code, Person consultant, Job job, ClientRef client, Instant submissionDate, String approvalState, ResumeRef resume,
        String status, String bucket, List<String> actions, Instant updatedAt, ChangeActorDTO updatedBy
    ) {}

    public record Bucket(String key, String label, long count, int pct) {}

    public record Breakdown(String period, long total, List<Bucket> buckets) {}

    /** {@code kind}: SUBMITTED, CLIENT_REVIEW, INTERVIEW, REJECTED, APPROVAL, DRAFT (picks the icon). */
    public record Activity(Long id, Long submissionId, String kind, String text, String detail, Instant at) {}

    public record FilterOptions(List<ClientRef> clients, List<String> jobTitles) {}

    public record SavedView(Long id, String name, String q, String status, String approval, Long clientId, String jobTitle, String period) {}

    public record BoardResponse(
        Kpis kpis, List<Row> items, long total, int page, int size, Breakdown breakdown, List<Activity> activity, FilterOptions filters, List<SavedView> views
    ) {}

    public record Event(Long id, String kind, String field, String from, String to, String detail, Instant at) {}

    public record Detail(Row row, String note, List<Event> events) {}

    /** What "New Submission" can pick from: the consultants the caller is assigned to and the open jobs. */
    public record OptionJob(Long id, String title, String code, String client) {}

    public record Options(List<Person> consultants, List<OptionJob> jobs) {}

    /** The board's list query. All fields are optional except paging, which is already clamped. */
    public record Query(String q, String status, String approval, Long clientId, String jobTitle, String period, String donutPeriod, String sort, String dir, int page, int size) {}

    public record CreateRequest(Long consultantId, Long requirementId, Long resumeId, String note) {}

    /** {@code status}: SUBMITTED, CLIENT_REVIEW, INTERVIEW_REQUESTED or REJECTED; a recorded fact, never an action on the client. */
    public record StatusRequest(String status, String note) {}

    /** {@code decision}: APPROVED or REJECTED, as the consultant/approver told the marketer. */
    public record ApprovalRequest(String decision, String note) {}

    public record ViewRequest(String name, String q, String status, String approval, Long clientId, String jobTitle, String period) {}
}
