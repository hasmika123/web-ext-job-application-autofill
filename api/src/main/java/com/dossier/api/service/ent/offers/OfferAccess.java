package com.dossier.api.service.ent.offers;

import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.OrgStateRules;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Who may see and record offers: a seat holding {@code offers.manage} (the Account Manager, the Org Admin and the owner), organization wide. Everything
 * that fails (no key, a foreign tenant, a closed organization for a write) is the same generic 404, never a 403. The CONSULTANT answers an offer through
 * the consultant workspace ({@code offers.respond}); nothing on this side can accept or decline for them.
 */
@Component
public class OfferAccess {

    public static final String KEY_MANAGE = "offers.manage";

    public void requireRead(OrgMembership me) {
        if (!me.canKey(KEY_MANAGE)) throw new OrgNotFoundException();
    }

    public void requireWrite(OrgMembership me) {
        requireRead(me);
        if (!OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(KEY_MANAGE))) throw new OrgNotFoundException();
    }

    public boolean canWrite(OrgMembership me) {
        return me.canKey(KEY_MANAGE) && OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(KEY_MANAGE));
    }
}
