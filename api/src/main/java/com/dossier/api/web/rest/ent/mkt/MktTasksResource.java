package com.dossier.api.web.rest.ent.mkt;

import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.ActionResult;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Calendar;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.CreateRequest;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Option;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Query;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.ReassignRequest;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Tab;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.UpdateRequest;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.View;
import com.dossier.api.service.ent.mkt.tasks.MktTasksService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Marketing workspace Tasks page (`/w/marketing/tasks`). Permission {@code followups.manage}, ASSIGNED scope: a marketer sees and changes the tasks
 * they own (anyone else, anything else: the generic 404). Writes only RECORD (E1): nothing here emails anyone or submits for a consultant.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/mkt/tasks")
@Tag(name = "mkt-tasks", description = "Marketing workspace: tasks, KPIs, calendar and deadlines (record-only writes).")
public class MktTasksResource {

    private final MktTasksService service;

    public MktTasksResource(MktTasksService service) {
        this.service = service;
    }

    @Operation(
        summary = "The Tasks board (one call)",
        description = "{generatedAt, wide, kpis[total, overdue, dueThisWeek, completedThisWeek], tabs{all,my,team,overdue,dueThisWeek,completed}, tasks{items,total,page,size}, upcoming[4], options}. tab = ALL|MY|TEAM|OVERDUE|DUE_WEEK|COMPLETED; filters category, priority, status, owner (member id or me), due (yyyy-MM-dd), q; sort = dueAt|priority|title|status|owner|related[,desc]; size cap 100. 404 without followups.manage."
    )
    @GetMapping
    @OrgPermissionRequired
    public View get(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestParam(defaultValue = "ALL") Tab tab,
        @RequestParam(required = false) String category,
        @RequestParam(required = false) String priority,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String owner,
        @RequestParam(required = false) String due,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int size,
        @RequestParam(required = false) String sort
    ) {
        return service.view(me, new Query(tab, category, priority, status, owner, due, q, page, size, sort));
    }

    @Operation(summary = "The Calendar card's month", description = "month = yyyy-MM (default this month). The days that have tasks, with the highest priority of each.")
    @GetMapping("/calendar")
    @OrgPermissionRequired
    public Calendar calendar(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @RequestParam(required = false) String month) {
        return service.calendar(me, month);
    }

    @Operation(summary = "Marketers a task can be handed to", description = "The marketer and backup of the task's consultant (any marketer when it has none), except the current owner.")
    @GetMapping("/{id}/assignees")
    @OrgPermissionRequired
    public List<Option> assignees(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.assignees(me, id);
    }

    @Operation(summary = "Add a task", description = "Record only. 404 when the consultant, client or the chosen owner is not yours to use.")
    @PostMapping
    @OrgPermissionRequired
    public ActionResult create(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @Valid @RequestBody CreateRequest body) {
        return service.create(me, body);
    }

    @Operation(summary = "Edit a task", description = "Only the fields sent change. status COMPLETED stamps completed_at; moving a completed task to another status reopens it.")
    @PatchMapping("/{id}")
    @OrgPermissionRequired
    public ActionResult update(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @Valid @RequestBody UpdateRequest body) {
        return service.update(me, id, body);
    }

    @Operation(summary = "Mark a task complete")
    @PostMapping("/{id}/complete")
    @OrgPermissionRequired
    public ActionResult complete(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.complete(me, id);
    }

    @Operation(summary = "Reopen a completed task")
    @PostMapping("/{id}/reopen")
    @OrgPermissionRequired
    public ActionResult reopen(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.reopen(me, id);
    }

    @Operation(summary = "Hand a task to another marketer", description = "The new owner must be able to see the task's consultant. Anyone else is the generic 404.")
    @PostMapping("/{id}/reassign")
    @OrgPermissionRequired
    public ActionResult reassign(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id, @Valid @RequestBody ReassignRequest body) {
        return service.reassign(me, id, body.ownerMemberId());
    }

    @Operation(summary = "Delete one of your own open tasks", description = "Someone else's task is 404; a completed task is refused (422).")
    @DeleteMapping("/{id}")
    @OrgPermissionRequired
    public ActionResult delete(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long id) {
        return service.delete(me, id);
    }
}
