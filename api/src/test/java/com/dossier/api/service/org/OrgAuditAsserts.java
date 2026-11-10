package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

/**
 * Shared test helper for the rule "every mutating org endpoint writes exactly one audit row"
 * (tenant-model.md section 7.5): snapshot the count, make the call, then assert one new row with the action.
 */
public final class OrgAuditAsserts {

    private OrgAuditAsserts() {}

    /** The org's rows, newest first. */
    public static List<OrgAuditEvent> rows(OrgAuditEventRepository repo, Long orgId) {
        return repo.findByOrgId(orgId, PageRequest.of(0, 500, Sort.by(Sort.Direction.DESC, "id"))).getContent();
    }

    /** Asserts that {@code orgId} gained exactly one row since {@code before} and that it carries {@code action}. */
    public static OrgAuditEvent assertOneNewRow(OrgAuditEventRepository repo, Long orgId, long before, String action) {
        assertThat(repo.countByOrgId(orgId)).as("audit rows for org " + orgId).isEqualTo(before + 1);
        OrgAuditEvent newest = rows(repo, orgId).get(0);
        assertThat(newest.getAction()).isEqualTo(action);
        return newest;
    }

    /** Asserts that {@code orgId} gained no row since {@code before} (a refused or read-only call). */
    public static void assertNoNewRow(OrgAuditEventRepository repo, Long orgId, long before) {
        assertThat(repo.countByOrgId(orgId)).as("audit rows for org " + orgId).isEqualTo(before);
    }
}
