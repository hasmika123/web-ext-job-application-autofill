package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.ent.members.EnterpriseAccountRetention;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The end of an offboarded person's enterprise account (decision O4, docs/enterprise-v2/19 phase S8): the export an administrator hands over while the
 * account is still kept, and the early erase. Both need {@code members.remove} at a scope that reaches the person, answer the generic 404 for anyone
 * else's seat, and are 409 {@code NO_ENTERPRISE_ACCOUNT} unless the seat has ended and holds an enterprise account of this organization (a legacy
 * personal-account seat is never exported or erased here). The scheduled retention job does the same erase on its own after
 * {@code org.account.retentionDays}.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/members/{memberId}")
@Tag(name = "members", description = "Employees: the directory, KPI tiles, detail sheet, single edits, bulk actions and the lifecycle.")
public class OrgMemberAccountResource {

    private final EnterpriseAccountRetention retention;
    private final DemoGuard demoGuard;

    public OrgMemberAccountResource(EnterpriseAccountRetention retention, DemoGuard demoGuard) {
        this.retention = retention;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Export an offboarded person's organization account",
        description = "members.remove. A JSON copy of that one enterprise account's data (profile, resumes, applications, notifications; the mailbox connection without any secret), " +
            "for the administrator to hand to the person who can no longer sign in. Only while the account still exists (before the retention job erases it). 404 for a seat the caller cannot reach; " +
            "409 NO_ENTERPRISE_ACCOUNT unless the seat has ended and holds an enterprise account of this organization. Audit ACCOUNT_EXPORTED, risk HIGH."
    )
    @GetMapping("/account-export")
    @OrgPermissionRequired
    public ResponseEntity<Map<String, Object>> exportMemberAccount(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long memberId) {
        demoGuard.assertNotDemo();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(retention.export(me, memberId));
    }

    @Operation(
        summary = "Erase an offboarded person's organization account now",
        description = "members.remove. Erases that one enterprise account and its data before the retention window ends (the person's request); the seat stays as an anonymised history row. " +
            "404 for a seat the caller cannot reach; 409 NO_ENTERPRISE_ACCOUNT unless the seat has ended and holds an enterprise account of this organization. Audit ACCOUNT_ERASED, risk HIGH."
    )
    @PostMapping("/account-erase")
    @OrgPermissionRequired
    public ResponseEntity<Void> eraseMemberAccount(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long memberId) {
        demoGuard.assertNotDemo();
        retention.erase(me, memberId);
        return ResponseEntity.noContent().build();
    }
}
