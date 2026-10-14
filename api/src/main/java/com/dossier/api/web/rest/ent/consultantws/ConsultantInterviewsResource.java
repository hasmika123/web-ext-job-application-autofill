package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantInterviewsDTO;
import com.dossier.api.service.ent.consultantws.ConsultantInterviewsService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Consultant workspace Interviews: the caller's OWN interviews. 404 for anyone who is not a consultant of this organization, and for an interview that is not theirs. */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/interviews")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantInterviewsResource {

    private final ConsultantInterviewsService service;

    public ConsultantInterviewsResource(ConsultantInterviewsService service) {
        this.service = service;
    }

    @Operation(summary = "Interviews page", description = "Tiles, the upcoming interviews, the calendar entries and the recent feedback, all for the caller's own consultant record.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantInterviewsDTO.Response page(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return service.page(me);
    }

    @Operation(summary = "One interview", description = "The interview with the consultant's own join details and feedback, for one of the caller's own interviews.")
    @GetMapping("/{interviewId}")
    @OrgPermissionRequired
    public ConsultantInterviewsDTO.Detail detail(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long interviewId) {
        return service.detail(me, interviewId);
    }

    @Operation(
        summary = "Save how you join",
        description = "Replaces the mode (VIDEO, ONSITE, PHONE), the https meeting link, the interviewer's title and the preparation note of one of the caller's own scheduled interviews. Free text is scanned for sensitive data. Never creates or moves an interview."
    )
    @PutMapping("/{interviewId}/detail")
    @OrgPermissionRequired
    public ConsultantInterviewsDTO.Detail saveDetail(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long interviewId,
        @RequestBody ConsultantInterviewsDTO.DetailRequest body
    ) {
        return service.saveDetail(me, interviewId, body);
    }

    @Operation(summary = "Record feedback", description = "What the consultant heard after one of their own completed interviews (outcome and a short summary, scanned for sensitive data). Once per interview; edit it with PUT.")
    @PostMapping("/{interviewId}/feedback")
    @OrgPermissionRequired
    public ConsultantInterviewsDTO.Detail addFeedback(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long interviewId,
        @RequestBody ConsultantInterviewsDTO.FeedbackRequest body
    ) {
        return service.addFeedback(me, interviewId, body);
    }

    @Operation(summary = "Edit feedback")
    @PutMapping("/{interviewId}/feedback")
    @OrgPermissionRequired
    public ConsultantInterviewsDTO.Detail editFeedback(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long interviewId,
        @RequestBody ConsultantInterviewsDTO.FeedbackRequest body
    ) {
        return service.editFeedback(me, interviewId, body);
    }
}
