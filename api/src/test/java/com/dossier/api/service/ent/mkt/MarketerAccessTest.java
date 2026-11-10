package com.dossier.api.service.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.ent.mkt.MarketerAccess.Area;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** The O5 behaviour of the seam: an assigned (or ORG-scope) caller sees every area of a consultant they reach; everyone else is the generic 404. */
class MarketerAccessTest {

    private final MarketerAccess access = new MarketerAccess();

    @Test
    void anAssignedConsultantIsAllowedInEveryArea() {
        MktScope.View view = new MktScope.View(1L, 5L, false, Set.of(10L));
        for (Area area : Area.values()) assertThat(access.allows(view, 10L, area)).as(area.name()).isTrue();
    }

    @Test
    void anUnassignedConsultantIsNeverAllowed() {
        MktScope.View view = new MktScope.View(1L, 5L, false, Set.of(10L));
        for (Area area : Area.values()) assertThat(access.allows(view, 11L, area)).as(area.name()).isFalse();
        assertThatThrownBy(() -> access.require(view, 11L, Area.APPLICATIONS)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void anOrgScopeHolderSeesEveryoneAndNullsAreRefused() {
        MktScope.View all = new MktScope.View(1L, 5L, true, Set.of());
        assertThat(access.allows(all, 99L, Area.RESUMES)).isTrue();
        assertThat(access.allows(null, 10L, Area.RESUMES)).isFalse();
        assertThat(access.allows(all, null, Area.RESUMES)).isFalse();
        assertThat(access.allows(all, 10L, null)).isFalse();
    }
}
