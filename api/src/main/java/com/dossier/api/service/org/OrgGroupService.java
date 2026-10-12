package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.org.OrgGroupDTO;
import com.dossier.api.service.dto.org.OrgGroupRequest;
import com.dossier.api.service.privacy.SensitiveContent;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Departments, cohorts and teams of one org (tenant-model.md section 2.3): a unique name per org, powering the
 * "Departments" donut and the analytics group filter. Every call is scoped by the {@link OrgMembership} the access
 * check produced, never by a bare group id: a group id from another org is a 404. Every mutation writes one audit row.
 * Deleting a group detaches its members (the foreign keys null their {@code group_id}); it never removes a person.
 */
@Service
public class OrgGroupService {

    static final int NAME_MAX = 80;
    static final int SORT_MAX = 9999;

    private final OrgGroupRepository groups;
    private final OrgMemberRepository members;
    private final OrgAuditService audit;

    public OrgGroupService(OrgGroupRepository groups, OrgMemberRepository members, OrgAuditService audit) {
        this.groups = groups;
        this.members = members;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<OrgGroupDTO> list(OrgMembership me) {
        return groups.findByOrgIdOrderBySortOrderAscNameAsc(me.orgId()).stream().map(this::dto).toList();
    }

    @Transactional
    public OrgGroupDTO create(OrgMembership me, OrgGroupRequest req) {
        requireOpen(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        String name = cleanName(req.name());
        if (groups.existsByOrgIdAndName(me.orgId(), name)) throw OrgException.groupNameTaken(name);

        OrgGroup g = new OrgGroup();
        g.setOrgId(me.orgId());
        g.setName(name);
        g.setKind(req.kind() == null ? OrgGroupKind.TEAM : req.kind());
        g.setSortOrder(req.sortOrder() == null ? (int) Math.min(SORT_MAX, groups.countByOrgId(me.orgId())) : cleanSort(req.sortOrder()));
        try {
            g = groups.saveAndFlush(g);
        } catch (DataIntegrityViolationException e) { // lost a race for the same name
            throw OrgException.groupNameTaken(name);
        }
        audit.record(me, OrgAuditService.GROUP_CREATE, OrgAuditService.TARGET_GROUP, null, g.getId().toString(), "name=" + name + " kind=" + g.getKind());
        return dto(g);
    }

    @Transactional
    public OrgGroupDTO update(OrgMembership me, Long groupId, OrgGroupRequest req) {
        requireOpen(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        OrgGroup g = groups.findByOrgIdAndId(me.orgId(), groupId).orElseThrow(OrgNotFoundException::new);
        StringBuilder changed = new StringBuilder();
        if (req.name() != null) {
            String name = cleanName(req.name());
            if (!name.equals(g.getName())) {
                // a case-only rename is the same row under the case-insensitive unique key, so it is not a clash
                if (!name.equalsIgnoreCase(g.getName()) && groups.existsByOrgIdAndName(me.orgId(), name)) throw OrgException.groupNameTaken(name);
                g.setName(name);
                changed.append("name,");
            }
        }
        if (req.kind() != null && req.kind() != g.getKind()) {
            g.setKind(req.kind());
            changed.append("kind,");
        }
        if (req.sortOrder() != null && req.sortOrder() != g.getSortOrder()) {
            g.setSortOrder(cleanSort(req.sortOrder()));
            changed.append("sortOrder,");
        }
        if (changed.length() > 0) {
            try {
                g = groups.saveAndFlush(g);
            } catch (DataIntegrityViolationException e) {
                throw OrgException.groupNameTaken(g.getName());
            }
            audit.record(me, OrgAuditService.GROUP_UPDATE, OrgAuditService.TARGET_GROUP, null, g.getId().toString(), "fields=" + changed.substring(0, changed.length() - 1));
        }
        return dto(g);
    }

    @Transactional
    public void delete(OrgMembership me, Long groupId) {
        requireOpen(me);
        OrgGroup g = groups.findByOrgIdAndId(me.orgId(), groupId).orElseThrow(OrgNotFoundException::new);
        long detached = members.countByOrgIdAndGroupIdAndStatusIn(me.orgId(), g.getId(), OrgMemberStatus.LIVE);
        groups.deleteByOrgIdAndId(me.orgId(), g.getId());
        audit.record(me, OrgAuditService.GROUP_DELETE, OrgAuditService.TARGET_GROUP, null, g.getId().toString(), "name=" + g.getName() + " members=" + detached);
    }

    // ---- helpers ------------------------------------------------------------------------------------------------

    private static void requireOpen(OrgMembership me) {
        if (me.orgStatus() == OrgStatus.CLOSED) throw OrgException.notEditable("This organization is closed and read-only");
    }

    private OrgGroupDTO dto(OrgGroup g) {
        return new OrgGroupDTO(g.getId(), g.getName(), g.getKind(), g.getSortOrder(), members.countByOrgIdAndGroupIdAndStatusIn(g.getOrgId(), g.getId(), OrgMemberStatus.LIVE));
    }

    static String cleanName(String raw) {
        String name = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (name.isEmpty()) throw OrgException.invalid("name", "is required");
        if (name.length() > NAME_MAX) throw OrgException.invalid("name", "must be at most " + NAME_MAX + " characters");
        SensitiveContent.check("name", "name", name);
        return name;
    }

    private static int cleanSort(Integer sort) {
        if (sort < 0 || sort > SORT_MAX) throw OrgException.invalid("sortOrder", "must be between 0 and " + SORT_MAX);
        return sort;
    }
}
