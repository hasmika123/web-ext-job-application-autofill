package com.dossier.api.web.rest.ent.consultantws;

import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO;
import com.dossier.api.service.ent.consultantws.ConsultantTasksService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consultant workspace Tasks and Follow-ups: the caller's OWN tasks. 404 for anyone who is not a consultant of this organization and for a task
 * that is not theirs. The tasks are the same {@code cws_task} rows the Home page shows.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/me-workspace/tasks")
@Tag(name = "consultant-workspace", description = "The signed-in consultant's own workspace (never another member's data).")
public class ConsultantTasksResource {

    private final ConsultantTasksService service;

    public ConsultantTasksResource(ConsultantTasksService service) {
        this.service = service;
    }

    private static ConsultantTasksService.Query query(String tab, String type, String priority, String assignedBy, String due, String q, String sort, String dir, Integer page, Integer size) {
        return new ConsultantTasksService.Query(tab, type, priority, assignedBy, due, q, sort, dir, page, size);
    }

    @Operation(summary = "Tasks and Follow-ups page", description = "Tiles, the filtered and sorted page of tasks with tab counts, Today's Focus, upcoming deadlines, insights and reminders.")
    @GetMapping
    @OrgPermissionRequired
    public ConsultantTasksDTO.Response page(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String tab,
        @RequestParam(required = false) String type,
        @RequestParam(required = false) String priority,
        @RequestParam(required = false) String assignedBy,
        @RequestParam(required = false) String due,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) String dir,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.page(me, query(tab, type, priority, assignedBy, due, q, sort, dir, page, size));
    }

    @Operation(summary = "The task table", description = "One filtered, sorted page of the caller's tasks (page size 1 to 50) with the tab counts.")
    @GetMapping("/list")
    @OrgPermissionRequired
    public ConsultantTasksDTO.TaskPage list(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(required = false) String tab,
        @RequestParam(required = false) String type,
        @RequestParam(required = false) String priority,
        @RequestParam(required = false) String assignedBy,
        @RequestParam(required = false) String due,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) String sort,
        @RequestParam(required = false) String dir,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return service.list(me, query(tab, type, priority, assignedBy, due, q, sort, dir, page, size));
    }

    @Operation(summary = "Create a task", description = "Title 3 to 200 characters (scanned for sensitive data), optional due date, priority, type and one of the caller's own jobs.")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @OrgPermissionRequired
    public ConsultantTasksDTO.Row create(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestBody(required = false) ConsultantTasksDTO.TaskRequest body) {
        return service.create(me, body);
    }

    @Operation(summary = "Edit a task", description = "Replaces the title, due date, priority, type and linked job of one of the caller's own tasks.")
    @PutMapping("/{id}")
    @OrgPermissionRequired
    public ConsultantTasksDTO.Row update(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long id,
        @RequestBody(required = false) ConsultantTasksDTO.TaskRequest body
    ) {
        return service.update(me, id, body);
    }

    @Operation(summary = "Change a task's status", description = "NOT_STARTED, IN_PROGRESS, PENDING or DONE. DONE records completed_at. Idempotent.")
    @PutMapping("/{id}/status")
    @OrgPermissionRequired
    public ConsultantTasksDTO.Row status(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable long id,
        @RequestBody(required = false) ConsultantTasksDTO.StatusRequest body
    ) {
        return service.setStatus(me, id, body == null ? null : body.status());
    }

    @Operation(summary = "Delete a task", description = "Deletes one of the caller's own tasks. The page's undo window is client-side: the call is sent when the window ends.")
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @OrgPermissionRequired
    public void delete(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable long id) {
        service.delete(me, id);
    }
}
