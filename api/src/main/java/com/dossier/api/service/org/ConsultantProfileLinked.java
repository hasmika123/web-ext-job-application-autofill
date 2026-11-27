package com.dossier.api.service.org;

/** Published after a consultant profile is linked to an organization seat so existing personal applications can be replayed. */
public record ConsultantProfileLinked(Long orgId, Long memberId) {
    public boolean valid() {
        return orgId != null && memberId != null;
    }
}
