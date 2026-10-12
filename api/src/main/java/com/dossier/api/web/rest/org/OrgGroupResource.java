package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.org.OrgGroupDTO;
import com.dossier.api.service.dto.org.OrgGroupRequest;
import com.dossier.api.service.org.OrgGroupService;
import com.dossier.api.service.org.OrgMembership;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Departments, cohorts and teams of an org (tenant-model.md section 5, {@code groups CRUD}). Listing needs
 * {@code member.view_summary} (the roles that look at people: OWNER, ADMIN, STAFF, MARKETER); changing groups needs
 * {@code groups.manage} (OWNER, ADMIN). A group id from another org is a 404.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/groups")
public class OrgGroupResource {

    private final OrgGroupService groupService;
    private final DemoGuard demoGuard;

    public OrgGroupResource(OrgGroupService groupService, DemoGuard demoGuard) {
        this.groupService = groupService;
        this.demoGuard = demoGuard;
    }

    @GetMapping
    @OrgPermissionRequired(OrgPermission.MEMBER_VIEW_SUMMARY)
    public List<OrgGroupDTO> list(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return groupService.list(me);
    }

    @PostMapping
    @OrgPermissionRequired(OrgPermission.GROUPS_MANAGE)
    public ResponseEntity<OrgGroupDTO> create(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @RequestBody OrgGroupRequest request
    ) {
        demoGuard.assertNotDemo();
        OrgGroupDTO created = groupService.create(me, request);
        return ResponseEntity.created(URI.create("/api/orgs/" + me.orgId() + "/groups/" + created.id())).body(created);
    }

    @PatchMapping("/{groupId}")
    @OrgPermissionRequired(OrgPermission.GROUPS_MANAGE)
    public OrgGroupDTO update(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long groupId,
        @RequestBody OrgGroupRequest request
    ) {
        demoGuard.assertNotDemo();
        return groupService.update(me, groupId, request);
    }

    @DeleteMapping("/{groupId}")
    @OrgPermissionRequired(OrgPermission.GROUPS_MANAGE)
    public ResponseEntity<Void> delete(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long groupId) {
        demoGuard.assertNotDemo();
        groupService.delete(me, groupId);
        return ResponseEntity.noContent().build();
    }
}
