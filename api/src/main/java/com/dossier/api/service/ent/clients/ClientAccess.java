package com.dossier.api.service.ent.clients;

import com.dossier.api.service.dto.ent.ClientDTO;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.OrgStateRules;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Who may do what on the Clients page. Clients are the organization's demand data, so the permissions are organization-level
 * (talent-foundation.md section 4): <b>view</b> needs {@code clients.view}; <b>add or edit</b> a client, its contacts and notes needs
 * {@code clients.manage}; the drawer's "Create Requirement" is the Jobs page's action and needs {@code requirements.manage}. Everything
 * that fails is the generic 404 (never 403): not holding the key, roles not read from data, a closed organization for a write,
 * another tenant's row.
 */
@Component
public class ClientAccess {

    public static final String KEY_VIEW = "clients.view";
    public static final String KEY_MANAGE = "clients.manage";
    public static final String KEY_REQUIREMENTS = "requirements.manage";

    private final OrgRoleService roles;

    public ClientAccess(OrgRoleService roles) {
        this.roles = roles;
    }

    public void requireView(OrgMembership me) {
        if (me == null || !roles.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        if (!me.canKey(KEY_VIEW)) throw new OrgNotFoundException();
    }

    public void requireManage(OrgMembership me) {
        requireView(me);
        if (!me.canKey(KEY_MANAGE)) throw new OrgNotFoundException();
        if (!OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(KEY_MANAGE))) throw new OrgNotFoundException();
    }

    public ClientDTO.Access access(OrgMembership me) {
        boolean writable = OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(KEY_MANAGE));
        boolean reqWritable = OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(KEY_REQUIREMENTS));
        return new ClientDTO.Access(me.canKey(KEY_MANAGE) && writable, me.canKey(KEY_REQUIREMENTS) && reqWritable);
    }
}
